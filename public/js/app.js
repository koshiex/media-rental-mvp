import { api, clearUserId, getUserId } from './api.js';
import { icon } from './icons.js';
import { HOME, matchRoute, navFor } from './routes.js';
import { errorState, html, initials, loading, setHtml } from './ui.js';
import { renderLogin } from './views/login.js';

const BELL_POLL_MS = 15_000;
const SLA_TARGET_MS = 500;

const appRoot = document.getElementById('app');
const session = { user: null, bellTimer: null, cleanup: null };

function parseHash() {
  const [path, search = ''] = (location.hash.slice(1) || '/').split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(search)) };
}

export function navigate(path, query = {}) {
  const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null));
  const target = `#${path}${search.toString() ? `?${search}` : ''}`;
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

async function refreshBell() {
  if (!session.user) return;
  try {
    const { unread } = await api('/api/notifications');
    const counter = document.querySelector('[data-bell-count]');
    if (!counter) return;
    counter.textContent = unread > 99 ? '99+' : String(unread);
    counter.hidden = unread === 0;
  } catch {
    // The bell is best-effort; the page itself reports connection errors.
  }
}

function showLatency({ detail }) {
  const box = document.querySelector('[data-latency]');
  if (!box) return;
  const ms = Math.round(detail.elapsed);
  box.className = `latency ${ms <= SLA_TARGET_MS ? 'latency-ok' : 'latency-bad'}`;
  box.textContent = `Отклик API: ${ms} мс · цель ≤ ${SLA_TARGET_MS} мс`;
}

function renderShell() {
  const { user } = session;
  const links = navFor(user.role).map((route) => html`
    <a class="nav-link" href="#${route.path}" data-path="${route.path}">${icon(route.icon)}<span>${route.label}</span></a>`);
  setHtml(appRoot, html`
    <div class="layout">
      <aside class="sidebar">
        <a class="brand" href="#${HOME[user.role]}">
          <span class="brand-mark">${icon('camera')}</span>
          <span><b>МедиаПрокат</b><small>MVP · медиапространство</small></span>
        </a>
        <nav class="nav">${links}</nav>
        <div class="sidebar-footer"><div class="latency" data-latency>Отклик API: —</div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-title" data-title></div>
          <div class="topbar-actions">
            <a class="bell" href="#/notifications" title="Уведомления">${icon('bell')}<span class="bell-count" data-bell-count hidden>0</span></a>
            <div class="user-chip">
              <span class="avatar">${initials(user.name)}</span>
              <span><b>${user.name}</b><small>${user.roleLabel}</small></span>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-logout>${icon('logout')} Сменить пользователя</button>
          </div>
        </header>
        <main class="view" data-view></main>
      </div>
    </div>`);
  appRoot.querySelector('[data-logout]').addEventListener('click', logout);
}

function resetViewHandlers(view) {
  for (const event of ['onclick', 'onchange', 'onsubmit', 'oninput']) view[event] = null;
}

async function renderRoute() {
  if (!session.user) return;
  const { path, query } = parseHash();
  const matched = matchRoute(path);
  if (!matched || !matched.route.roles.includes(session.user.role)) {
    navigate(HOME[session.user.role]);
    return;
  }
  session.cleanup?.();
  session.cleanup = null;
  const view = appRoot.querySelector('[data-view]');
  resetViewHandlers(view);
  appRoot.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', path === link.dataset.path || path.startsWith(`${link.dataset.path}/`));
  });
  appRoot.querySelector('[data-title]').textContent = matched.route.label;
  document.title = `${matched.route.label} — МедиаПрокат`;
  setHtml(view, loading());
  try {
    const cleanup = await matched.route.view.render(view, {
      user: session.user, params: matched.params, query, navigate, refresh: renderRoute, refreshBell,
    });
    session.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (error) {
    setHtml(view, errorState(error));
  }
  refreshBell();
}

function logout() {
  clearInterval(session.bellTimer);
  session.cleanup?.();
  session.user = null;
  clearUserId();
  history.replaceState(null, '', location.pathname);
  start();
}

async function start() {
  if (!getUserId()) {
    await renderLogin(appRoot, start);
    return;
  }
  try {
    session.user = await api('/api/me');
  } catch {
    clearUserId();
    await renderLogin(appRoot, start);
    return;
  }
  renderShell();
  clearInterval(session.bellTimer);
  session.bellTimer = setInterval(refreshBell, BELL_POLL_MS);
  if (!location.hash || location.hash === '#/') navigate(HOME[session.user.role]);
  else renderRoute();
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('api:timing', showLatency);
window.addEventListener('session:expired', () => {
  if (session.user) logout();
});

start().catch((error) => setHtml(appRoot, errorState(error)));
