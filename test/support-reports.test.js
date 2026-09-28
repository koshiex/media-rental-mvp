import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  approveBooking, createBooking, issueBooking, rejectBooking, returnBooking,
} from '../src/domain/bookings.js';
import { buildReport } from '../src/domain/reports.js';
import { createProblem, createTicket, listProblems, listTickets, updateTicket } from '../src/domain/support.js';
import { listNotifications } from '../src/domain/notifications.js';
import { createTestContext, day, withToday } from './helpers.js';

let ctx;
let users;
let equipment;

beforeEach(() => {
  ({ ctx, users, equipment } = createTestContext());
});

describe('поддержка пользователей (FR-14, FR-15, FR-17)', () => {
  const ticket = (user, subject) =>
    createTicket(ctx, user, { category: 'booking', subject, description: 'Кнопка «Отправить» выдаёт ошибку' });

  test('обращение создаётся со статусом «Новое» и видно поддержке', () => {
    const created = ticket(users.student, 'Не отправляется заявка');

    assert.equal(created.status, 'open');
    assert.equal(created.priority, 'medium');
    assert.equal(listTickets(ctx, users.support).length, 1);
    assert.equal(listTickets(ctx, users.teacher).length, 0);
  });

  test('смена статуса уведомляет автора обращения', () => {
    const created = ticket(users.student, 'Не отправляется заявка');

    updateTicket(ctx, users.support, created.id, { status: 'resolved', resolution: 'Исправили валидацию дат' });

    assert.match(listNotifications(ctx, users.student).items[0].text, /Решено/);
  });

  test('повторяющиеся обращения переводятся в проблему', () => {
    const first = ticket(users.student, 'Ошибка при отправке');
    const second = ticket(users.teacher, 'Ошибка при отправке заявки');

    const problem = createProblem(ctx, users.support, {
      title: 'Сбой отправки заявки',
      cause: 'Двойной клик создаёт второй запрос',
      impact: 'Пользователи видят ложную ошибку',
      ticketIds: [first.id, second.id],
    });

    assert.equal(problem.tickets.length, 2);
    assert.ok(listTickets(ctx, users.support).every((item) => item.problem?.id === problem.id));
    assert.equal(listProblems(ctx, users.manager).length, 1);
    assert.throws(() => createProblem(ctx, users.student, { title: 'x', cause: 'y', impact: 'z', ticketIds: [first.id] }), {
      code: 'forbidden',
    });
  });
});

describe('отчётность (FR-16)', () => {
  test('считает загрузку, отказы, повреждения и просрочки за период', () => {
    const issued = createBooking(ctx, users.student, {
      equipmentId: equipment.recorder, startDate: day(0), endDate: day(4), purpose: 'Подкаст',
    });
    approveBooking(ctx, users.staff, issued.id, {});
    issueBooking(ctx, users.staff, issued.id, { kit: ['Рекордер', 'Кабель'] });
    returnBooking(withToday(ctx, day(6)), users.staff, issued.id, { condition: 'damaged', comment: 'Сломан кабель' });

    const rejected = createBooking(ctx, users.student, {
      equipmentId: equipment.camera, startDate: day(1), endDate: day(2), purpose: 'Портреты',
    });
    rejectBooking(ctx, users.staff, rejected.id, { comment: 'Камера нужна на мероприятие' });

    const report = buildReport(withToday(ctx, day(9)), users.manager, { from: day(0), to: day(9) });

    const recorder = report.byEquipment.find((item) => item.id === equipment.recorder);
    assert.equal(recorder.bookedDays, 5);
    assert.equal(recorder.utilization, 50);
    assert.equal(report.totals.requests, 2);
    assert.equal(report.totals.rejected, 1);
    assert.equal(report.totals.damaged, 1);
    assert.equal(report.totals.overdue, 1);
    assert.equal(report.damages[0].comment, 'Сломан кабель');
  });

  test('отчёт недоступен получателю', () => {
    assert.throws(() => buildReport(ctx, users.student, { from: day(0), to: day(1) }), { code: 'forbidden' });
  });
});
