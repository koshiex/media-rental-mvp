import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  approveBooking, cancelBooking, clarifyBooking, createBooking, issueBooking,
  rejectBooking, remindBooking, resubmitBooking, returnBooking,
} from '../src/domain/bookings.js';
import { getBooking, listBookings, listOverdue } from '../src/domain/bookings-query.js';
import { listAudit } from '../src/domain/audit.js';
import { listNotifications } from '../src/domain/notifications.js';
import { createTestContext, day, equipmentStatus, withToday } from './helpers.js';

let ctx;
let users;
let equipment;

beforeEach(() => {
  ({ ctx, users, equipment } = createTestContext());
});

const book = (user, equipmentId, start, end, purpose = 'Съёмка учебного ролика') =>
  createBooking(ctx, user, { equipmentId, startDate: day(start), endDate: day(end), purpose });

describe('создание заявки', () => {
  test('создаёт заявку на согласовании и уведомляет пункт выдачи', () => {
    const booking = book(users.student, equipment.camera, 1, 3);

    assert.equal(booking.status, 'new');
    assert.equal(booking.startDate, day(1));
    const staffInbox = listNotifications(ctx, users.staff);
    assert.equal(staffInbox.unread, 1);
    assert.match(staffInbox.items[0].text, /Новая заявка/);
  });

  test('отклоняет пересечение с активной заявкой на ту же единицу (FR-06, NFR-03)', () => {
    book(users.student, equipment.camera, 1, 3);

    assert.throws(() => book(users.teacher, equipment.camera, 3, 4), { code: 'conflict', status: 409 });
  });

  test('разрешает соседний период без пересечения', () => {
    book(users.student, equipment.camera, 1, 3);

    const next = book(users.teacher, equipment.camera, 4, 5);

    assert.equal(next.status, 'new');
  });

  test('не учитывает отменённые и отклонённые заявки при проверке пересечений', () => {
    const first = book(users.student, equipment.camera, 1, 3);
    cancelBooking(ctx, users.student, first.id, { reason: 'Съёмку перенесли' });
    const second = book(users.teacher, equipment.camera, 1, 2);
    rejectBooking(ctx, users.staff, second.id, { comment: 'Техника нужна на мероприятие' });

    const third = book(users.student, equipment.camera, 2, 3);

    assert.equal(third.status, 'new');
  });

  test('требует допуск для оборудования с ограничением', () => {
    assert.throws(() => book(users.novice, equipment.camera, 1, 2), { code: 'clearance_required', status: 403 });
  });

  test('проверяет даты, срок выдачи и доступность оборудования', () => {
    assert.throws(() => book(users.student, equipment.recorder, -1, 1), { code: 'validation' });
    assert.throws(() => book(users.student, equipment.recorder, 3, 1), { code: 'validation' });
    assert.throws(() => book(users.student, equipment.camera, 1, 6), /Максимальный срок/);
    assert.throws(() => book(users.student, equipment.broken, 1, 2), { code: 'conflict' });
  });

  test('сотрудник пункта выдачи не может создать заявку', () => {
    assert.throws(() => book(users.staff, equipment.recorder, 1, 2), { code: 'forbidden', status: 403 });
  });
});

describe('жизненный цикл заявки', () => {
  test('согласование бронирует технику, выдача и полный возврат освобождают её', () => {
    const booking = book(users.student, equipment.recorder, 0, 2);

    approveBooking(ctx, users.staff, booking.id, { comment: 'Заберите после 12:00' });
    assert.equal(equipmentStatus(ctx, equipment.recorder), 'reserved');

    const issued = issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер', 'Кабель'] });
    assert.equal(issued.status, 'issued');
    assert.deepEqual(issued.issuedKit, ['Рекордер', 'Кабель']);
    assert.equal(equipmentStatus(ctx, equipment.recorder), 'issued');

    const returned = returnBooking(ctx, users.staff, booking.id, { condition: 'full' });
    assert.equal(returned.status, 'returned');
    assert.equal(equipmentStatus(ctx, equipment.recorder), 'available');
  });

  test('журнал хранит пользователя, действие и смену статуса (FR-18, NFR-05)', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});

    const entries = listAudit(ctx, users.admin, { objectType: 'booking', objectId: booking.id });

    assert.deepEqual(entries.map((entry) => [entry.userName, entry.oldStatus, entry.newStatus]), [
      ['Сотрудник выдачи', 'new', 'approved'],
      ['Студент С допуском', null, 'new'],
    ]);
  });

  test('возврат с повреждением требует комментарий и отправляет технику на проверку (FR-08, FR-09)', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});
    issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер', 'Кабель'] });

    assert.throws(() => returnBooking(ctx, users.staff, booking.id, { condition: 'damaged' }), { code: 'validation' });
    const returned = returnBooking(ctx, users.staff, booking.id, {
      condition: 'damaged',
      comment: 'Треснул корпус',
      photo: 'data:image/png;base64,iVBORw0KGgo=',
    });

    assert.equal(returned.returnCondition, 'damaged');
    assert.equal(returned.hasDamagePhoto, true);
    assert.equal(equipmentStatus(ctx, equipment.recorder), 'inspection');
  });

  test('отвергает фото не в формате изображения', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});
    issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер'] });

    assert.throws(
      () => returnBooking(ctx, users.staff, booking.id, { condition: 'damaged', comment: 'Скол', photo: 'data:text/html;base64,PHA+' }),
      { code: 'validation' },
    );
  });

  test('уточнение возвращает заявку автору, повторная отправка снова ставит её на согласование', () => {
    const booking = book(users.student, equipment.recorder, 1, 2);

    const clarified = clarifyBooking(ctx, users.staff, booking.id, { comment: 'Для какой дисциплины?' });
    assert.equal(clarified.status, 'clarification');
    assert.throws(() => clarifyBooking(ctx, users.staff, booking.id, { comment: 'Ещё раз' }), { code: 'conflict' });

    const resubmitted = resubmitBooking(ctx, users.student, booking.id, { purpose: 'Курсовой фильм по видеомонтажу' });
    assert.equal(resubmitted.status, 'new');
    assert.equal(resubmitted.purpose, 'Курсовой фильм по видеомонтажу');
  });

  test('отмена доступна только автору, требует причину и снимает бронь с техники (FR-05)', () => {
    const booking = book(users.student, equipment.recorder, 1, 2);
    approveBooking(ctx, users.staff, booking.id, {});

    assert.throws(() => cancelBooking(ctx, users.teacher, booking.id, { reason: 'Чужая' }), { code: 'forbidden' });
    assert.throws(() => cancelBooking(ctx, users.student, booking.id, {}), { code: 'validation' });
    cancelBooking(ctx, users.student, booking.id, { reason: 'Съёмку перенесли' });

    assert.equal(equipmentStatus(ctx, equipment.recorder), 'available');
  });

  test('получатель не может согласовать заявку', () => {
    const booking = book(users.student, equipment.recorder, 1, 2);

    assert.throws(() => approveBooking(ctx, users.student, booking.id, {}), { code: 'forbidden' });
  });

  test('выдача невозможна до начала периода и пока техника на руках', () => {
    const early = book(users.student, equipment.recorder, 2, 3);
    approveBooking(ctx, users.staff, early.id, {});
    assert.throws(() => issueBooking(ctx, users.staff, early.id, { kit: ['Рекордер'] }), /с 30\.09\.2026/);

    const current = book(users.teacher, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, current.id, {});
    issueBooking(ctx, users.staff, current.id, { kit: ['Рекордер'] });
    const later = withToday(ctx, day(2));
    assert.throws(() => issueBooking(later, users.staff, early.id, { kit: ['Рекордер'] }), /ещё не возвращено/);
  });

  test('состав выдачи должен входить в комплект оборудования (FR-07)', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});

    assert.throws(() => issueBooking(ctx, users.staff, booking.id, { kit: ['Штатив'] }), { code: 'validation' });
  });
});

describe('просрочки и доступ к заявкам', () => {
  test('считает дни просрочки по выданным заявкам (FR-10)', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});
    issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер'] });

    const later = withToday(ctx, day(4));
    const overdue = listOverdue(later, users.staff);

    assert.equal(overdue.length, 1);
    assert.equal(overdue[0].overdueDays, 3);
    assert.throws(() => listOverdue(later, users.student), { code: 'forbidden' });
  });

  test('напоминание о возврате приходит получателю', () => {
    const booking = book(users.student, equipment.recorder, 0, 1);
    approveBooking(ctx, users.staff, booking.id, {});
    issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер'] });

    remindBooking(withToday(ctx, day(3)), users.staff, booking.id);

    assert.match(listNotifications(ctx, users.student).items[0].text, /просрочен на 2 дн/);
  });

  test('получатель видит только свои заявки, чужую заявку открыть нельзя', () => {
    const own = book(users.student, equipment.recorder, 1, 2);
    book(users.teacher, equipment.recorder, 3, 4);

    assert.equal(listBookings(ctx, users.student, { scope: 'mine' }).length, 1);
    assert.throws(() => listBookings(ctx, users.student, { scope: 'all' }), { code: 'forbidden' });
    assert.throws(() => getBooking(ctx, users.teacher, own.id), { code: 'forbidden' });
    assert.equal(listBookings(ctx, users.staff, { scope: 'all' }).length, 2);
  });
});
