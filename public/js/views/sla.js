import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, setHtml, toast } from '../ui.js';

const REFRESH_MS = 5000;
const LOAD_TEST_REQUESTS = 100;

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин ${seconds % 60} с`;
}

function targetsTable(targets) {
  const rows = [
    ['Время отклика обычных операций', `≤ ${targets.responseMs} мс`, 'Измеряется сервером по каждому запросу API'],
    ['Доступность основных функций', `≥ ${targets.availabilityPercent}% в окно ${targets.serviceWindow}`, 'Доля ответов без ошибок 5xx'],
    ['Нагрузка', `${targets.concurrentUsers} одновременных пользователей`, 'Кнопка «Нагрузочный прогон» вверху страницы'],
    ['Формирование уведомлений', `≤ ${targets.notificationSeconds} с после смены статуса`, 'В MVP — сразу, в той же транзакции'],
    ['Изменение прав', `≤ ${targets.rightsChangeMinutes} мин`, 'Права читаются при каждом запросе'],
    ['Резервное копирование', `ежедневно в ${targets.backupTime}; RPO ≤ ${targets.rpoHours} ч, RTO ≤ ${targets.rtoHours} ч`, 'Регламент эксплуатации'],
  ];
  return html`<table class="table"><thead><tr><th>Показатель</th><th>Цель</th><th>Как проверяется</th></tr></thead>
    <tbody>${rows.map(([name, goal, how]) => html`<tr><td>${name}</td><td><b>${goal}</b></td><td class="muted small">${how}</td></tr>`)}</tbody></table>`;
}

function statusTile(label, value, isOk, hint) {
  return html`<div class="stat card ${isOk ? 'stat-ok' : 'stat-bad'}">
    <span class="stat-status">${isOk ? '✓ в норме' : '✕ нарушение'}</span>
    <span class="stat-value">${value}</span><span class="stat-label">${label}</span><span class="muted small">${hint}</span></div>`;
}

function renderMetrics(box, sla, loadResult) {
  const { overall, targets } = sla;
  setHtml(box, html`
    <div class="stat-row">
      ${statusTile('p95 времени отклика', `${overall.p95} мс`, overall.p95 <= targets.responseMs, `цель ≤ ${targets.responseMs} мс`)}
      ${statusTile('запросов быстрее цели', `${overall.withinTargetPercent}%`, overall.withinTargetPercent >= 95, `медиана ${overall.p50} мс, максимум ${overall.max} мс`)}
      ${statusTile('доступность', `${sla.availabilityPercent}%`, sla.availabilityPercent >= targets.availabilityPercent, `ошибок 5xx: ${overall.serverErrors}`)}
      <div class="stat card"><span class="stat-value">${sla.totalRequests}</span><span class="stat-label">запросов с запуска</span>
        <span class="muted small">работает ${formatUptime(sla.uptimeSeconds)}</span></div>
    </div>
    ${loadResult ? html`<div class="note note-${loadResult.p95 <= targets.responseMs ? 'ok' : 'danger'}">
      <b>Нагрузочный прогон:</b> ${LOAD_TEST_REQUESTS} параллельных запросов каталога за ${loadResult.total} мс,
      p95 на клиенте ${loadResult.p95} мс, ошибок ${loadResult.errors}.</div>` : ''}
    <section class="card">
      <h2>Время отклика по методам API</h2>
      <table class="table compact">
        <thead><tr><th>Метод</th><th class="num">Запросов</th><th class="num">p50, мс</th><th class="num">p95, мс</th><th class="num">Макс., мс</th><th class="num">≤ цели</th></tr></thead>
        <tbody>${sla.routes.map((route) => html`<tr>
          <td class="mono small">${route.route}</td><td class="num">${route.count}</td><td class="num">${route.p50}</td>
          <td class="num ${route.p95 > targets.responseMs ? 'text-danger' : ''}">${route.p95}</td><td class="num">${route.max}</td>
          <td class="num">${route.withinTargetPercent}%</td></tr>`)}
        </tbody>
      </table>
    </section>`);
}

async function runLoadTest() {
  const startedAt = performance.now();
  const results = await Promise.all(Array.from({ length: LOAD_TEST_REQUESTS }, async () => {
    const t0 = performance.now();
    try {
      await api('/api/equipment');
      return { ms: performance.now() - t0, ok: true };
    } catch {
      return { ms: performance.now() - t0, ok: false };
    }
  }));
  const sorted = results.map((result) => result.ms).sort((a, b) => a - b);
  return {
    total: Math.round(performance.now() - startedAt),
    p95: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    errors: results.filter((result) => !result.ok).length,
  };
}

export async function render(el) {
  let loadResult = null;
  setHtml(el, html`
    <header class="page-header">
      <div><h1>SLA и мониторинг</h1><p class="muted">Целевые показатели сервиса и фактические измерения с момента запуска.</p></div>
      <button type="button" class="btn btn-primary" data-load>${icon('pulse')} Нагрузочный прогон: ${LOAD_TEST_REQUESTS} запросов</button>
    </header>
    <div data-metrics></div>
    <section class="card"><h2>Соглашение об уровне сервиса</h2><div data-targets></div></section>`);

  const box = el.querySelector('[data-metrics]');
  const update = async () => {
    const sla = await api('/api/sla');
    renderMetrics(box, sla, loadResult);
    setHtml(el.querySelector('[data-targets]'), targetsTable(sla.targets));
  };
  await update();
  const timer = setInterval(() => update().catch(() => {}), REFRESH_MS);

  el.onclick = async (event) => {
    const button = event.target.closest('[data-load]');
    if (!button) return;
    button.disabled = true;
    loadResult = await runLoadTest();
    toast(`Прогон завершён: p95 ${loadResult.p95} мс`);
    button.disabled = false;
    await update();
  };
  return () => clearInterval(timer);
}
