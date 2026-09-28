const PAGE_SIZE = 50;

export function notify(ctx, userId, text, bookingId = null) {
  ctx.db
    .prepare('INSERT INTO notifications (user_id, booking_id, text, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, bookingId, text, ctx.clock.now());
}

export function notifyRole(ctx, role, text, bookingId = null) {
  const recipients = ctx.db.prepare('SELECT id FROM users WHERE role = ?').all(role);
  for (const { id } of recipients) notify(ctx, id, text, bookingId);
}

export function listNotifications(ctx, actor) {
  const items = ctx.db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(actor.id, PAGE_SIZE)
    .map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      text: row.text,
      isRead: row.is_read === 1,
      createdAt: row.created_at,
    }));
  const { unread } = ctx.db
    .prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(actor.id);
  return { items, unread };
}

export function markAllRead(ctx, actor) {
  ctx.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(actor.id);
  return { ok: true };
}
