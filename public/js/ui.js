const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const TOAST_MS = 4000;
const DAY_MS = 86_400_000;

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
export const raw = (value) => new SafeHtml(String(value));

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

// Tagged template: interpolated values are escaped unless wrapped in raw()/html``.
export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, chunk, index) => out + renderValue(values[index - 1]) + chunk));
}

export function setHtml(element, content) {
  element.innerHTML = renderValue(content);
}

export function badge(entry, fallback = '') {
  if (!entry) return html`<span class="badge badge-muted">${fallback}</span>`;
  return html`<span class="badge badge-${entry.tone}">${entry.label}</span>`;
}

export const loading = (text = 'Загружаем данные…') => html`<div class="state"><span class="spinner"></span>${text}</div>`;
export const emptyState = (title, hint = '') =>
  html`<div class="state state-empty"><b>${title}</b>${hint ? html`<span>${hint}</span>` : ''}</div>`;
export const errorState = (error) =>
  html`<div class="state state-error"><b>Не удалось загрузить данные</b><span>${error.message}</span></div>`;

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysIso(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysInclusive(startIso, endIso) {
  return Math.round((Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / DAY_MS) + 1;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export function formatShortDate(iso) {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
}

export function formatRange(startIso, endIso) {
  return startIso === endIso ? formatDate(startIso) : `${formatShortDate(startIso)} – ${formatDate(endIso)}`;
}

export function formatDateTime(isoTimestamp) {
  if (!isoTimestamp) return '—';
  return new Date(isoTimestamp).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const daysLabel = (count) => `${count} ${plural(count, 'день', 'дня', 'дней')}`;

export function initials(name) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function toast(message, tone = 'ok') {
  const root = document.getElementById('toast-root');
  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  root.append(item);
  setTimeout(() => item.classList.add('toast-hide'), TOAST_MS);
  setTimeout(() => item.remove(), TOAST_MS + 400);
}

export function openModal({ title, body, submitLabel = 'Сохранить', tone = 'primary', wide = false, onSubmit, onMount }) {
  const root = document.getElementById('modal-root');
  setHtml(root, html`
    <div class="modal-backdrop">
      <form class="modal ${wide ? 'modal-wide' : ''}" novalidate>
        <header class="modal-header">
          <h2>${title}</h2>
          <button type="button" class="icon-button" data-close aria-label="Закрыть">×</button>
        </header>
        <div class="modal-body">${body}<p class="form-error" hidden></p></div>
        <footer class="modal-footer">
          <button type="button" class="btn btn-ghost" data-close>Отмена</button>
          ${onSubmit ? html`<button type="submit" class="btn btn-${tone}">${submitLabel}</button>` : ''}
        </footer>
      </form>
    </div>`);
  const form = root.querySelector('form');
  const errorBox = root.querySelector('.form-error');
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  function close() {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (event) => {
    if (event.target === event.currentTarget) close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) return;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    errorBox.hidden = true;
    try {
      await onSubmit(form);
      close();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  onMount?.(form);
  form.querySelector('input:not([type=hidden]), textarea, select')?.focus();
  return { close, form };
}
