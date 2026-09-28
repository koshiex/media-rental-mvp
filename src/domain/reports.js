import { overlapDays, periodLength } from './dates.js';
import { invalid } from './errors.js';
import { assertCan } from './permissions.js';
import { requireDate } from './validate.js';

const MAX_PERIOD_DAYS = 366;
const USED_STATUSES = "('approved', 'issued', 'returned')";

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function utilizationByEquipment(ctx, from, to, periodDays) {
  const equipment = ctx.db.prepare('SELECT id, name, inventory_number, category FROM equipment ORDER BY name').all();
  const bookings = ctx.db
    .prepare(`SELECT equipment_id, start_date, end_date FROM bookings
      WHERE status IN ${USED_STATUSES} AND start_date <= ? AND end_date >= ?`)
    .all(to, from);
  return equipment
    .map((item) => {
      const bookedDays = bookings
        .filter((booking) => booking.equipment_id === item.id)
        .reduce((sum, booking) => sum + overlapDays(booking.start_date, booking.end_date, from, to), 0);
      return {
        id: item.id, name: item.name, inventoryNumber: item.inventory_number, category: item.category,
        bookedDays, utilization: percent(Math.min(bookedDays, periodDays), periodDays),
      };
    })
    .sort((a, b) => b.utilization - a.utilization || a.name.localeCompare(b.name, 'ru'));
}

function utilizationByCategory(byEquipment, periodDays) {
  const groups = byEquipment.reduce((acc, item) => {
    const current = acc.get(item.category) ?? { category: item.category, units: 0, bookedDays: 0 };
    return acc.set(item.category, { ...current, units: current.units + 1, bookedDays: current.bookedDays + item.bookedDays });
  }, new Map());
  return [...groups.values()]
    .map((group) => ({ ...group, utilization: percent(group.bookedDays, group.units * periodDays) }))
    .sort((a, b) => b.utilization - a.utilization);
}

function requestTotals(ctx, from, to, today) {
  const counts = ctx.db
    .prepare(`SELECT status, COUNT(*) AS count FROM bookings
      WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY status`)
    .all(from, to);
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row.count]));
  const requests = counts.reduce((sum, row) => sum + row.count, 0);
  const decided = requests - (byStatus.new ?? 0) - (byStatus.clarification ?? 0) - (byStatus.cancelled ?? 0);
  const { overdue } = ctx.db
    .prepare(`SELECT COUNT(*) AS overdue FROM bookings WHERE end_date BETWEEN ? AND ?
      AND ((status = 'issued' AND end_date < ?) OR (status = 'returned' AND substr(returned_at, 1, 10) > end_date))`)
    .get(from, to, today);
  return {
    requests,
    rejected: byStatus.rejected ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    approvalRate: percent(decided - (byStatus.rejected ?? 0), decided),
    overdue,
  };
}

function damageList(ctx, from, to) {
  return ctx.db
    .prepare(`SELECT b.id, b.return_condition, b.return_comment, b.returned_at, e.name AS equipment_name,
        e.inventory_number, u.name AS user_name
      FROM bookings b JOIN equipment e ON e.id = b.equipment_id JOIN users u ON u.id = b.user_id
      WHERE b.status = 'returned' AND b.return_condition != 'full' AND substr(b.returned_at, 1, 10) BETWEEN ? AND ?
      ORDER BY b.returned_at DESC`)
    .all(from, to)
    .map((row) => ({
      bookingId: row.id, condition: row.return_condition, comment: row.return_comment, returnedAt: row.returned_at,
      equipmentName: row.equipment_name, inventoryNumber: row.inventory_number, userName: row.user_name,
    }));
}

function rejectionList(ctx, from, to) {
  return ctx.db
    .prepare(`SELECT b.id, b.staff_comment, b.start_date, b.end_date, e.name AS equipment_name, u.name AS user_name
      FROM bookings b JOIN equipment e ON e.id = b.equipment_id JOIN users u ON u.id = b.user_id
      WHERE b.status = 'rejected' AND substr(b.created_at, 1, 10) BETWEEN ? AND ? ORDER BY b.id DESC`)
    .all(from, to)
    .map((row) => ({
      bookingId: row.id, comment: row.staff_comment, startDate: row.start_date, endDate: row.end_date,
      equipmentName: row.equipment_name, userName: row.user_name,
    }));
}

export function buildReport(ctx, actor, { from, to } = {}) {
  assertCan(actor, 'report.view');
  const start = requireDate(from, 'Начало периода');
  const end = requireDate(to, 'Конец периода');
  if (end < start) throw invalid('Конец периода раньше начала');
  const periodDays = periodLength(start, end);
  if (periodDays > MAX_PERIOD_DAYS) throw invalid(`Период отчёта — не больше ${MAX_PERIOD_DAYS} дней`);

  const byEquipment = utilizationByEquipment(ctx, start, end, periodDays);
  const damages = damageList(ctx, start, end);
  const totals = requestTotals(ctx, start, end, ctx.clock.today());
  return {
    from: start,
    to: end,
    periodDays,
    totals: {
      ...totals,
      damaged: damages.filter((item) => item.condition === 'damaged').length,
      shortage: damages.filter((item) => item.condition === 'shortage').length,
      averageUtilization: percent(
        byEquipment.reduce((sum, item) => sum + Math.min(item.bookedDays, periodDays), 0),
        byEquipment.length * periodDays,
      ),
    },
    byEquipment,
    byCategory: utilizationByCategory(byEquipment, periodDays),
    damages,
    rejections: rejectionList(ctx, start, end),
  };
}
