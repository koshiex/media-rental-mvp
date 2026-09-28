import { inTransaction } from '../db.js';
import { logAction } from './audit.js';
import { getBooking } from './bookings-query.js';
import { addDays, daysBetween, formatRangeRu, formatRu, periodLength } from './dates.js';
import { changeEquipmentStatus, loadEquipmentRow } from './equipment.js';
import { DomainError, conflict, forbidden, invalid, notFound } from './errors.js';
import { notify, notifyRole } from './notifications.js';
import { assertCan } from './permissions.js';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS_LABELS, RETURN_CONDITION_LABELS } from './statuses.js';
import { requireDate, requireId, requireOneOf, requireText, requireTextList } from './validate.js';

const BOOKING_HORIZON_DAYS = 90;
const MAX_PHOTO_LENGTH = 3_000_000;
const PHOTO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const ACTIVE_PLACEHOLDERS = ACTIVE_BOOKING_STATUSES.map(() => '?').join(', ');

function loadBooking(db, id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(requireId(id, 'заявка'));
  if (!row) throw notFound('Заявка не найдена');
  return row;
}

function assertStatus(booking, allowed, action) {
  if (!allowed.includes(booking.status)) {
    throw conflict(`Нельзя ${action}: заявка №${booking.id} в статусе «${BOOKING_STATUS_LABELS[booking.status]}»`);
  }
}

function assertOwner(actor, booking) {
  if (booking.user_id !== actor.id) throw forbidden('Действие доступно только автору заявки');
}

function findConflicts(db, equipmentId, startDate, endDate, excludeId = 0) {
  return db
    .prepare(`SELECT id, start_date, end_date, status FROM bookings
      WHERE equipment_id = ? AND id != ? AND status IN (${ACTIVE_PLACEHOLDERS}) AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`)
    .all(equipmentId, excludeId, ...ACTIVE_BOOKING_STATUSES, endDate, startDate);
}

function assertNoConflicts(db, equipmentId, startDate, endDate) {
  const conflicts = findConflicts(db, equipmentId, startDate, endDate);
  if (!conflicts.length) return;
  const [first] = conflicts;
  throw conflict(
    `Оборудование уже забронировано на ${formatRangeRu(first.start_date, first.end_date)} (заявка №${first.id}). Выберите другой период.`,
    conflicts.map((item) => ({ id: item.id, startDate: item.start_date, endDate: item.end_date })),
  );
}

function setStatus(ctx, actor, booking, newStatus, fields, action, details = '') {
  const columns = Object.keys(fields);
  const assignments = ['status = ?', ...columns.map((column) => `${column} = ?`)].join(', ');
  ctx.db
    .prepare(`UPDATE bookings SET ${assignments} WHERE id = ?`)
    .run(newStatus, ...columns.map((column) => fields[column]), booking.id);
  logAction(ctx, {
    userId: actor.id, action, objectType: 'booking', objectId: booking.id,
    oldStatus: booking.status, newStatus, details,
  });
}

// Reserved equipment goes back to «available» once nothing approved is left for it.
function releaseEquipment(ctx, actor, equipmentId, bookingId) {
  const equipment = loadEquipmentRow(ctx.db, equipmentId);
  if (equipment.status !== 'reserved') return;
  const stillApproved = ctx.db
    .prepare("SELECT 1 FROM bookings WHERE equipment_id = ? AND status = 'approved' AND id != ?")
    .get(equipmentId, bookingId);
  if (!stillApproved) changeEquipmentStatus(ctx, actor.id, equipment, 'available', `Бронь по заявке №${bookingId} снята`);
}

function validatePeriod(ctx, equipment, startDate, endDate) {
  const today = ctx.clock.today();
  if (startDate < today) throw invalid('Нельзя бронировать на прошедшие даты');
  if (endDate < startDate) throw invalid('Дата окончания раньше даты начала');
  if (startDate > addDays(today, BOOKING_HORIZON_DAYS)) {
    throw invalid(`Бронирование открыто не более чем на ${BOOKING_HORIZON_DAYS} дней вперёд`);
  }
  if (periodLength(startDate, endDate) > equipment.max_days) {
    throw invalid(`Максимальный срок выдачи «${equipment.name}» — ${equipment.max_days} дн.`);
  }
}

export function createBooking(ctx, actor, input) {
  assertCan(actor, 'booking.create');
  const equipment = loadEquipmentRow(ctx.db, requireId(input.equipmentId, 'оборудование'));
  const startDate = requireDate(input.startDate, 'Дата начала');
  const endDate = requireDate(input.endDate, 'Дата окончания');
  const purpose = requireText(input.purpose, 'Цель использования', { max: 500 });
  if (equipment.status === 'unavailable') throw conflict(`«${equipment.name}» сейчас недоступно для бронирования`);
  if (equipment.requires_clearance === 1 && !actor.hasClearance) {
    throw new DomainError('clearance_required',
      `Для «${equipment.name}» нужен допуск. Обратитесь к администратору медиапространства.`, 403);
  }
  validatePeriod(ctx, equipment, startDate, endDate);

  const bookingId = inTransaction(ctx.db, () => {
    assertNoConflicts(ctx.db, equipment.id, startDate, endDate);
    const { lastInsertRowid } = ctx.db
      .prepare(`INSERT INTO bookings (equipment_id, user_id, start_date, end_date, purpose, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'new', ?)`)
      .run(equipment.id, actor.id, startDate, endDate, purpose, ctx.clock.now());
    const id = Number(lastInsertRowid);
    logAction(ctx, {
      userId: actor.id, action: 'Создание заявки', objectType: 'booking', objectId: id,
      newStatus: 'new', details: `${equipment.name}, ${formatRangeRu(startDate, endDate)}`,
    });
    notify(ctx, actor.id, `Заявка №${id} на «${equipment.name}» отправлена на согласование`, id);
    notifyRole(ctx, 'staff', `Новая заявка №${id}: ${equipment.name}, ${formatRangeRu(startDate, endDate)}`, id);
    return id;
  });
  return getBooking(ctx, actor, bookingId);
}

export function approveBooking(ctx, actor, id, { comment } = {}) {
  assertCan(actor, 'booking.review');
  const note = requireText(comment, 'Комментарий', { max: 500, optional: true });
  inTransaction(ctx.db, () => {
    const booking = loadBooking(ctx.db, id);
    assertStatus(booking, ['new'], 'согласовать');
    const equipment = loadEquipmentRow(ctx.db, booking.equipment_id);
    if (equipment.status === 'unavailable') throw conflict(`«${equipment.name}» помечено как недоступное`);
    setStatus(ctx, actor, booking, 'approved', { staff_comment: note || null }, 'Согласование заявки', note);
    if (equipment.status === 'available') {
      changeEquipmentStatus(ctx, actor.id, equipment, 'reserved', `Заявка №${booking.id} согласована`);
    }
    notify(ctx, booking.user_id,
      `Заявка №${booking.id} согласована. Получите «${equipment.name}» ${formatRu(booking.start_date)} в пункте выдачи`,
      booking.id);
  });
  return getBooking(ctx, actor, id);
}

function closeByStaff(ctx, actor, id, { comment }, { from, to, action, verb, message }) {
  assertCan(actor, 'booking.review');
  const note = requireText(comment, 'Комментарий', { max: 500 });
  inTransaction(ctx.db, () => {
    const booking = loadBooking(ctx.db, id);
    assertStatus(booking, from, verb);
    setStatus(ctx, actor, booking, to, { staff_comment: note }, action, note);
    if (to === 'rejected') releaseEquipment(ctx, actor, booking.equipment_id, booking.id);
    notify(ctx, booking.user_id, `${message(booking.id)}: ${note}`, booking.id);
  });
  return getBooking(ctx, actor, id);
}

export function rejectBooking(ctx, actor, id, input = {}) {
  return closeByStaff(ctx, actor, id, input, {
    from: ['new', 'clarification'], to: 'rejected', action: 'Отклонение заявки', verb: 'отклонить',
    message: (bookingId) => `Заявка №${bookingId} отклонена`,
  });
}

export function clarifyBooking(ctx, actor, id, input = {}) {
  return closeByStaff(ctx, actor, id, input, {
    from: ['new'], to: 'clarification', action: 'Запрос уточнения', verb: 'запросить уточнение',
    message: (bookingId) => `По заявке №${bookingId} нужно уточнение`,
  });
}

export function resubmitBooking(ctx, actor, id, { purpose } = {}) {
  const text = requireText(purpose, 'Цель использования', { max: 500 });
  inTransaction(ctx.db, () => {
    const booking = loadBooking(ctx.db, id);
    assertOwner(actor, booking);
    assertStatus(booking, ['clarification'], 'отправить повторно');
    setStatus(ctx, actor, booking, 'new', { purpose: text }, 'Ответ на уточнение', text);
    notifyRole(ctx, 'staff', `Заявка №${booking.id} уточнена и снова ждёт согласования`, booking.id);
  });
  return getBooking(ctx, actor, id);
}

export function cancelBooking(ctx, actor, id, { reason } = {}) {
  const booking = loadBooking(ctx.db, id);
  assertOwner(actor, booking);
  const text = requireText(reason, 'Причина отмены', { max: 500 });
  inTransaction(ctx.db, () => {
    const current = loadBooking(ctx.db, id);
    assertStatus(current, ['new', 'clarification', 'approved'], 'отменить');
    setStatus(ctx, actor, current, 'cancelled', { cancel_reason: text }, 'Отмена заявки', text);
    releaseEquipment(ctx, actor, current.equipment_id, current.id);
    notifyRole(ctx, 'staff', `Заявка №${current.id} отменена получателем: ${text}`, current.id);
  });
  return getBooking(ctx, actor, id);
}

function validateKit(kit, equipment) {
  const items = requireTextList(kit, 'Состав выдачи');
  const allowed = JSON.parse(equipment.kit);
  const unknown = items.filter((item) => !allowed.includes(item));
  if (unknown.length) throw invalid(`Не входит в комплект: ${unknown.join(', ')}`);
  return { items, missing: allowed.filter((item) => !items.includes(item)) };
}

function assertCanHandOver(ctx, booking, equipment) {
  const today = ctx.clock.today();
  if (booking.start_date > today) throw conflict(`Выдача по заявке №${booking.id} возможна с ${formatRu(booking.start_date)}`);
  if (booking.end_date < today) throw conflict(`Срок заявки №${booking.id} истёк, выдача невозможна`);
  if (equipment.status === 'issued') {
    const holder = ctx.db
      .prepare("SELECT id FROM bookings WHERE equipment_id = ? AND status = 'issued'")
      .get(equipment.id);
    throw conflict(`«${equipment.name}» ещё не возвращено по заявке №${holder?.id ?? '—'}`);
  }
  if (['inspection', 'unavailable'].includes(equipment.status)) {
    throw conflict(`«${equipment.name}» сейчас в статусе, при котором выдача запрещена`);
  }
}

export function issueBooking(ctx, actor, id, { kit } = {}) {
  assertCan(actor, 'booking.handover');
  inTransaction(ctx.db, () => {
    const booking = loadBooking(ctx.db, id);
    assertStatus(booking, ['approved'], 'выдать оборудование');
    const equipment = loadEquipmentRow(ctx.db, booking.equipment_id);
    const { items, missing } = validateKit(kit, equipment);
    assertCanHandOver(ctx, booking, equipment);
    const details = missing.length ? `Выдано без: ${missing.join(', ')}` : 'Полный комплект';
    setStatus(ctx, actor, booking, 'issued', { issued_at: ctx.clock.now(), issued_kit: JSON.stringify(items) },
      'Выдача оборудования', details);
    changeEquipmentStatus(ctx, actor.id, equipment, 'issued', `Выдача по заявке №${booking.id}`);
    notify(ctx, booking.user_id,
      `«${equipment.name}» выдано по заявке №${booking.id}. Верните до ${formatRu(booking.end_date)} включительно`, booking.id);
  });
  return getBooking(ctx, actor, id);
}

function validateReturn({ condition, comment, photo }) {
  const checked = requireOneOf(condition, Object.keys(RETURN_CONDITION_LABELS), 'комплектность');
  const note = requireText(comment, 'Комментарий к возврату', { max: 1000, optional: checked === 'full' });
  if (photo === undefined || photo === null || photo === '') return { condition: checked, note, photo: null };
  if (typeof photo !== 'string' || photo.length > MAX_PHOTO_LENGTH || !PHOTO_DATA_URL.test(photo)) {
    throw invalid('Фото повреждения: PNG, JPEG или WebP размером до 2 МБ');
  }
  return { condition: checked, note, photo };
}

export function returnBooking(ctx, actor, id, input = {}) {
  assertCan(actor, 'booking.handover');
  const { condition, note, photo } = validateReturn(input);
  inTransaction(ctx.db, () => {
    const booking = loadBooking(ctx.db, id);
    assertStatus(booking, ['issued'], 'принять возврат');
    const equipment = loadEquipmentRow(ctx.db, booking.equipment_id);
    const lateDays = Math.max(0, daysBetween(booking.end_date, ctx.clock.today()));
    const details = [RETURN_CONDITION_LABELS[condition], note, lateDays ? `просрочка ${lateDays} дн.` : '']
      .filter(Boolean).join('; ');
    setStatus(ctx, actor, booking, 'returned', {
      returned_at: ctx.clock.now(), return_condition: condition, return_comment: note || null, damage_photo: photo,
    }, 'Приём возврата', details);
    const hasNextBooking = ctx.db
      .prepare("SELECT 1 FROM bookings WHERE equipment_id = ? AND status = 'approved'")
      .get(equipment.id);
    const nextStatus = condition !== 'full' ? 'inspection' : hasNextBooking ? 'reserved' : 'available';
    changeEquipmentStatus(ctx, actor.id, { ...equipment, status: 'issued' }, nextStatus, `Возврат по заявке №${booking.id}`);
    notify(ctx, booking.user_id, `Возврат по заявке №${booking.id} принят: ${RETURN_CONDITION_LABELS[condition].toLowerCase()}`, booking.id);
    if (condition !== 'full') {
      notifyRole(ctx, 'manager', `${RETURN_CONDITION_LABELS[condition]} при возврате «${equipment.name}» (заявка №${booking.id}): ${note}`, booking.id);
    }
  });
  return getBooking(ctx, actor, id);
}

export function remindBooking(ctx, actor, id) {
  assertCan(actor, 'booking.handover');
  const booking = loadBooking(ctx.db, id);
  assertStatus(booking, ['issued'], 'напомнить о возврате');
  const equipment = loadEquipmentRow(ctx.db, booking.equipment_id);
  const lateDays = daysBetween(booking.end_date, ctx.clock.today());
  const text = lateDays > 0
    ? `Возврат «${equipment.name}» просрочен на ${lateDays} дн. Верните оборудование в пункт выдачи`
    : `Напоминание: верните «${equipment.name}» до ${formatRu(booking.end_date)} включительно`;
  notify(ctx, booking.user_id, text, booking.id);
  logAction(ctx, {
    userId: actor.id, action: 'Напоминание о возврате', objectType: 'booking', objectId: booking.id, details: text,
  });
  return getBooking(ctx, actor, id);
}
