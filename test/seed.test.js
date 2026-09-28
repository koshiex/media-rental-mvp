import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../src/db.js';
import { ACTIVE_BOOKING_STATUSES } from '../src/domain/statuses.js';
import { seedDatabase } from '../src/seed.js';
import { TODAY } from './helpers.js';

test('демо-данные не содержат пересекающихся активных броней и согласованы по статусам', () => {
  const db = openDatabase(':memory:');
  seedDatabase(db, TODAY);
  const active = db.prepare(`SELECT * FROM bookings WHERE status IN (${ACTIVE_BOOKING_STATUSES.map(() => '?').join(', ')})`)
    .all(...ACTIVE_BOOKING_STATUSES);

  for (const booking of active) {
    const overlaps = active.filter((other) => other.id !== booking.id && other.equipment_id === booking.equipment_id
      && other.start_date <= booking.end_date && other.end_date >= booking.start_date);
    assert.deepEqual(overlaps, [], `заявка №${booking.id} пересекается с другой активной`);
  }
  const issued = db.prepare("SELECT e.status FROM bookings b JOIN equipment e ON e.id = b.equipment_id WHERE b.status = 'issued'").all();
  assert.ok(issued.length > 0);
  assert.ok(issued.every((row) => row.status === 'issued'));
});

test('повторный сброс демо-данных даёт тот же набор', () => {
  const db = openDatabase(':memory:');
  seedDatabase(db, TODAY);
  const first = db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count;

  seedDatabase(db, TODAY);

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, first);
  assert.equal(db.prepare('SELECT MIN(id) AS id FROM users').get().id, 1);
});
