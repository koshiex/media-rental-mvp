import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DomainError, notFound } from '../domain/errors.js';
import { findUser } from '../domain/users.js';
import { createRouter } from './router.js';
import { registerRoutes } from './routes.js';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const USER_ID_PATTERN = /^\d{1,9}$/;
const WRITE_METHODS = new Set(['POST', 'PATCH']);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

function sendJson(res, status, payload, startedAt) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Server-Timing': `app;dur=${(performance.now() - startedAt).toFixed(1)}`,
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new DomainError('payload_too_large', 'Слишком большой запрос (максимум 4 МБ)', 413);
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new DomainError('bad_json', 'Тело запроса должно быть JSON-объектом', 400);
  }
}

// Demo sign-in: the client picks a user and sends its id. Production would use university SSO.
function resolveActor(ctx, req) {
  const header = req.headers['x-user-id'];
  if (typeof header !== 'string' || !USER_ID_PATTERN.test(header)) return null;
  return findUser(ctx, Number(header));
}

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw notFound('Файл не найден');
  }
}

async function serveStatic(res, pathname, publicDir) {
  const relative = pathname === '/' ? 'index.html' : decodePath(pathname).replace(/^\/+/, '');
  const filePath = resolve(join(publicDir, normalize(relative)));
  if (!filePath.startsWith(publicDir + sep)) throw notFound('Файл не найден');
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw notFound('Файл не найден');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
}

function toErrorPayload(error) {
  if (error instanceof DomainError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, details: error.details } } };
  }
  console.error('[server] unexpected error', error);
  return { status: 500, body: { error: { code: 'internal', message: 'Внутренняя ошибка сервера' } } };
}

export function createApp({ db, clock, metrics, publicDir }) {
  const router = createRouter();
  registerRoutes(router);
  const ctx = { db, clock };
  const staticRoot = resolve(publicDir);

  return async function handle(req, res) {
    const startedAt = performance.now();
    const url = new URL(req.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');
    let routeKey = `${req.method} (неизвестный метод)`;
    try {
      if (!isApi) {
        await serveStatic(res, url.pathname, staticRoot);
        return;
      }
      const matched = router.match(req.method, url.pathname);
      if (!matched) throw notFound('Метод API не найден');
      routeKey = `${req.method} ${matched.route.pattern}`;
      const actor = resolveActor(ctx, req);
      if (!matched.route.public && !actor) {
        throw new DomainError('unauthorized', 'Выберите пользователя для входа', 401);
      }
      const body = WRITE_METHODS.has(req.method) ? await readJson(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const result = matched.route.handler({ ctx, actor, params: matched.params, query, body, metrics });
      sendJson(res, matched.route.status ?? 200, result ?? { ok: true }, startedAt);
    } catch (error) {
      const { status, body } = toErrorPayload(error);
      if (res.headersSent) {
        res.destroy();
      } else if (isApi) {
        sendJson(res, status, body, startedAt);
      } else {
        res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(body.error.message);
      }
    } finally {
      if (isApi) metrics.record(routeKey, performance.now() - startedAt, res.statusCode);
    }
  };
}
