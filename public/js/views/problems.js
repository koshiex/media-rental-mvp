import { api, patch } from '../api.js';
import { PROBLEM_STATUS, TICKET_STATUS } from '../labels.js';
import { badge, emptyState, formatDateTime, html, setHtml, toast } from '../ui.js';

function problemCard(problem, canEdit) {
  return html`
    <article class="card problem">
      <div class="ticket-head"><span class="mono muted">Проблема №${problem.id}</span>
        ${canEdit ? html`<select data-problem="${problem.id}">${Object.entries(PROBLEM_STATUS).map(([value, entry]) => html`
          <option value="${value}" ${value === problem.status ? 'selected' : ''}>${entry.label}</option>`)}</select>`
    : badge(PROBLEM_STATUS[problem.status])}
        <span class="muted small">${formatDateTime(problem.createdAt)}</span></div>
      <h3>${problem.title}</h3>
      <dl class="props">
        <dt>Причина</dt><dd>${problem.cause}</dd>
        <dt>Влияние</dt><dd>${problem.impact}</dd>
      </dl>
      <h4>Связанные обращения</h4>
      <ul class="linked">${problem.tickets.map((ticket) => html`
        <li><span class="mono">№${ticket.id}</span> ${ticket.subject} <span class="muted">· ${ticket.user.name}</span> ${badge(TICKET_STATUS[ticket.status])}</li>`)}
      </ul>
    </article>`;
}

export async function render(el, { user, refresh }) {
  const problems = await api('/api/problems');
  const canEdit = user.role === 'support';
  setHtml(el, html`
    <header class="page-header">
      <div><h1>Проблемы ИС</h1><p class="muted">Повторяющиеся инциденты с описанием причины и влияния — основание для изменения системы.</p></div>
    </header>
    <div class="ticket-list">${problems.length
    ? problems.map((problem) => problemCard(problem, canEdit))
    : emptyState('Проблем не зарегистрировано', 'Выберите похожие обращения в разделе «Поддержка»')}</div>`);

  el.onchange = async (event) => {
    const select = event.target.closest('[data-problem]');
    if (!select) return;
    try {
      await patch(`/api/problems/${select.dataset.problem}`, { status: select.value });
      toast(`Проблема №${select.dataset.problem}: ${PROBLEM_STATUS[select.value].label.toLowerCase()}`);
    } catch (error) {
      toast(error.message, 'danger');
    }
    refresh();
  };
}
