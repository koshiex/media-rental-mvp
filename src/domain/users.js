import { logAction } from './audit.js';
import { conflict, notFound } from './errors.js';
import { notify } from './notifications.js';
import { ROLE_LABELS, ROLES, assertCan } from './permissions.js';
import { requireBoolean, requireId, requireOneOf } from './validate.js';

const ROLE_ORDER = `CASE role WHEN 'recipient' THEN 1 WHEN 'staff' THEN 2 WHEN 'admin' THEN 3
  WHEN 'support' THEN 4 ELSE 5 END`;

export function toUserDto(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role],
    kind: row.kind,
    group: row.group_name,
    hasClearance: row.has_clearance === 1,
  };
}

export function listUsers(ctx) {
  return ctx.db.prepare(`SELECT * FROM users ORDER BY ${ROLE_ORDER}, name`).all().map(toUserDto);
}

export function findUser(ctx, id) {
  const row = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? toUserDto(row) : null;
}

export function updateUser(ctx, actor, id, patch) {
  assertCan(actor, 'user.manage');
  const userId = requireId(id, 'пользователь');
  const current = findUser(ctx, userId);
  if (!current) throw notFound('Пользователь не найден');
  const role = patch.role === undefined ? current.role : requireOneOf(patch.role, ROLES, 'роль');
  const hasClearance = patch.hasClearance === undefined
    ? current.hasClearance
    : requireBoolean(patch.hasClearance, 'допуск');
  if (userId === actor.id && role !== current.role) {
    throw conflict('Нельзя изменить собственную роль: так можно потерять доступ к управлению правами');
  }

  ctx.db.prepare('UPDATE users SET role = ?, has_clearance = ? WHERE id = ?').run(role, hasClearance ? 1 : 0, userId);
  if (role !== current.role) {
    logAction(ctx, {
      userId: actor.id, action: 'Назначение роли', objectType: 'user', objectId: userId,
      oldStatus: current.role, newStatus: role, details: current.name,
    });
    notify(ctx, userId, `Ваша роль изменена: ${ROLE_LABELS[role]}`);
  }
  if (hasClearance !== current.hasClearance) {
    logAction(ctx, {
      userId: actor.id, action: hasClearance ? 'Выдача допуска' : 'Отзыв допуска', objectType: 'user',
      objectId: userId, details: current.name,
    });
    notify(ctx, userId, hasClearance
      ? 'Вам выдан допуск к оборудованию с ограничениями'
      : 'Допуск к оборудованию с ограничениями отозван');
  }
  return findUser(ctx, userId);
}
