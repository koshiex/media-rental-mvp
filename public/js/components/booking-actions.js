import { api, post } from '../api.js';
import { ANY_STATUS, RETURN_CONDITION, TICKET_CATEGORY } from '../labels.js';
import { badge, formValues, formatDateTime, formatRange, html, openModal, toast } from '../ui.js';

const PHOTO_MAX_SIDE = 1280;
const PHOTO_QUALITY = 0.8;
const PHOTO_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const commentField = (label, required, placeholder = '') => html`
  <label class="field"><span>${label}${required ? '' : ' (необязательно)'}</span>
    <textarea name="comment" rows="3" maxlength="500" placeholder="${placeholder}"></textarea></label>`;

// Downscale the photo in the browser so it always fits the 2 MB server limit.
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Выберите изображение'));
    if (file.size > PHOTO_MAX_SOURCE_BYTES) return reject(new Error('Файл больше 20 МБ'));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    image.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    image.src = url;
  });
}

function returnModal(booking, done) {
  let photo = null;
  openModal({
    title: `Приём возврата по заявке №${booking.id}`,
    submitLabel: 'Принять возврат',
    body: html`
      <p class="muted">${booking.equipment.name} · ${booking.user.name} · ${formatRange(booking.startDate, booking.endDate)}</p>
      <fieldset class="radio-cards">
        <legend>Комплектность</legend>
        ${Object.entries(RETURN_CONDITION).map(([value, entry], index) => html`
          <label class="radio-card radio-${entry.tone}"><input type="radio" name="condition" value="${value}" ${index === 0 ? 'checked' : ''}>
            <span>${entry.label}</span></label>`)}
      </fieldset>
      <p class="muted small">Выдано: ${(booking.issuedKit ?? booking.equipment.kit).join(', ')}</p>
      ${commentField('Комментарий', false, 'Что повреждено или чего не хватает')}
      <div class="field"><span>Фото повреждения (необязательно)</span>
        <label class="file-pick">
          <input type="file" name="photo" class="visually-hidden" accept="image/png,image/jpeg,image/webp">
          <span class="btn btn-ghost btn-sm">Выбрать фото</span>
          <span class="muted small" data-file-name>Файл не выбран</span>
        </label></div>
      <img class="photo-preview" data-preview alt="Предпросмотр фото" hidden>`,
    onMount: (form) => {
      form.photo.addEventListener('change', async () => {
        const preview = form.querySelector('[data-preview]');
        const [file] = form.photo.files;
        form.querySelector('[data-file-name]').textContent = file ? file.name : 'Файл не выбран';
        photo = null;
        preview.hidden = true;
        if (!file) return;
        try {
          photo = await readPhoto(file);
          preview.src = photo;
          preview.hidden = false;
        } catch (error) {
          toast(error.message, 'danger');
        }
      });
    },
    onSubmit: async (form) => {
      const { condition, comment } = formValues(form);
      if (condition !== 'full' && !comment.trim()) throw new Error('Опишите недостачу или повреждение');
      await post(`/api/bookings/${booking.id}/return`, { condition, comment, photo });
      toast(`Возврат по заявке №${booking.id} принят`);
      done();
    },
  });
}

function issueModal(booking, done) {
  openModal({
    title: `Выдача по заявке №${booking.id}`,
    submitLabel: 'Оформить выдачу',
    body: html`
      <p class="muted">${booking.equipment.name} · ${booking.user.name} · ${formatRange(booking.startDate, booking.endDate)}</p>
      <fieldset class="checklist"><legend>Состав комплекта при выдаче</legend>
        ${booking.equipment.kit.map((part) => html`<label class="check"><input type="checkbox" name="kit" value="${part}" checked> ${part}</label>`)}
      </fieldset>
      <p class="muted small">Снимите отметку, если позиция не выдаётся. Состав сохранится в заявке и журнале.</p>`,
    onSubmit: async (form) => {
      const kit = [...form.querySelectorAll('[name=kit]:checked')].map((input) => input.value);
      if (!kit.length) throw new Error('Отметьте хотя бы одну позицию комплекта');
      await post(`/api/bookings/${booking.id}/issue`, { kit });
      toast(`Оборудование выдано по заявке №${booking.id}`);
      done();
    },
  });
}

function commentModal(booking, done, { title, submitLabel, tone, path, required, field = 'comment', placeholder, success }) {
  openModal({
    title,
    submitLabel,
    tone,
    body: html`<p class="muted">${booking.equipment.name} · ${formatRange(booking.startDate, booking.endDate)}</p>
      ${commentField(field === 'reason' ? 'Причина' : 'Комментарий', required, placeholder)}`,
    onSubmit: async (form) => {
      const { comment } = formValues(form);
      if (required && !comment.trim()) throw new Error('Заполните поле');
      await post(`/api/bookings/${booking.id}/${path}`, { [field]: comment });
      toast(success);
      done();
    },
  });
}

function resubmitModal(booking, done) {
  openModal({
    title: `Уточнение по заявке №${booking.id}`,
    submitLabel: 'Отправить повторно',
    body: html`
      <div class="note note-warn"><b>Вопрос пункта выдачи:</b> ${booking.staffComment}</div>
      <label class="field"><span>Цель использования</span>
        <textarea name="purpose" rows="4" maxlength="500">${booking.purpose}</textarea></label>`,
    onSubmit: async (form) => {
      await post(`/api/bookings/${booking.id}/resubmit`, formValues(form));
      toast('Заявка снова отправлена на согласование');
      done();
    },
  });
}

function ticketModal(booking, done) {
  openModal({
    title: `Обращение в поддержку по заявке №${booking.id}`,
    submitLabel: 'Отправить обращение',
    body: html`
      <label class="field"><span>Категория</span><select name="category">
        ${Object.entries(TICKET_CATEGORY).map(([value, label]) => html`<option value="${value}">${label}</option>`)}</select></label>
      <label class="field"><span>Тема</span><input name="subject" maxlength="150" required></label>
      <label class="field"><span>Описание</span><textarea name="description" rows="4" maxlength="2000" required></textarea></label>`,
    onSubmit: async (form) => {
      const ticket = await post('/api/tickets', { ...formValues(form), bookingId: booking.id });
      toast(`Обращение №${ticket.id} отправлено в поддержку`);
      done();
    },
  });
}

async function historyModal(booking) {
  const details = await api(`/api/bookings/${booking.id}`);
  openModal({
    title: `История заявки №${booking.id}`,
    wide: true,
    body: html`<ol class="history">${details.history.map((entry) => html`
      <li><div class="history-head"><b>${entry.action}</b><span class="muted small">${formatDateTime(entry.createdAt)}</span></div>
        <div class="muted small">${entry.userName}</div>
        ${entry.newStatus ? html`<div class="history-status">${entry.oldStatus ? html`${badge(ANY_STATUS[`booking:${entry.oldStatus}`])} → ` : ''}${badge(ANY_STATUS[`booking:${entry.newStatus}`])}</div>` : ''}
        ${entry.details ? html`<div class="small">${entry.details}</div>` : ''}</li>`)}
    </ol>`,
  });
}

async function photoModal(booking) {
  const details = await api(`/api/bookings/${booking.id}`);
  openModal({
    title: `Фото повреждения · заявка №${booking.id}`,
    wide: true,
    body: html`<img class="photo-full" src="${details.damagePhoto}" alt="Фото повреждения">`,
  });
}

export async function runBookingAction(action, booking, done) {
  const handlers = {
    approve: () => commentModal(booking, done, {
      title: `Согласовать заявку №${booking.id}`, submitLabel: 'Согласовать', tone: 'primary', path: 'approve',
      required: false, placeholder: 'Например: заберите после 12:00', success: `Заявка №${booking.id} согласована`,
    }),
    clarify: () => commentModal(booking, done, {
      title: `Запросить уточнение по заявке №${booking.id}`, submitLabel: 'Запросить', tone: 'primary', path: 'clarify',
      required: true, placeholder: 'Что нужно уточнить получателю', success: 'Запрос уточнения отправлен',
    }),
    reject: () => commentModal(booking, done, {
      title: `Отклонить заявку №${booking.id}`, submitLabel: 'Отклонить', tone: 'danger', path: 'reject',
      required: true, placeholder: 'Причина отказа', success: `Заявка №${booking.id} отклонена`,
    }),
    cancel: () => commentModal(booking, done, {
      title: `Отменить заявку №${booking.id}`, submitLabel: 'Отменить заявку', tone: 'danger', path: 'cancel',
      required: true, field: 'reason', placeholder: 'Почему заявка больше не нужна', success: 'Заявка отменена',
    }),
    issue: () => issueModal(booking, done),
    return: () => returnModal(booking, done),
    resubmit: () => resubmitModal(booking, done),
    ticket: () => ticketModal(booking, done),
    history: () => historyModal(booking),
    photo: () => photoModal(booking),
    remind: async () => {
      await post(`/api/bookings/${booking.id}/remind`);
      toast(`Напоминание отправлено: ${booking.user.name}`);
      done();
    },
  };
  try {
    await handlers[action]?.();
  } catch (error) {
    toast(error.message, 'danger');
  }
}

// Returns a click handler; it reports whether the click was a booking action.
export function bookingClickHandler(bookings, done) {
  const byId = new Map(bookings.map((booking) => [String(booking.id), booking]));
  return (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !byId.has(button.dataset.id)) return false;
    runBookingAction(button.dataset.action, byId.get(button.dataset.id), done);
    return true;
  };
}
