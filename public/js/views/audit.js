import { api } from '../api.js';
import { ANY_STATUS, OBJECT_TYPES, ROLE_LABELS } from '../labels.js';
import { badge, emptyState, formatDateTime, html, setHtml } from '../ui.js';

function statusChange(entry) {
  if (!entry.newStatus) return '';
  const label = (status) => ANY_STATUS[`${entry.objectType}:${status}`] ?? { label: status, tone: 'muted' };
  return html`${entry.oldStatus ? html`${badge(label(entry.oldStatus))} → ` : ''}${badge(label(entry.newStatus))}`;
}

export async function render(el, { query, navigate }) {
  const filters = Object.fromEntries(['objectType', 'objectId'].filter((key) => query[key]).map((key) => [key, query[key]]));
  const entries = await api(`/api/audit?${new URLSearchParams(filters)}`);

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Журнал действий</h1>
        <p class="muted">Кто, что и когда сделал с заявками, техникой, обращениями и правами. Срок хранения — не меньше 365 дней (NFR-05).</p></div>
    </header>
    <div class="filters card">
      <select data-object-type>
        <option value="">Все объекты</option>
        ${Object.entries(OBJECT_TYPES).map(([value, label]) => html`<option value="${value}" ${value === filters.objectType ? 'selected' : ''}>${label}</option>`)}
      </select>
      ${filters.objectId ? html`<span class="tag tag-info">Объект №${filters.objectId}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-clear>Показать все</button>` : ''}
      <span class="muted small">Записей: ${entries.length}</span>
    </div>
    ${entries.length ? html`
      <div class="card table-card">
        <table class="table">
          <thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Объект</th><th>Статус</th><th>Детали</th></tr></thead>
          <tbody>${entries.map((entry) => html`
            <tr>
              <td class="nowrap small">${formatDateTime(entry.createdAt)}</td>
              <td><b>${entry.userName}</b><div class="muted small">${ROLE_LABELS[entry.userRole] ?? ''}</div></td>
              <td>${entry.action}</td>
              <td class="nowrap">${OBJECT_TYPES[entry.objectType]} <span class="mono">№${entry.objectId}</span></td>
              <td class="nowrap">${statusChange(entry)}</td>
              <td class="small">${entry.details}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>` : emptyState('Записей нет')}`);

  el.onchange = (event) => {
    const select = event.target.closest('[data-object-type]');
    if (select) navigate('/audit', { objectType: select.value });
  };
  el.onclick = (event) => {
    if (event.target.closest('[data-clear]')) navigate('/audit');
  };
}
