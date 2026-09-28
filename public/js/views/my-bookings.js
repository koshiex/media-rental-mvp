import { api } from '../api.js';
import { bookingClickHandler } from '../components/booking-actions.js';
import { bookingCard } from '../components/booking-card.js';
import { emptyState, html, setHtml } from '../ui.js';

const ACTIVE = ['new', 'clarification', 'approved', 'issued'];

function actionsFor(booking) {
  const actions = [];
  if (booking.status === 'clarification') actions.push({ action: 'resubmit', label: 'Ответить на уточнение', tone: 'primary' });
  if (['new', 'clarification', 'approved'].includes(booking.status)) actions.push({ action: 'cancel', label: 'Отменить', tone: 'ghost' });
  actions.push({ action: 'ticket', label: 'Сообщить о проблеме', tone: 'ghost' });
  return actions;
}

export async function render(el, { query, navigate, refresh, refreshBell }) {
  const bookings = await api('/api/bookings?scope=mine');
  const tab = query.tab === 'archive' ? 'archive' : 'active';
  const active = bookings.filter((booking) => ACTIVE.includes(booking.status));
  const archive = bookings.filter((booking) => !ACTIVE.includes(booking.status));
  const shown = tab === 'active' ? active : archive;

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Мои заявки</h1><p class="muted">Статусы, комментарии пункта выдачи и история каждой заявки.</p></div>
      <a class="btn btn-primary" href="#/catalog">Новая заявка</a>
    </header>
    <div class="tabs">
      <button type="button" class="tab ${tab === 'active' ? 'active' : ''}" data-tab="active">Активные <span class="count">${active.length}</span></button>
      <button type="button" class="tab ${tab === 'archive' ? 'active' : ''}" data-tab="archive">Завершённые <span class="count">${archive.length}</span></button>
    </div>
    <div class="booking-list">
      ${shown.length
    ? shown.map((booking) => bookingCard(booking, { actions: actionsFor(booking) }))
    : emptyState('Заявок нет', tab === 'active' ? 'Выберите оборудование в каталоге' : '')}
    </div>`);

  const onBookingClick = bookingClickHandler(bookings, () => {
    refreshBell();
    refresh();
  });
  el.onclick = (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) navigate('/my-bookings', { tab: tabButton.dataset.tab });
    else onBookingClick(event);
  };
}
