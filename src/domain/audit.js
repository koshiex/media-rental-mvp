import { assertCan } from './permissions.js';
import { requireId, requireOneOf } from './validate.js';

const OBJECT_TYPES = ['booking', 'equipment', 'ticket', 'problem', 'user'];
const MAX_ENTRIES = 500;

export function logAction(ctx, entry) {
  const { userId = null, action, objectType, objectId, oldStatus = null, newStatus = null, details = '' } = entry;
  ctx.db
    .prepare(`INSERT INTO audit_log (user_id, action, object_type, object_id, old_status, new_status, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, action, objectType, objectId, oldStatus, newStatus, details ?? '', ctx.clock.now());
}

function toAuditDto(row) {
  return {
    id: row.id,
    userName: row.user_name ?? 'Система',
    userRole: row.user_role ?? null,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    details: row.details,
    createdAt: row.created_at,
  };
}

export function queryAudit(ctx, { objectType, objectId, limit = MAX_ENTRIES } = {}) {
  const conditions = [];
  const params = [];
  if (objectType) {
    conditions.push('a.object_type = ?');
    params.push(requireOneOf(objectType, OBJECT_TYPES, 'тип объекта'));
  }
  if (objectId) {
    conditions.push('a.object_id = ?');
    params.push(requireId(objectId, 'объект'));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return ctx.db
    .prepare(`SELECT a.*, u.name AS user_name, u.role AS user_role FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`)
    .all(...params, Math.min(Number(limit) || MAX_ENTRIES, MAX_ENTRIES))
    .map(toAuditDto);
}

export function listAudit(ctx, actor, filters = {}) {
  assertCan(actor, 'audit.view');
  return queryAudit(ctx, filters);
}
