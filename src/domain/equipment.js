import { logAction } from './audit.js';
import { addDays, isIsoDate } from './dates.js';
import { conflict, invalid, notFound } from './errors.js';
import { assertCan, can } from './permissions.js';
import { ACTIVE_BOOKING_STATUSES, CATEGORIES, EQUIPMENT_STATUS_LABELS } from './statuses.js';
import {
  requireBoolean, requireId, requireInt, requireOneOf, requireText, requireTextList,
} from './validate.js';

const EQUIPMENT_STATUSES = Object.keys(EQUIPMENT_STATUS_LABELS);
const CLEARANCE_FILTERS = ['all', 'none', 'mine'];
const MAX_ISSUE_DAYS = 30;
const INVENTORY_NUMBER = /^[\p{L}\d-]+$/u;
const ACTIVE_PLACEHOLDERS = ACTIVE_BOOKING_STATUSES.map(() => '?').join(', ');

export function toEquipmentDto(row) {
  return {
    id: row.id,
    inventoryNumber: row.inventory_number,
    name: row.name,
    category: row.category,
    status: row.status,
    kit: JSON.parse(row.kit),
    requiresClearance: row.requires_clearance === 1,
    maxDays: row.max_days,
    description: row.description,
  };
}

export function loadEquipmentRow(db, id) {
  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  if (!row) throw notFound('Оборудование не найдено');
  return row;
}

// An overdue item is still out, so it stays busy at least until today.
const effectiveEnd = (booking, today) =>
  booking.status === 'issued' && booking.end_date < today ? today : booking.end_date;

export function nearestFreePeriod(busy, status, today) {
  if (status === 'unavailable') return null;
  let cursor = status === 'inspection' ? addDays(today, 1) : today;
  for (const booking of busy) {
    const end = effectiveEnd(booking, today);
    if (end < cursor) continue;
    if (booking.start_date > cursor) return { from: cursor, to: addDays(booking.start_date, -1) };
    cursor = addDays(end, 1);
  }
  return { from: cursor, to: null };
}

function isBusy(busy, period, today) {
  return busy.some((booking) => booking.start_date <= period.to && effectiveEnd(booking, today) >= period.from);
}

function activeBookings(db, equipmentId = null) {
  const filter = equipmentId === null ? '' : 'AND b.equipment_id = ?';
  const params = equipmentId === null ? [] : [equipmentId];
  return db
    .prepare(`SELECT b.id, b.equipment_id, b.user_id, b.start_date, b.end_date, b.status, u.name AS user_name
      FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.status IN (${ACTIVE_PLACEHOLDERS}) ${filter} ORDER BY b.start_date`)
    .all(...ACTIVE_BOOKING_STATUSES, ...params);
}

function groupByEquipment(bookings) {
  return bookings.reduce((groups, booking) => {
    const list = groups.get(booking.equipment_id) ?? [];
    return groups.set(booking.equipment_id, [...list, booking]);
  }, new Map());
}

function parsePeriod(from, to) {
  if (!from && !to) return null;
  if (!isIsoDate(from) || !isIsoDate(to)) throw invalid('Укажите обе даты периода');
  if (to < from) throw invalid('Дата окончания раньше даты начала');
  return { from, to };
}

function describe(row, busy, today, period, actor) {
  const dto = toEquipmentDto(row);
  return {
    ...dto,
    nearestFree: nearestFreePeriod(busy, row.status, today),
    freeInPeriod: period ? row.status !== 'unavailable' && !isBusy(busy, period, today) : null,
    canBook: !dto.requiresClearance || actor.hasClearance,
  };
}

function byCatalogOrder(a, b) {
  return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, 'ru');
}

function matches(item, filters, today) {
  if (filters.category && item.category !== filters.category) return false;
  if (filters.query) {
    const haystack = `${item.name} ${item.inventoryNumber} ${item.kit.join(' ')}`.toLowerCase();
    if (!haystack.includes(filters.query)) return false;
  }
  if (filters.clearance === 'none' && item.requiresClearance) return false;
  if (filters.clearance === 'mine' && !item.canBook) return false;
  if (filters.onlyFree) return filters.period ? item.freeInPeriod : item.nearestFree?.from === today;
  return true;
}

export function listEquipment(ctx, actor, filters = {}) {
  const today = ctx.clock.today();
  const period = parsePeriod(filters.from, filters.to);
  const busyByEquipment = groupByEquipment(activeBookings(ctx.db));
  const criteria = {
    category: filters.category ? requireOneOf(filters.category, CATEGORIES, 'категория') : null,
    query: (filters.q ?? '').trim().toLowerCase(),
    clearance: filters.clearance ? requireOneOf(filters.clearance, CLEARANCE_FILTERS, 'допуск') : 'all',
    onlyFree: filters.onlyFree === '1',
    period,
  };
  return ctx.db
    .prepare('SELECT * FROM equipment')
    .all()
    .map((row) => describe(row, busyByEquipment.get(row.id) ?? [], today, period, actor))
    .filter((item) => matches(item, criteria, today))
    .sort(byCatalogOrder);
}

export function getEquipment(ctx, actor, id) {
  const row = loadEquipmentRow(ctx.db, requireId(id, 'оборудование'));
  const busy = activeBookings(ctx.db, row.id);
  const seesOwners = can(actor, 'booking.viewAll');
  const schedule = busy.map((booking) => {
    const isMine = booking.user_id === actor.id;
    return {
      bookingId: seesOwners || isMine ? booking.id : null,
      startDate: booking.start_date,
      endDate: effectiveEnd(booking, ctx.clock.today()),
      status: booking.status,
      userName: seesOwners ? booking.user_name : null,
      isMine,
    };
  });
  return { ...describe(row, busy, ctx.clock.today(), null, actor), schedule };
}

function validateFields(input, current) {
  const pick = (key, validate) => (input[key] === undefined ? current[key] : validate(input[key]));
  return {
    inventoryNumber: pick('inventoryNumber', (value) => {
      const text = requireText(value, 'Инвентарный номер', { max: 30 });
      if (!INVENTORY_NUMBER.test(text)) throw invalid('Инвентарный номер: только буквы, цифры и дефис');
      return text;
    }),
    name: pick('name', (value) => requireText(value, 'Название', { max: 120 })),
    category: pick('category', (value) => requireOneOf(value, CATEGORIES, 'категория')),
    kit: pick('kit', (value) => requireTextList(value, 'Состав комплекта')),
    requiresClearance: pick('requiresClearance', (value) => requireBoolean(value, 'нужен допуск')),
    maxDays: pick('maxDays', (value) => requireInt(value, 'Максимальный срок', { min: 1, max: MAX_ISSUE_DAYS })),
    description: pick('description', (value) => requireText(value, 'Описание', { max: 1000, optional: true })),
  };
}

const EMPTY_CARD = {
  inventoryNumber: undefined, name: undefined, category: undefined, kit: undefined,
  requiresClearance: false, maxDays: 7, description: '',
};

export function createEquipment(ctx, actor, input) {
  assertCan(actor, 'equipment.manage');
  const fields = validateFields(input, EMPTY_CARD);
  if (fields.inventoryNumber === undefined || fields.name === undefined || fields.category === undefined || !fields.kit) {
    throw invalid('Заполните инвентарный номер, название, категорию и состав комплекта');
  }
  if (ctx.db.prepare('SELECT 1 FROM equipment WHERE inventory_number = ?').get(fields.inventoryNumber)) {
    throw conflict(`Инвентарный номер ${fields.inventoryNumber} уже используется`);
  }
  const { lastInsertRowid } = ctx.db
    .prepare(`INSERT INTO equipment (inventory_number, name, category, kit, requires_clearance, max_days, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(fields.inventoryNumber, fields.name, fields.category, JSON.stringify(fields.kit),
      fields.requiresClearance ? 1 : 0, fields.maxDays, fields.description);
  const id = Number(lastInsertRowid);
  logAction(ctx, {
    userId: actor.id, action: 'Создание карточки оборудования', objectType: 'equipment', objectId: id,
    newStatus: 'available', details: `${fields.inventoryNumber} · ${fields.name}`,
  });
  return getEquipment(ctx, actor, id);
}

export function changeEquipmentStatus(ctx, userId, row, newStatus, details) {
  if (row.status === newStatus) return;
  ctx.db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run(newStatus, row.id);
  logAction(ctx, {
    userId, action: 'Смена статуса оборудования', objectType: 'equipment', objectId: row.id,
    oldStatus: row.status, newStatus, details,
  });
}

function assertManualStatusAllowed(ctx, row, newStatus) {
  if (newStatus === row.status) return;
  if (newStatus === 'issued') throw conflict('Статус «Выдана» ставится только при оформлении выдачи');
  const issued = ctx.db
    .prepare("SELECT id FROM bookings WHERE equipment_id = ? AND status = 'issued'")
    .get(row.id);
  if (issued) throw conflict(`Оборудование на руках по заявке №${issued.id}: статус изменится при приёме возврата`);
}

export function updateEquipment(ctx, actor, id, patch) {
  assertCan(actor, 'equipment.manage');
  const row = loadEquipmentRow(ctx.db, requireId(id, 'оборудование'));
  const current = toEquipmentDto(row);
  const fields = validateFields(patch, current);
  if (fields.inventoryNumber !== current.inventoryNumber
    && ctx.db.prepare('SELECT 1 FROM equipment WHERE inventory_number = ?').get(fields.inventoryNumber)) {
    throw conflict(`Инвентарный номер ${fields.inventoryNumber} уже используется`);
  }
  const status = patch.status === undefined ? row.status : requireOneOf(patch.status, EQUIPMENT_STATUSES, 'статус');
  assertManualStatusAllowed(ctx, row, status);

  const cardChanged = JSON.stringify(fields) !== JSON.stringify(validateFields({}, current));
  if (cardChanged) {
    ctx.db
      .prepare(`UPDATE equipment SET inventory_number = ?, name = ?, category = ?, kit = ?, requires_clearance = ?,
        max_days = ?, description = ? WHERE id = ?`)
      .run(fields.inventoryNumber, fields.name, fields.category, JSON.stringify(fields.kit),
        fields.requiresClearance ? 1 : 0, fields.maxDays, fields.description, row.id);
    logAction(ctx, {
      userId: actor.id, action: 'Изменение карточки оборудования', objectType: 'equipment', objectId: row.id,
      details: `${fields.inventoryNumber} · ${fields.name}`,
    });
  }
  changeEquipmentStatus(ctx, actor.id, row, status, 'Ручная смена статуса администратором');
  return getEquipment(ctx, actor, row.id);
}
