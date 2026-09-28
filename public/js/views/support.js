import { api, patch, post } from '../api.js';
import { BOOKING_STATUS, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from '../labels.js';
import { badge, emptyState, formValues, formatDateTime, html, openModal, setHtml, toast } from '../ui.js';

function newTicketModal(bookings, done) {
  openModal({
    title: 'Новое обращение в поддержку',
    submitLabel: 'Отправить',
    body: html`
      <label class="field"><span>Категория</span><select name="category">
        ${Object.entries(TICKET_CATEGORY).map(([value, label]) => html`<option value="${value}">${label}</option>`)}</select></label>
      <label class="field"><span>Связанная заявка (необязательно)</span><select name="bookingId">
        <option value="">Без заявки</option>
        ${bookings.map((booking) => html`<option value="${booking.id}">№${booking.id} · ${booking.equipment.name} · ${BOOKING_STATUS[booking.status].label}</option>`)}
      </select></label>
      <label class="field"><span>Тема</span><input name="subject" maxlength="150" required></label>
      <label class="field"><span>Что произошло</span><textarea name="description" rows="4" maxlength="2000" required></textarea></label>`,
    onSubmit: async (form) => {
      const ticket = await post('/api/tickets', formValues(form));
      toast(`Обращение №${ticket.id} отправлено`);
      done();
    },
  });
}

function ownTicket(ticket) {
  return html`
    <article class="card ticket">
      <div class="ticket-head"><span class="mono muted">№${ticket.id}</span>${badge(TICKET_STATUS[ticket.status])}
        <span class="muted small">${formatDateTime(ticket.createdAt)}</span></div>
      <h3>${ticket.subject}</h3>
      <p class="muted small">${TICKET_CATEGORY[ticket.category]}${ticket.booking ? ` · заявка №${ticket.booking.id} (${ticket.booking.equipmentName})` : ''}</p>
      <p>${ticket.description}</p>
      ${ticket.resolution ? html`<div class="note note-ok"><b>Ответ поддержки:</b> ${ticket.resolution}</div>` : ''}
    </article>`;
}

async function renderRequester(el, { user, refresh, refreshBell }) {
  const [tickets, bookings] = await Promise.all([
    api('/api/tickets'),
    user.role === 'recipient' ? api('/api/bookings?scope=mine') : api('/api/bookings?scope=all'),
  ]);
  setHtml(el, html`
    <header class="page-header">
      <div><h1>Поддержка</h1><p class="muted">Ошибка при оформлении заявки или карточка не открывается — напишите сюда.</p></div>
      <button type="button" class="btn btn-primary" data-new-ticket>Новое обращение</button>
    </header>
    <div class="ticket-list">${tickets.length ? tickets.map(ownTicket) : emptyState('Обращений пока нет')}</div>`);
  el.onclick = (event) => {
    if (event.target.closest('[data-new-ticket]')) newTicketModal(bookings, () => { refreshBell(); refresh(); });
  };
}

function answerModal(ticket, done) {
  openModal({
    title: `Ответ на обращение №${ticket.id}`,
    submitLabel: 'Сохранить',
    body: html`
      <p><b>${ticket.subject}</b></p><p class="muted">${ticket.description}</p>
      <label class="field"><span>Статус</span><select name="status">
        ${Object.entries(TICKET_STATUS).map(([value, entry]) => html`<option value="${value}" ${value === ticket.status ? 'selected' : ''}>${entry.label}</option>`)}
      </select></label>
      <label class="field"><span>Ответ пользователю</span><textarea name="resolution" rows="3" maxlength="2000">${ticket.resolution ?? ''}</textarea></label>`,
    onSubmit: async (form) => {
      await patch(`/api/tickets/${ticket.id}`, formValues(form));
      toast(`Обращение №${ticket.id} обновлено`);
      done();
    },
  });
}

function problemModal(ticketIds, done) {
  openModal({
    title: 'Перевести обращения в проблему ИС',
    submitLabel: 'Зарегистрировать проблему',
    body: html`
      <p class="muted">Обращения: ${ticketIds.map((id) => `№${id}`).join(', ')}. Проблема уйдёт на исправление в рамках изменения ИС.</p>
      <label class="field"><span>Название проблемы</span><input name="title" maxlength="150" required></label>
      <label class="field"><span>Причина</span><textarea name="cause" rows="3" maxlength="2000" required></textarea></label>
      <label class="field"><span>Влияние на пользователей</span><textarea name="impact" rows="2" maxlength="2000" required></textarea></label>`,
    onSubmit: async (form) => {
      const problem = await post('/api/problems', { ...formValues(form), ticketIds: ticketIds.map(Number) });
      toast(`Проблема №${problem.id} зарегистрирована`);
      done();
    },
  });
}

function supportRow(ticket) {
  return html`
    <tr>
      <td>${ticket.problem ? '' : html`<input type="checkbox" data-pick="${ticket.id}" aria-label="Выбрать обращение">`}</td>
      <td class="mono">№${ticket.id}</td>
      <td><b>${ticket.subject}</b><div class="muted small">${ticket.user.name} · ${formatDateTime(ticket.createdAt)}</div></td>
      <td class="small">${TICKET_CATEGORY[ticket.category]}</td>
      <td class="small">${ticket.booking ? `№${ticket.booking.id} · ${ticket.booking.equipmentName}` : '—'}</td>
      <td><select data-priority="${ticket.id}">${Object.entries(TICKET_PRIORITY).map(([value, entry]) => html`
        <option value="${value}" ${value === ticket.priority ? 'selected' : ''}>${entry.label}</option>`)}</select></td>
      <td>${badge(TICKET_STATUS[ticket.status])}</td>
      <td class="small">${ticket.problem ? html`<a href="#/problems">№${ticket.problem.id}</a>` : '—'}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-answer="${ticket.id}">Ответить</button></td>
    </tr>`;
}

async function renderSupport(el, { refresh, refreshBell }) {
  const tickets = await api('/api/tickets');
  const byId = new Map(tickets.map((ticket) => [String(ticket.id), ticket]));
  setHtml(el, html`
    <header class="page-header">
      <div><h1>Обращения пользователей</h1><p class="muted">Категория, приоритет, статус и связанная заявка. Повторяющиеся обращения объединяются в проблему.</p></div>
      <button type="button" class="btn btn-primary" data-make-problem disabled>Перевести в проблему</button>
    </header>
    <div class="card table-card">
      <table class="table">
        <thead><tr><th></th><th>№</th><th>Тема</th><th>Категория</th><th>Заявка</th><th>Приоритет</th><th>Статус</th><th>Проблема</th><th></th></tr></thead>
        <tbody>${tickets.map(supportRow)}</tbody>
      </table>
    </div>`);

  const done = () => { refreshBell(); refresh(); };
  const picked = () => [...el.querySelectorAll('[data-pick]:checked')].map((input) => input.dataset.pick);
  el.onchange = async (event) => {
    if (event.target.matches('[data-pick]')) {
      el.querySelector('[data-make-problem]').disabled = picked().length === 0;
      return;
    }
    const priority = event.target.closest('[data-priority]');
    if (!priority) return;
    try {
      await patch(`/api/tickets/${priority.dataset.priority}`, { priority: priority.value });
      toast(`Приоритет обращения №${priority.dataset.priority}: ${TICKET_PRIORITY[priority.value].label.toLowerCase()}`);
    } catch (error) {
      toast(error.message, 'danger');
    }
    refresh();
  };
  el.onclick = (event) => {
    const answer = event.target.closest('[data-answer]');
    if (answer) answerModal(byId.get(answer.dataset.answer), done);
    if (event.target.closest('[data-make-problem]')) problemModal(picked(), done);
  };
}

export function render(el, context) {
  return context.user.role === 'support' ? renderSupport(el, context) : renderRequester(el, context);
}
