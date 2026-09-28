import { api } from '../api.js';
import { bookingClickHandler } from '../components/booking-actions.js';
import { bookingCard } from '../components/booking-card.js';
import { emptyState, html, setHtml, todayIso } from '../ui.js';

const TABS = [
  { key: 'review', label: 'На согласовании', statuses: ['new', 'clarification'] },
  { key: 'handover', label: 'К выдаче', statuses: ['approved'] },
  { key: 'issued', label: 'На руках', statuses: ['issued'] },
  { key: 'closed', label: 'Завершённые', statuses: ['returned', 'rejected', 'cancelled'] },
];

function actionsFor(booking) {
  switch (booking.status) {
    case 'new':
      return [
        { action: 'approve', label: 'Согласовать', tone: 'primary' },
        { action: 'clarify', label: 'Уточнить', tone: 'ghost' },
        { action: 'reject', label: 'Отклонить', tone: 'danger-ghost' },
      ];
    case 'clarification':
      return [{ action: 'reject', label: 'Отклонить', tone: 'danger-ghost' }];
    case 'approved':
      return [{ action: 'issue', label: 'Выдать', tone: 'primary' }];
    case 'issued':
      return [
        { action: 'return', label: 'Принять возврат', tone: 'primary' },
        ...(booking.overdueDays ? [{ action: 'remind', label: 'Напомнить', tone: 'ghost' }] : []),
      ];
    default:
      return [];
  }
}

function kpis(bookings) {
  const today = todayIso();
  const count = (predicate) => bookings.filter(predicate).length;
  return [
    { label: 'Новые заявки', value: count((b) => b.status === 'new'), tone: 'info' },
    { label: 'Выдать сегодня', value: count((b) => b.status === 'approved' && b.startDate <= today), tone: 'accent' },
    { label: 'На руках', value: count((b) => b.status === 'issued'), tone: 'violet' },
    { label: 'Просрочено', value: count((b) => b.overdueDays > 0), tone: 'danger' },
  ];
}

export async function render(el, { query, navigate, refresh, refreshBell }) {
  const bookings = await api('/api/bookings?scope=all');
  const tab = TABS.find((item) => item.key === query.tab) ?? TABS[0];
  const matching = bookings.filter((booking) => tab.statuses.includes(booking.status));
  const shown = tab.key === 'closed' ? [...matching].sort((a, b) => b.id - a.id) : matching;

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Пульт пункта выдачи</h1><p class="muted">Согласование, выдача и приём оборудования.</p></div>
    </header>
    <div class="kpi-row">${kpis(bookings).map((kpi) => html`
      <div class="kpi kpi-${kpi.tone}"><span class="kpi-value">${kpi.value}</span><span class="kpi-label">${kpi.label}</span></div>`)}
    </div>
    <div class="tabs">${TABS.map((item) => html`
      <button type="button" class="tab ${item === tab ? 'active' : ''}" data-tab="${item.key}">${item.label}
        <span class="count">${bookings.filter((booking) => item.statuses.includes(booking.status)).length}</span></button>`)}
    </div>
    <div class="booking-list">
      ${shown.length
    ? shown.map((booking) => bookingCard(booking, { actions: actionsFor(booking), showUser: true }))
    : emptyState('Здесь пусто', 'Новые заявки появятся автоматически')}
    </div>`);

  const onBookingClick = bookingClickHandler(bookings, () => {
    refreshBell();
    refresh();
  });
  el.onclick = (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) navigate('/desk', { tab: tabButton.dataset.tab });
    else onBookingClick(event);
  };
}
