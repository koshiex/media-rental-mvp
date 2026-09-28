import { api } from '../api.js';
import { icon } from '../icons.js';
import { CATEGORIES, EQUIPMENT_STATUS, categorySlug } from '../labels.js';
import { badge, emptyState, formValues, formatDate, html, setHtml, todayIso } from '../ui.js';

const FILTER_KEYS = ['q', 'category', 'from', 'to', 'clearance', 'onlyFree'];
const KIT_PREVIEW = 3;

function nearestFreeText(item) {
  if (!item.nearestFree) return 'Нет свободных дат';
  const { from, to } = item.nearestFree;
  const isToday = from === todayIso();
  if (!to) return isToday ? 'Свободно с сегодняшнего дня' : `Свободно с ${formatDate(from)}`;
  if (from === to) return isToday ? 'Свободно только сегодня' : `Свободно только ${formatDate(from)}`;
  return `Свободно: ${isToday ? 'сегодня' : formatDate(from)} – ${formatDate(to)}`;
}

function periodTag(item) {
  if (item.freeInPeriod === true) return html`<span class="tag tag-ok">Свободно в выбранные даты</span>`;
  if (item.freeInPeriod === false) return html`<span class="tag tag-danger">Занято в выбранные даты</span>`;
  return '';
}

function card(item, query) {
  const rest = item.kit.length - KIT_PREVIEW;
  const link = new URLSearchParams(Object.entries({ from: query.from, to: query.to }).filter(([, value]) => value));
  return html`
    <a class="equip-card" href="#/equipment/${item.id}${link.toString() ? `?${link}` : ''}">
      <div class="equip-thumb cat-${categorySlug(item.category)}">${icon(categorySlug(item.category), 'icon icon-xl')}</div>
      <div class="equip-body">
        <div class="equip-top"><span class="mono muted">${item.inventoryNumber}</span>${badge(EQUIPMENT_STATUS[item.status])}</div>
        <h3>${item.name}</h3>
        <p class="muted small">${item.category} · до ${item.maxDays} дн.</p>
        <p class="kit-preview">${item.kit.slice(0, KIT_PREVIEW).join(' · ')}${rest > 0 ? ` · ещё ${rest}` : ''}</p>
        <div class="equip-meta">
          <span class="free-hint">${icon('calendar')} ${nearestFreeText(item)}</span>
          ${item.requiresClearance ? html`<span class="tag ${item.canBook ? 'tag-muted' : 'tag-warn'}">Нужен допуск</span>` : ''}
          ${periodTag(item)}
        </div>
      </div>
    </a>`;
}

function filterForm(query) {
  const selected = (value, current) => (value === current ? 'selected' : '');
  return html`
    <form class="filters card" data-filters>
      <input type="search" name="q" placeholder="Название, инв. номер или состав" value="${query.q ?? ''}">
      <select name="category">
        <option value="">Все категории</option>
        ${CATEGORIES.map((category) => html`<option ${selected(category.name, query.category)}>${category.name}</option>`)}
      </select>
      <label class="inline-field">с <input type="date" name="from" min="${todayIso()}" value="${query.from ?? ''}"></label>
      <label class="inline-field">по <input type="date" name="to" min="${todayIso()}" value="${query.to ?? ''}"></label>
      <select name="clearance">
        <option value="">Любой допуск</option>
        <option value="none" ${selected('none', query.clearance)}>Без допуска</option>
        <option value="mine" ${selected('mine', query.clearance)}>Доступные мне</option>
      </select>
      <label class="check"><input type="checkbox" name="onlyFree" value="1" ${query.onlyFree === '1' ? 'checked' : ''}> Только свободные</label>
      <div class="filters-actions">
        <button class="btn btn-primary">Найти</button>
        <button type="button" class="btn btn-ghost" data-reset>Сбросить</button>
      </div>
    </form>`;
}

export async function render(el, { query, navigate }) {
  const hasPeriod = Boolean(query.from && query.to);
  const filters = Object.fromEntries(FILTER_KEYS
    .filter((key) => query[key] && (hasPeriod || (key !== 'from' && key !== 'to')))
    .map((key) => [key, query[key]]));
  const items = await api(`/api/equipment?${new URLSearchParams(filters)}`);
  const periodNote = filters.from && filters.to
    ? `Период ${formatDate(filters.from)} – ${formatDate(filters.to)}`
    : 'Укажите даты, чтобы увидеть занятость на нужный период';

  setHtml(el, html`
    <header class="page-header">
      <div>
        <h1>Каталог оборудования</h1>
        <p class="muted">Найдено позиций: ${items.length}. ${periodNote}.</p>
      </div>
    </header>
    ${filterForm(filters)}
    ${items.length
    ? html`<div class="equip-grid">${items.map((item) => card(item, filters))}</div>`
    : emptyState('Ничего не нашлось', 'Измените фильтры или период')}`);

  el.onsubmit = (event) => {
    if (!event.target.matches('[data-filters]')) return;
    event.preventDefault();
    navigate('/catalog', formValues(event.target));
  };
  el.onclick = (event) => {
    if (event.target.closest('[data-reset]')) navigate('/catalog');
  };
}
