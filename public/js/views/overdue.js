import { api } from '../api.js';
import { bookingClickHandler } from '../components/booking-actions.js';
import { KIND_LABELS } from '../labels.js';
import { daysLabel, emptyState, formatDate, html, setHtml } from '../ui.js';

export async function render(el, { user, refresh, refreshBell }) {
  const overdue = await api('/api/bookings/overdue');
  const canAct = user.role === 'staff';

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Просроченные возвраты</h1>
        <p class="muted">Кто не вернул технику, что именно, до какого срока и на сколько дней просрочен возврат.</p></div>
    </header>
    ${overdue.length ? html`
      <div class="card table-card">
        <table class="table">
          <thead><tr><th>Заявка</th><th>Получатель</th><th>Оборудование</th><th>Срок возврата</th><th>Просрочка</th>
            ${canAct ? html`<th></th>` : ''}</tr></thead>
          <tbody>${overdue.map((booking) => html`
            <tr>
              <td class="mono">№${booking.id}</td>
              <td><b>${booking.user.name}</b><div class="muted small">${[KIND_LABELS[booking.user.kind], booking.user.group].filter(Boolean).join(', ')}</div></td>
              <td>${booking.equipment.name}<div class="muted small mono">${booking.equipment.inventoryNumber}</div></td>
              <td>${formatDate(booking.endDate)}</td>
              <td><span class="badge badge-danger">${daysLabel(booking.overdueDays)}</span></td>
              ${canAct ? html`<td><div class="row-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-action="remind" data-id="${booking.id}">Напомнить</button>
                <button type="button" class="btn btn-primary btn-sm" data-action="return" data-id="${booking.id}">Принять возврат</button>
              </div></td>` : ''}
            </tr>`)}
          </tbody>
        </table>
      </div>` : emptyState('Просрочек нет', 'Вся выданная техника возвращается вовремя')}`);

  el.onclick = bookingClickHandler(overdue, () => {
    refreshBell();
    refresh();
  });
}
