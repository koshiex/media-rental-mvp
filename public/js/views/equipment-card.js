import { api, post } from '../api.js';
import { icon } from '../icons.js';
import { BOOKING_STATUS, EQUIPMENT_STATUS, categorySlug } from '../labels.js';
import {
  addDaysIso, badge, daysInclusive, daysLabel, formValues, formatDate, formatRange, html, setHtml, toast, todayIso,
} from '../ui.js';

const STRIP_DAYS = 28;
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function freePeriodText(period) {
  if (!period) return 'нет';
  if (!period.to) return `с ${formatDate(period.from)} и далее`;
  if (period.from === period.to) return `только ${formatDate(period.from)}`;
  return `${formatDate(period.from)} – ${formatDate(period.to)}`;
}

function busyOn(schedule, date) {
  return schedule.find((slot) => slot.startDate <= date && slot.endDate >= date) ?? null;
}

function stripDays(item) {
  const today = todayIso();
  return Array.from({ length: STRIP_DAYS }, (_, offset) => {
    const date = addDaysIso(today, offset);
    const slot = busyOn(item.schedule, date);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, slot, weekday, isWeekend: weekday === 0 || weekday === 6 };
  });
}

function dayCell({ date, slot, weekday, isWeekend }) {
  const state = slot ? `busy busy-${slot.status}` : 'free';
  const title = slot
    ? `${formatDate(date)}: ${BOOKING_STATUS[slot.status].label}${slot.isMine ? ' (ваша заявка)' : ''}`
    : `${formatDate(date)}: свободно`;
  return html`
    <div class="day ${state} ${isWeekend ? 'weekend' : ''} ${slot?.isMine ? 'mine' : ''}" data-date="${date}" title="${title}">
      <small>${WEEKDAYS[weekday]}</small><b>${Number(date.slice(8))}</b>
    </div>`;
}

function scheduleTable(item) {
  if (!item.schedule.length) return html`<p class="muted">Активных бронирований нет.</p>`;
  return html`
    <table class="table compact">
      <thead><tr><th>Период</th><th>Статус</th><th>Кем занято</th></tr></thead>
      <tbody>${item.schedule.map((slot) => html`
        <tr>
          <td>${formatRange(slot.startDate, slot.endDate)}</td>
          <td>${badge(BOOKING_STATUS[slot.status])}</td>
          <td>${slot.userName ?? (slot.isMine ? 'Ваша заявка' : 'Другой пользователь')}${slot.bookingId ? html` <span class="muted">№${slot.bookingId}</span>` : ''}</td>
        </tr>`)}
      </tbody>
    </table>`;
}

function bookingForm(item, user, query) {
  if (user.role !== 'recipient') {
    return html`<div class="aside-note">${icon('alert')}<p>Бронирование оформляют получатели оборудования: студенты и преподаватели.</p></div>`;
  }
  if (item.status === 'unavailable') {
    return html`<div class="aside-note aside-danger">${icon('alert')}<p>Оборудование недоступно для бронирования.</p></div>`;
  }
  const today = todayIso();
  const start = query.from ?? item.nearestFree?.from ?? today;
  const end = query.to ?? start;
  return html`
    <form class="booking-form" data-booking-form>
      <h2>Забронировать</h2>
      ${item.canBook ? '' : html`<div class="aside-note aside-warn">${icon('alert')}
        <p>Для этого оборудования нужен допуск. Без него система не примет заявку.</p></div>`}
      <div class="field-row">
        <label class="field"><span>Дата начала</span><input type="date" name="startDate" min="${today}" value="${start}" required></label>
        <label class="field"><span>Дата окончания</span><input type="date" name="endDate" min="${today}" value="${end}" required></label>
      </div>
      <p class="period-hint" data-period-hint></p>
      <label class="field"><span>Цель использования</span>
        <textarea name="purpose" rows="3" maxlength="500" placeholder="Например: съёмка курсового фильма по дисциплине «Видеомонтаж»" required></textarea>
      </label>
      <p class="form-error" data-form-error hidden></p>
      <button class="btn btn-primary btn-block">Отправить заявку</button>
      <p class="muted small">Заявку проверит сотрудник пункта выдачи. Уведомление о решении придёт в систему.</p>
    </form>`;
}

function updateSelection(el, item) {
  const form = el.querySelector('[data-booking-form]');
  if (!form) return;
  const { startDate, endDate } = formValues(form);
  const hint = el.querySelector('[data-period-hint]');
  el.querySelectorAll('.day').forEach((cell) => cell.classList.remove('selected', 'selected-conflict'));
  if (!startDate || !endDate || endDate < startDate) {
    hint.textContent = endDate < startDate ? 'Дата окончания раньше даты начала' : '';
    hint.className = 'period-hint period-bad';
    return;
  }
  const days = daysInclusive(startDate, endDate);
  const hasConflict = item.schedule.some((slot) => slot.startDate <= endDate && slot.endDate >= startDate);
  el.querySelectorAll('.day').forEach((cell) => {
    if (cell.dataset.date >= startDate && cell.dataset.date <= endDate) {
      cell.classList.add(hasConflict ? 'selected-conflict' : 'selected');
    }
  });
  const tooLong = days > item.maxDays;
  hint.className = `period-hint ${hasConflict || tooLong ? 'period-bad' : 'period-ok'}`;
  hint.textContent = hasConflict
    ? `${daysLabel(days)}: период пересекается с другой бронью`
    : tooLong ? `${daysLabel(days)}: больше максимального срока (${item.maxDays} дн.)` : `${daysLabel(days)} · период свободен`;
}

export async function render(el, { params, user, query, navigate, refreshBell }) {
  const item = await api(`/api/equipment/${params.id}`);
  const slug = categorySlug(item.category);
  setHtml(el, html`
    <a class="back-link" href="#/catalog">← Каталог</a>
    <div class="detail-layout">
      <section class="card detail-main">
        <div class="detail-head">
          <div class="equip-thumb equip-thumb-lg cat-${slug}">${icon(slug, 'icon icon-xl')}</div>
          <div>
            <p class="mono muted">${item.inventoryNumber}</p>
            <h1>${item.name}</h1>
            <div class="badges">${badge(EQUIPMENT_STATUS[item.status])}
              ${item.requiresClearance ? html`<span class="tag tag-warn">Нужен допуск</span>` : html`<span class="tag tag-muted">Допуск не нужен</span>`}
              <span class="tag tag-muted">До ${item.maxDays} дн.</span></div>
          </div>
        </div>
        <p>${item.description}</p>
        <div class="detail-columns">
          <div><h3>Состав комплекта</h3><ul class="kit-list">${item.kit.map((part) => html`<li>${part}</li>`)}</ul></div>
          <dl class="props">
            <dt>Категория</dt><dd>${item.category}</dd>
            <dt>Ближайший свободный период</dt>
            <dd>${freePeriodText(item.nearestFree)}</dd>
          </dl>
        </div>
        <h3>Занятость на 4 недели</h3>
        <div class="strip">${stripDays(item).map(dayCell)}</div>
        <div class="legend">
          <span><i class="swatch swatch-free"></i>Свободно</span>
          <span><i class="swatch swatch-new"></i>На согласовании</span>
          <span><i class="swatch swatch-approved"></i>Забронировано</span>
          <span><i class="swatch swatch-issued"></i>Выдано</span>
          <span><i class="swatch swatch-selected"></i>Выбранный период</span>
        </div>
        <h3>Бронирования</h3>
        ${scheduleTable(item)}
      </section>
      <aside class="card detail-aside">${bookingForm(item, user, query)}</aside>
    </div>`);

  updateSelection(el, item);
  el.oninput = (event) => {
    if (event.target.closest('[data-booking-form]')) updateSelection(el, item);
  };
  el.onsubmit = async (event) => {
    if (!event.target.matches('[data-booking-form]')) return;
    event.preventDefault();
    const form = event.target;
    const errorBox = form.querySelector('[data-form-error]');
    const button = form.querySelector('button');
    errorBox.hidden = true;
    button.disabled = true;
    try {
      const booking = await post('/api/bookings', { equipmentId: item.id, ...formValues(form) });
      toast(`Заявка №${booking.id} отправлена на согласование`);
      refreshBell();
      navigate('/my-bookings');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
}
