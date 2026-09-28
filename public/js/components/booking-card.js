import { icon } from '../icons.js';
import { BOOKING_STATUS, KIND_LABELS, RETURN_CONDITION, categorySlug } from '../labels.js';
import { badge, daysInclusive, daysLabel, formatDateTime, formatRange, html } from '../ui.js';

const STEPS = [
  { key: 'new', label: 'Подана' },
  { key: 'approved', label: 'Согласована' },
  { key: 'issued', label: 'Выдана' },
  { key: 'returned', label: 'Возвращена' },
];
// A returned booking has passed every step, so none of them is «current».
const STEP_INDEX = { new: 0, clarification: 0, approved: 1, issued: 2, returned: STEPS.length };

function timeline(booking) {
  if (booking.status === 'rejected' || booking.status === 'cancelled') {
    return html`<div class="timeline timeline-closed">${badge(BOOKING_STATUS[booking.status])}</div>`;
  }
  const current = STEP_INDEX[booking.status];
  return html`<ol class="timeline">${STEPS.map((step, index) => html`
    <li class="${index < current ? 'done' : index === current ? 'current' : ''}">${step.label}</li>`)}
  </ol>`;
}

function userLine(user) {
  const kind = KIND_LABELS[user.kind] ?? '';
  return html`<p class="booking-user">${user.name}<span class="muted"> · ${[kind, user.group].filter(Boolean).join(', ')}</span>
    ${user.hasClearance ? '' : html`<span class="tag tag-muted">без допуска</span>`}</p>`;
}

function notes(booking) {
  const items = [];
  if (booking.staffComment) {
    const tone = booking.status === 'rejected' ? 'danger' : booking.status === 'clarification' ? 'warn' : 'info';
    items.push(html`<div class="note note-${tone}"><b>Пункт выдачи:</b> ${booking.staffComment}</div>`);
  }
  if (booking.cancelReason) items.push(html`<div class="note note-muted"><b>Причина отмены:</b> ${booking.cancelReason}</div>`);
  if (booking.issuedKit) {
    const missing = booking.equipment.kit.filter((part) => !booking.issuedKit.includes(part));
    items.push(html`<div class="note note-muted"><b>Выдано ${formatDateTime(booking.issuedAt)}:</b> ${booking.issuedKit.join(', ')}
      ${missing.length ? html`<br><span class="muted">Без: ${missing.join(', ')}</span>` : ''}</div>`);
  }
  if (booking.returnCondition) {
    const tone = booking.returnCondition === 'full' ? 'ok' : booking.returnCondition === 'damaged' ? 'danger' : 'warn';
    items.push(html`<div class="note note-${tone}"><b>Возврат ${formatDateTime(booking.returnedAt)}:</b>
      ${RETURN_CONDITION[booking.returnCondition].label}${booking.returnComment ? ` — ${booking.returnComment}` : ''}
      ${booking.hasDamagePhoto ? html` <button type="button" class="link-button" data-action="photo" data-id="${booking.id}">фото</button>` : ''}</div>`);
  }
  return items;
}

export function bookingCard(booking, { actions = [], showUser = false } = {}) {
  const days = daysInclusive(booking.startDate, booking.endDate);
  const slug = categorySlug(booking.equipment.category);
  return html`
    <article class="booking card ${booking.overdueDays ? 'booking-overdue' : ''}">
      <div class="booking-thumb cat-${slug}">${icon(slug, 'icon icon-lg')}</div>
      <div class="booking-main">
        <div class="booking-head">
          <span class="mono muted">№${booking.id}</span>
          ${badge(BOOKING_STATUS[booking.status])}
          ${booking.overdueDays ? html`<span class="badge badge-danger">Просрочка ${daysLabel(booking.overdueDays)}</span>` : ''}
          <span class="muted small booking-created">создана ${formatDateTime(booking.createdAt)}</span>
        </div>
        <h3><a href="#/equipment/${booking.equipment.id}">${booking.equipment.name}</a>
          <span class="mono muted small">${booking.equipment.inventoryNumber}</span></h3>
        ${showUser ? userLine(booking.user) : ''}
        <p class="booking-period">${icon('calendar')} ${formatRange(booking.startDate, booking.endDate)} · ${daysLabel(days)}</p>
        <p class="booking-purpose">${booking.purpose}</p>
        ${notes(booking)}
        ${timeline(booking)}
      </div>
      <div class="booking-actions">
        ${actions.map((action) => html`
          <button type="button" class="btn btn-${action.tone ?? 'ghost'} btn-sm" data-action="${action.action}" data-id="${booking.id}">${action.label}</button>`)}
        <button type="button" class="btn btn-link btn-sm" data-action="history" data-id="${booking.id}">История</button>
      </div>
    </article>`;
}
