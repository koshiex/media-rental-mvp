import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import { fixedClock } from '../src/domain/clock.js';
import { createApp } from '../src/http/app.js';
import { createMetrics } from '../src/http/metrics.js';
import { seedDatabase } from '../src/seed.js';
import { TODAY, day } from './helpers.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

let server;
let baseUrl;
let users;

async function call(path, { method = 'GET', user, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers['X-User-Id'] = String(user.id);
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text };
}

before(async () => {
  const db = openDatabase(':memory:');
  seedDatabase(db, TODAY);
  const app = createApp({ db, clock: fixedClock(TODAY), metrics: createMetrics(), publicDir: PUBLIC_DIR });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const list = (await call('/api/session/users')).body;
  users = Object.fromEntries(['recipient', 'staff', 'admin', 'manager'].map((role) => [role, list.find((u) => u.role === role)]));
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('HTTP API', () => {
  test('без выбранного пользователя API отвечает 401', async () => {
    const response = await call('/api/equipment');

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'unauthorized');
  });

  test('роль без права получает 403 (NFR-07)', async () => {
    const response = await call('/api/reports?from=2026-09-01&to=2026-09-28', { user: users.recipient });

    assert.equal(response.status, 403);
  });

  test('пересекающаяся заявка отклоняется с кодом 409 до сохранения (NFR-03)', async () => {
    const catalog = (await call('/api/equipment', { user: users.recipient })).body;
    const canon = catalog.find((item) => item.name === 'Canon EOS R6');

    const response = await call('/api/bookings', {
      method: 'POST', user: users.recipient,
      body: { equipmentId: canon.id, startDate: day(2), endDate: day(3), purpose: 'Съёмка' },
    });

    assert.equal(response.status, 409);
    assert.match(response.body.error.message, /уже забронировано/);
  });

  test('отдаёт статические файлы и не выпускает за пределы public', async () => {
    const index = await call('/');
    const traversal = await call('/..%2Fpackage.json');

    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(traversal.status, 404);
  });

  test('отклоняет некорректный JSON', async () => {
    const response = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST', headers: { 'X-User-Id': String(users.recipient.id) }, body: '{oops',
    });

    assert.equal(response.status, 400);
  });

  test('метрики SLA считают время ответа по маршрутам', async () => {
    const sla = (await call('/api/sla')).body;

    assert.ok(sla.overall.count > 0);
    assert.equal(sla.targets.responseMs, 500);
    assert.ok(sla.routes.some((route) => route.route === 'POST /api/bookings'));
  });
});
