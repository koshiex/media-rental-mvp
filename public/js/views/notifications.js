import { api, post } from '../api.js';
import { emptyState, formatDateTime, html, setHtml } from '../ui.js';

export async function render(el, { user, refreshBell }) {
  const { items } = await api('/api/notifications');
  const bookingLink = user.role === 'recipient' ? '#/my-bookings' : user.role === 'staff' ? '#/desk' : null;

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Уведомления</h1><p class="muted">Изменения статуса заявок, решения пункта выдачи и сроки возврата (FR-13).</p></div>
    </header>
    ${items.length ? html`
      <ul class="notification-list card">${items.map((item) => html`
        <li class="${item.isRead ? '' : 'unread'}">
          <span class="dot"></span>
          <div><p>${item.text}</p>
            <span class="muted small">${formatDateTime(item.createdAt)}${item.bookingId && bookingLink ? html` · <a href="${bookingLink}">к заявкам</a>` : ''}</span></div>
        </li>`)}
      </ul>` : emptyState('Уведомлений нет')}`);

  if (items.some((item) => !item.isRead)) {
    await post('/api/notifications/read');
    refreshBell();
  }
}
