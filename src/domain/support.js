import { inTransaction } from '../db.js';
import { logAction } from './audit.js';
import { conflict, forbidden, invalid, notFound } from './errors.js';
import { notify, notifyRole } from './notifications.js';
import { assertCan, can } from './permissions.js';
import {
  PROBLEM_STATUS_LABELS, TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS,
} from './statuses.js';
import { optionalId, requireId, requireOneOf, requireText } from './validate.js';

const MAX_TICKETS_PER_PROBLEM = 50;

const TICKET_SELECT = `SELECT t.*, u.name AS user_name, e.name AS equipment_name, p.title AS problem_title
  FROM tickets t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN bookings b ON b.id = t.booking_id
  LEFT JOIN equipment e ON e.id = b.equipment_id
  LEFT JOIN problems p ON p.id = t.problem_id`;

function toTicketDto(row) {
  return {
    id: row.id,
    user: { id: row.user_id, name: row.user_name },
    booking: row.booking_id ? { id: row.booking_id, equipmentName: row.equipment_name } : null,
    category: row.category,
    priority: row.priority,
    status: row.status,
    subject: row.subject,
    description: row.description,
    resolution: row.resolution,
    problem: row.problem_id ? { id: row.problem_id, title: row.problem_title } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadTicket(ctx, id) {
  const row = ctx.db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(requireId(id, 'обращение'));
  if (!row) throw notFound('Обращение не найдено');
  return row;
}

export function createTicket(ctx, actor, input) {
  assertCan(actor, 'ticket.create');
  const category = requireOneOf(input.category, Object.keys(TICKET_CATEGORY_LABELS), 'категория');
  const subject = requireText(input.subject, 'Тема', { max: 150 });
  const description = requireText(input.description, 'Описание', { max: 2000 });
  const bookingId = optionalId(input.bookingId, 'заявка');
  if (bookingId) {
    const booking = ctx.db.prepare('SELECT user_id FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) throw notFound('Связанная заявка не найдена');
    if (booking.user_id !== actor.id && !can(actor, 'booking.viewAll')) throw forbidden('Можно привязать только свою заявку');
  }
  const now = ctx.clock.now();
  const { lastInsertRowid } = ctx.db
    .prepare(`INSERT INTO tickets (user_id, booking_id, category, subject, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(actor.id, bookingId, category, subject, description, now, now);
  const id = Number(lastInsertRowid);
  logAction(ctx, {
    userId: actor.id, action: 'Создание обращения', objectType: 'ticket', objectId: id, newStatus: 'open', details: subject,
  });
  notifyRole(ctx, 'support', `Новое обращение №${id}: ${subject}`);
  return toTicketDto(loadTicket(ctx, id));
}

export function listTickets(ctx, actor) {
  const own = !can(actor, 'ticket.manage');
  const rows = own
    ? ctx.db.prepare(`${TICKET_SELECT} WHERE t.user_id = ? ORDER BY t.id DESC`).all(actor.id)
    : ctx.db.prepare(`${TICKET_SELECT} ORDER BY CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
        CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.id DESC`).all();
  return rows.map(toTicketDto);
}

export function updateTicket(ctx, actor, id, patch) {
  assertCan(actor, 'ticket.manage');
  const row = loadTicket(ctx, id);
  const status = patch.status === undefined ? row.status : requireOneOf(patch.status, Object.keys(TICKET_STATUS_LABELS), 'статус');
  const priority = patch.priority === undefined
    ? row.priority
    : requireOneOf(patch.priority, Object.keys(TICKET_PRIORITY_LABELS), 'приоритет');
  const resolution = patch.resolution === undefined
    ? row.resolution
    : requireText(patch.resolution, 'Ответ пользователю', { max: 2000, optional: true }) || null;

  ctx.db
    .prepare('UPDATE tickets SET status = ?, priority = ?, resolution = ?, updated_at = ? WHERE id = ?')
    .run(status, priority, resolution, ctx.clock.now(), row.id);
  if (status !== row.status || priority !== row.priority) {
    logAction(ctx, {
      userId: actor.id, action: 'Обработка обращения', objectType: 'ticket', objectId: row.id,
      oldStatus: row.status, newStatus: status, details: `Приоритет: ${TICKET_PRIORITY_LABELS[priority]}`,
    });
  }
  if (status !== row.status) {
    const suffix = resolution ? `. Ответ: ${resolution}` : '';
    notify(ctx, row.user_id, `Обращение №${row.id} «${row.subject}»: ${TICKET_STATUS_LABELS[status]}${suffix}`);
  }
  return toTicketDto(loadTicket(ctx, row.id));
}

function loadProblem(ctx, id) {
  const row = ctx.db.prepare('SELECT * FROM problems WHERE id = ?').get(id);
  if (!row) throw notFound('Проблема не найдена');
  const tickets = ctx.db.prepare(`${TICKET_SELECT} WHERE t.problem_id = ? ORDER BY t.id`).all(id).map(toTicketDto);
  return {
    id: row.id, title: row.title, cause: row.cause, impact: row.impact, status: row.status,
    createdAt: row.created_at, tickets,
  };
}

export function createProblem(ctx, actor, input) {
  assertCan(actor, 'ticket.manage');
  const title = requireText(input.title, 'Название проблемы', { max: 150 });
  const cause = requireText(input.cause, 'Причина', { max: 2000 });
  const impact = requireText(input.impact, 'Влияние', { max: 2000 });
  if (!Array.isArray(input.ticketIds) || !input.ticketIds.length || input.ticketIds.length > MAX_TICKETS_PER_PROBLEM) {
    throw invalid('Выберите хотя бы одно обращение');
  }
  const ticketIds = [...new Set(input.ticketIds.map((ticketId) => requireId(ticketId, 'обращение')))];
  const problemId = inTransaction(ctx.db, () => {
    const tickets = ticketIds.map((ticketId) => loadTicket(ctx, ticketId));
    const linked = tickets.find((ticket) => ticket.problem_id);
    if (linked) throw conflict(`Обращение №${linked.id} уже связано с проблемой №${linked.problem_id}`);
    const { lastInsertRowid } = ctx.db
      .prepare('INSERT INTO problems (title, cause, impact, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(title, cause, impact, actor.id, ctx.clock.now());
    const id = Number(lastInsertRowid);
    const link = ctx.db.prepare("UPDATE tickets SET problem_id = ?, status = 'in_progress', updated_at = ? WHERE id = ?");
    for (const ticket of tickets) link.run(id, ctx.clock.now(), ticket.id);
    logAction(ctx, {
      userId: actor.id, action: 'Регистрация проблемы', objectType: 'problem', objectId: id, newStatus: 'open',
      details: `${title}; обращения: ${ticketIds.map((ticketId) => `№${ticketId}`).join(', ')}`,
    });
    notifyRole(ctx, 'manager', `Зарегистрирована проблема ИС №${id}: ${title}`);
    return id;
  });
  return loadProblem(ctx, problemId);
}

export function listProblems(ctx, actor) {
  assertCan(actor, 'problem.view');
  return ctx.db.prepare('SELECT id FROM problems ORDER BY id DESC').all().map(({ id }) => loadProblem(ctx, id));
}

export function updateProblem(ctx, actor, id, { status }) {
  assertCan(actor, 'ticket.manage');
  const problem = loadProblem(ctx, requireId(id, 'проблема'));
  const next = requireOneOf(status, Object.keys(PROBLEM_STATUS_LABELS), 'статус');
  if (next === problem.status) return problem;
  ctx.db.prepare('UPDATE problems SET status = ? WHERE id = ?').run(next, problem.id);
  logAction(ctx, {
    userId: actor.id, action: 'Смена статуса проблемы', objectType: 'problem', objectId: problem.id,
    oldStatus: problem.status, newStatus: next, details: problem.title,
  });
  return loadProblem(ctx, problem.id);
}
