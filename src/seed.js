import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inTransaction, openDatabase } from './db.js';
import { addDays, formatRangeRu, formatRu, localIsoDate } from './domain/dates.js';
import { BOOKINGS, EQUIPMENT, PROBLEMS, TICKETS, USERS } from './seed-data.js';

const TABLES = ['audit_log', 'notifications', 'tickets', 'problems', 'bookings', 'equipment', 'users'];
const INSPECTION_WINDOW_DAYS = 7;

function createSeeder(db, today) {
  const at = (offset, time) => `${addDays(today, offset)}T${time}.000Z`;
  const audit = db.prepare(`INSERT INTO audit_log (user_id, action, object_type, object_id, old_status, new_status, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const notification = db.prepare('INSERT INTO notifications (user_id, booking_id, text, is_read, created_at) VALUES (?, ?, ?, ?, ?)');
  return {
    at,
    log: (userId, action, objectType, objectId, oldStatus, newStatus, details, createdAt) =>
      audit.run(userId, action, objectType, objectId, oldStatus, newStatus, details, createdAt),
    notify: (userId, bookingId, text, isRead, createdAt) => notification.run(userId, bookingId, text, isRead ? 1 : 0, createdAt),
  };
}

function insertUsers(db) {
  const insert = db.prepare('INSERT INTO users (name, role, kind, group_name, has_clearance) VALUES (?, ?, ?, ?, ?)');
  return Object.fromEntries(USERS.map((user) => [
    user.key,
    Number(insert.run(user.name, user.role, user.kind, user.group, user.clearance ? 1 : 0).lastInsertRowid),
  ]));
}

function deriveStatus(item, bookings) {
  const own = bookings.filter((booking) => booking.equipment === item.key);
  if (own.some((booking) => booking.status === 'issued')) return 'issued';
  if (own.some((booking) => booking.status === 'approved')) return 'reserved';
  const recentDamage = own.some((booking) => booking.status === 'returned' && booking.condition !== 'full'
    && booking.end + (booking.returnedLate ?? 0) >= -INSPECTION_WINDOW_DAYS);
  if (recentDamage) return 'inspection';
  return item.status ?? 'available';
}

function insertEquipment(db) {
  const insert = db.prepare(`INSERT INTO equipment (inventory_number, name, category, status, kit, requires_clearance, max_days, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  return Object.fromEntries(EQUIPMENT.map((item) => [item.key, {
    ...item,
    id: Number(insert.run(item.inv, item.name, item.category, deriveStatus(item, BOOKINGS), JSON.stringify(item.kit),
      item.clearance ? 1 : 0, item.maxDays, item.description).lastInsertRowid),
  }]));
}

const createdOffset = (booking) => booking.created ?? Math.min(booking.start - 2, -1);

function insertBooking(db, seeder, booking, ids) {
  const { at, log } = seeder;
  const equipment = ids.equipment[booking.equipment];
  const userId = ids.users[booking.user];
  const staffId = ids.users.maria;
  const startDate = addDays(ids.today, booking.start);
  const endDate = addDays(ids.today, booking.end);
  const created = createdOffset(booking);
  const handedOver = ['issued', 'returned'].includes(booking.status);
  const returnedOffset = booking.end + (booking.returnedLate ?? 0);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO bookings (equipment_id, user_id, start_date, end_date, purpose, status, staff_comment, cancel_reason,
      issued_at, issued_kit, returned_at, return_condition, return_comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(equipment.id, userId, startDate, endDate, booking.purpose, booking.status, booking.staffComment ?? null,
      booking.cancelReason ?? null, handedOver ? at(booking.start, '07:05:00') : null,
      handedOver ? JSON.stringify(equipment.kit) : null, booking.status === 'returned' ? at(returnedOffset, '14:20:00') : null,
      booking.condition ?? null, booking.returnComment ?? null, at(created, '06:15:00'));
  const id = Number(lastInsertRowid);
  const period = formatRangeRu(startDate, endDate);

  log(userId, 'Создание заявки', 'booking', id, null, 'new', `${equipment.name}, ${period}`, at(created, '06:15:00'));
  logBookingOutcome(seeder, booking, { id, userId, staffId, equipment, startDate, period, created, returnedOffset, ids });
  return id;
}

function logBookingOutcome(seeder, booking, context) {
  const { at, log, notify } = seeder;
  const { id, userId, staffId, equipment, startDate, period, created, returnedOffset, ids } = context;
  const handedOver = ['issued', 'returned'].includes(booking.status);
  if (booking.status === 'cancelled') {
    log(userId, 'Отмена заявки', 'booking', id, 'new', 'cancelled', booking.cancelReason, at(created, '12:00:00'));
    return;
  }
  if (['rejected', 'clarification'].includes(booking.status)) {
    const action = booking.status === 'rejected' ? 'Отклонение заявки' : 'Запрос уточнения';
    log(staffId, action, 'booking', id, 'new', booking.status, booking.staffComment, at(created, '08:30:00'));
    const text = booking.status === 'rejected'
      ? `Заявка №${id} отклонена: ${booking.staffComment}`
      : `По заявке №${id} нужно уточнение: ${booking.staffComment}`;
    notify(userId, id, text, booking.status === 'rejected', at(created, '08:30:00'));
    return;
  }
  if (booking.status === 'new') {
    notify(staffId, id, `Новая заявка №${id}: ${equipment.name}, ${period}`, false, at(created, '06:15:00'));
    return;
  }
  log(staffId, 'Согласование заявки', 'booking', id, 'new', 'approved', '', at(created, '08:30:00'));
  notify(userId, id, `Заявка №${id} согласована. Получите «${equipment.name}» ${formatRu(startDate)} в пункте выдачи`,
    booking.status !== 'approved', at(created, '08:30:00'));
  if (!handedOver) return;
  log(staffId, 'Выдача оборудования', 'booking', id, 'approved', 'issued', 'Полный комплект', at(booking.start, '07:05:00'));
  if (booking.status === 'issued') {
    if (booking.end < 0) {
      notify(userId, id, `Возврат «${equipment.name}» просрочен на ${-booking.end} дн. Верните оборудование в пункт выдачи`,
        false, at(0, '06:00:00'));
    }
    return;
  }
  const late = booking.returnedLate ? `; просрочка ${booking.returnedLate} дн.` : '';
  const condition = { full: 'Полный комплект', shortage: 'Недостача', damaged: 'Повреждение' }[booking.condition];
  const comment = booking.returnComment ? `; ${booking.returnComment}` : '';
  log(staffId, 'Приём возврата', 'booking', id, 'issued', 'returned', `${condition}${comment}${late}`, at(returnedOffset, '14:20:00'));
  if (booking.condition !== 'full') {
    notify(ids.users.olga, id, `${condition} при возврате «${equipment.name}» (заявка №${id}): ${booking.returnComment}`,
      false, at(returnedOffset, '14:20:00'));
  }
}

function insertSupport(db, seeder, ids, bookingIds) {
  const { at, log, notify } = seeder;
  const problemIds = Object.fromEntries(PROBLEMS.map((problem) => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO problems (title, cause, impact, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(problem.title, problem.cause, problem.impact, problem.status, ids.users.elena, at(problem.created, '09:00:00'));
    const id = Number(lastInsertRowid);
    log(ids.users.elena, 'Регистрация проблемы', 'problem', id, null, 'open', problem.title, at(problem.created, '09:00:00'));
    log(ids.users.elena, 'Смена статуса проблемы', 'problem', id, 'open', problem.status, problem.title, at(problem.created, '11:00:00'));
    return [problem.key, id];
  }));
  for (const ticket of TICKETS) {
    const createdAt = at(ticket.created, '07:40:00');
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO tickets (user_id, booking_id, category, priority, status, subject, description, problem_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ids.users[ticket.user], ticket.booking ? bookingIds[ticket.booking] : null, ticket.category, ticket.priority,
        ticket.status, ticket.subject, ticket.description, ticket.problem ? problemIds[ticket.problem] : null, createdAt, createdAt);
    const id = Number(lastInsertRowid);
    log(ids.users[ticket.user], 'Создание обращения', 'ticket', id, null, 'open', ticket.subject, createdAt);
    notify(ids.users.elena, null, `Новое обращение №${id}: ${ticket.subject}`, ticket.status !== 'open', createdAt);
  }
}

function logEquipmentHistory(seeder, ids) {
  const { at, log } = seeder;
  const admin = ids.users.dmitry;
  log(admin, 'Смена статуса оборудования', 'equipment', ids.equipment.gh5.id, 'available', 'unavailable',
    'Отправлено в ремонт: не работает стабилизатор матрицы', at(-2, '10:00:00'));
  log(admin, 'Смена статуса оборудования', 'equipment', ids.equipment.gopro.id, 'inspection', 'available',
    'Проверка после возврата: стекло заменено', at(-6, '12:00:00'));
}

export function seedDatabase(db, today) {
  inTransaction(db, () => {
    for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    const seeder = createSeeder(db, today);
    const ids = { today, users: insertUsers(db), equipment: insertEquipment(db) };
    const ordered = [...BOOKINGS].sort((a, b) => createdOffset(a) - createdOffset(b) || a.start - b.start);
    const bookingIds = {};
    for (const booking of ordered) {
      bookingIds[`${booking.user}:${booking.equipment}`] = insertBooking(db, seeder, booking, ids);
    }
    insertSupport(db, seeder, ids, bookingIds);
    logEquipmentHistory(seeder, ids);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.env.DB_PATH ?? 'data/media-rental.db';
  mkdirSync(dirname(path), { recursive: true });
  const db = openDatabase(path);
  seedDatabase(db, localIsoDate(new Date()));
  db.close();
  console.log(`Демо-данные записаны в ${path}`);
}
