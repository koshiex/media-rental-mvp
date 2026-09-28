import { queryAudit } from './audit.js';
import { daysBetween } from './dates.js';
import { forbidden, notFound } from './errors.js';
import { assertCan, can } from './permissions.js';
import { BOOKING_STATUS_LABELS } from './statuses.js';
import { requireId, requireOneOf } from './validate.js';

const BOOKING_STATUSES = Object.keys(BOOKING_STATUS_LABELS);
const SCOPES = ['mine', 'all'];

const BOOKING_SELECT = `SELECT b.*, e.name AS equipment_name, e.inventory_number, e.category,
  e.kit AS equipment_kit, e.status AS equipment_status, u.name AS user_name, u.kind AS user_kind,
  u.group_name, u.has_clearance
  FROM bookings b
  JOIN equipment e ON e.id = b.equipment_id
  JOIN users u ON u.id = b.user_id`;

const STATUS_ORDER = `CASE b.status WHEN 'new' THEN 1 WHEN 'clarification' THEN 2 WHEN 'approved' THEN 3
  WHEN 'issued' THEN 4 ELSE 5 END`;

export function toBookingDto(row, today) {
  const isOverdue = row.status === 'issued' && row.end_date < today;
  return {
    id: row.id,
    equipment: {
      id: row.equipment_id,
      name: row.equipment_name,
      inventoryNumber: row.inventory_number,
      category: row.category,
      kit: JSON.parse(row.equipment_kit),
      status: row.equipment_status,
    },
    user: {
      id: row.user_id,
      name: row.user_name,
      kind: row.user_kind,
      group: row.group_name,
      hasClearance: row.has_clearance === 1,
    },
    startDate: row.start_date,
    endDate: row.end_date,
    purpose: row.purpose,
    status: row.status,
    staffComment: row.staff_comment,
    cancelReason: row.cancel_reason,
    issuedAt: row.issued_at,
    issuedKit: row.issued_kit ? JSON.parse(row.issued_kit) : null,
    returnedAt: row.returned_at,
    returnCondition: row.return_condition,
    returnComment: row.return_comment,
    hasDamagePhoto: Boolean(row.damage_photo),
    createdAt: row.created_at,
    overdueDays: isOverdue ? daysBetween(row.end_date, today) : 0,
  };
}

function parseStatuses(value) {
  if (!value) return [];
  return String(value).split(',').map((status) => requireOneOf(status, BOOKING_STATUSES, 'статус'));
}

export function listBookings(ctx, actor, { scope = 'mine', status } = {}) {
  requireOneOf(scope, SCOPES, 'область');
  if (scope === 'all') assertCan(actor, 'booking.viewAll');
  const statuses = parseStatuses(status);
  const conditions = [];
  const params = [];
  if (scope === 'mine') {
    conditions.push('b.user_id = ?');
    params.push(actor.id);
  }
  if (statuses.length) {
    conditions.push(`b.status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const today = ctx.clock.today();
  return ctx.db
    .prepare(`${BOOKING_SELECT} ${where} ORDER BY ${STATUS_ORDER}, b.start_date, b.id`)
    .all(...params)
    .map((row) => toBookingDto(row, today));
}

export function getBooking(ctx, actor, id) {
  const bookingId = requireId(id, 'заявка');
  const row = ctx.db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(bookingId);
  if (!row) throw notFound('Заявка не найдена');
  if (row.user_id !== actor.id && !can(actor, 'booking.viewAll')) {
    throw forbidden('Заявка принадлежит другому пользователю');
  }
  const history = queryAudit(ctx, { objectType: 'booking', objectId: bookingId }).reverse();
  return { ...toBookingDto(row, ctx.clock.today()), damagePhoto: row.damage_photo, history };
}

export function listOverdue(ctx, actor) {
  assertCan(actor, 'overdue.view');
  const today = ctx.clock.today();
  return ctx.db
    .prepare(`${BOOKING_SELECT} WHERE b.status = 'issued' AND b.end_date < ? ORDER BY b.end_date, b.id`)
    .all(today)
    .map((row) => toBookingDto(row, today));
}
