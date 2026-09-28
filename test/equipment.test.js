import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { approveBooking, createBooking, issueBooking } from '../src/domain/bookings.js';
import {
  createEquipment, getEquipment, listEquipment, nearestFreePeriod, updateEquipment,
} from '../src/domain/equipment.js';
import { listAudit } from '../src/domain/audit.js';
import { updateUser } from '../src/domain/users.js';
import { createTestContext, day, withToday } from './helpers.js';

let ctx;
let users;
let equipment;

beforeEach(() => {
  ({ ctx, users, equipment } = createTestContext());
});

describe('ближайший свободный период (FR-01)', () => {
  const busy = (start, end, status = 'approved') => ({ start_date: day(start), end_date: day(end), status });

  test('свободно с сегодняшнего дня, если броней нет', () => {
    assert.deepEqual(nearestFreePeriod([], 'available', day(0)), { from: day(0), to: null });
  });

  test('находит окно между бронями', () => {
    const period = nearestFreePeriod([busy(0, 2), busy(5, 6)], 'reserved', day(0));

    assert.deepEqual(period, { from: day(3), to: day(4) });
  });

  test('просроченная выдача держит технику до возврата', () => {
    const period = nearestFreePeriod([busy(-4, -1, 'issued')], 'issued', day(0));

    assert.deepEqual(period, { from: day(1), to: null });
  });

  test('недоступная техника не имеет свободного периода', () => {
    assert.equal(nearestFreePeriod([], 'unavailable', day(0)), null);
  });
});

describe('каталог и фильтры (FR-02)', () => {
  test('фильтрует по категории и допуску', () => {
    const sound = listEquipment(ctx, users.novice, { category: 'Звук' });
    const withoutClearance = listEquipment(ctx, users.novice, { clearance: 'mine' });

    assert.deepEqual(sound.map((item) => item.name), ['Рекордер']);
    assert.ok(!withoutClearance.some((item) => item.requiresClearance));
  });

  test('скрывает занятую в выбранный период технику', () => {
    createBooking(ctx, users.student, {
      equipmentId: equipment.recorder, startDate: day(1), endDate: day(2), purpose: 'Интервью',
    });

    const free = listEquipment(ctx, users.teacher, { from: day(2), to: day(3), onlyFree: '1' });

    assert.ok(!free.some((item) => item.id === equipment.recorder));
    assert.ok(free.some((item) => item.id === equipment.camera));
  });

  test('получатель не видит, кто занял технику, сотрудник видит', () => {
    createBooking(ctx, users.student, {
      equipmentId: equipment.recorder, startDate: day(1), endDate: day(2), purpose: 'Интервью',
    });

    assert.equal(getEquipment(ctx, users.teacher, equipment.recorder).schedule[0].userName, null);
    assert.equal(getEquipment(ctx, users.staff, equipment.recorder).schedule[0].userName, 'Студент С допуском');
  });
});

describe('карточки и статусы (FR-11, FR-12)', () => {
  const input = {
    inventoryNumber: 'МП-ЗВК-777', name: 'Петличка', category: 'Звук',
    kit: ['Микрофон', 'Кабель'], requiresClearance: false, maxDays: 3, description: 'Для интервью',
  };

  test('администратор создаёт карточку, дубликат номера отклоняется', () => {
    const created = createEquipment(ctx, users.admin, input);

    assert.equal(created.status, 'available');
    assert.deepEqual(created.kit, ['Микрофон', 'Кабель']);
    assert.throws(() => createEquipment(ctx, users.admin, input), { code: 'conflict' });
  });

  test('только администратор управляет карточками', () => {
    assert.throws(() => createEquipment(ctx, users.staff, input), { code: 'forbidden' });
    assert.throws(() => updateEquipment(ctx, users.student, equipment.recorder, { status: 'unavailable' }), { code: 'forbidden' });
  });

  test('смена статуса пишется в журнал со старым и новым значением', () => {
    updateEquipment(ctx, users.admin, equipment.recorder, { status: 'unavailable' });

    const [entry] = listAudit(ctx, users.admin, { objectType: 'equipment', objectId: equipment.recorder });
    assert.equal(entry.oldStatus, 'available');
    assert.equal(entry.newStatus, 'unavailable');
  });

  test('нельзя вручную вернуть в доступные технику, которая на руках', () => {
    const booking = createBooking(ctx, users.student, {
      equipmentId: equipment.recorder, startDate: day(0), endDate: day(1), purpose: 'Интервью',
    });
    approveBooking(ctx, users.staff, booking.id, {});
    issueBooking(ctx, users.staff, booking.id, { kit: ['Рекордер'] });

    assert.throws(() => updateEquipment(ctx, users.admin, equipment.recorder, { status: 'available' }), { code: 'conflict' });
  });
});

describe('права пользователей (NFR-07)', () => {
  test('выданный допуск действует сразу', () => {
    updateUser(ctx, users.admin, users.novice.id, { hasClearance: true });
    const refreshed = { ...users.novice, hasClearance: true };

    const booking = createBooking(withToday(ctx, day(0)), refreshed, {
      equipmentId: equipment.camera, startDate: day(1), endDate: day(1), purpose: 'Портреты',
    });

    assert.equal(booking.status, 'new');
  });

  test('администратор не может снять роль с самого себя', () => {
    assert.throws(() => updateUser(ctx, users.admin, users.admin.id, { role: 'recipient' }), { code: 'conflict' });
  });
});
