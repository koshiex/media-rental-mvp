import { openDatabase } from '../src/db.js';
import { fixedClock } from '../src/domain/clock.js';
import { addDays } from '../src/domain/dates.js';
import { findUser } from '../src/domain/users.js';

export const TODAY = '2026-09-28';
export const day = (offset) => addDays(TODAY, offset);

function insertUser(db, { name, role, kind = 'student', hasClearance = false }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, role, kind, group_name, has_clearance) VALUES (?, ?, ?, ?, ?)')
    .run(name, role, kind, kind === 'student' ? 'ТЕСТ-01-26' : null, hasClearance ? 1 : 0);
  return Number(lastInsertRowid);
}

function insertEquipment(db, { inventoryNumber, name, category, kit, requiresClearance = false, maxDays = 7, status = 'available' }) {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO equipment (inventory_number, name, category, status, kit, requires_clearance, max_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(inventoryNumber, name, category, status, JSON.stringify(kit), requiresClearance ? 1 : 0, maxDays);
  return Number(lastInsertRowid);
}

export function createTestContext(today = TODAY) {
  const db = openDatabase(':memory:');
  const ctx = { db, clock: fixedClock(today) };
  const userIds = {
    student: insertUser(db, { name: 'Студент С допуском', role: 'recipient', hasClearance: true }),
    novice: insertUser(db, { name: 'Студент Без допуска', role: 'recipient' }),
    teacher: insertUser(db, { name: 'Преподаватель', role: 'recipient', kind: 'teacher', hasClearance: true }),
    staff: insertUser(db, { name: 'Сотрудник выдачи', role: 'staff', kind: 'employee' }),
    admin: insertUser(db, { name: 'Администратор', role: 'admin', kind: 'employee' }),
    support: insertUser(db, { name: 'Поддержка', role: 'support', kind: 'employee' }),
    manager: insertUser(db, { name: 'Руководитель', role: 'manager', kind: 'employee' }),
  };
  const users = Object.fromEntries(Object.entries(userIds).map(([key, id]) => [key, findUser(ctx, id)]));
  const equipment = {
    camera: insertEquipment(db, {
      inventoryNumber: 'Т-КАМ-001', name: 'Камера', category: 'Камеры',
      kit: ['Корпус', 'Аккумулятор', 'Карта памяти'], requiresClearance: true, maxDays: 5,
    }),
    recorder: insertEquipment(db, {
      inventoryNumber: 'Т-ЗВК-001', name: 'Рекордер', category: 'Звук', kit: ['Рекордер', 'Кабель'],
    }),
    broken: insertEquipment(db, {
      inventoryNumber: 'Т-СВТ-001', name: 'Осветитель', category: 'Свет', kit: ['Осветитель'], status: 'unavailable',
    }),
  };
  return { ctx, users, equipment };
}

export function withToday(ctx, today) {
  return { ...ctx, clock: fixedClock(today) };
}

export function equipmentStatus(ctx, id) {
  return ctx.db.prepare('SELECT status FROM equipment WHERE id = ?').get(id).status;
}
