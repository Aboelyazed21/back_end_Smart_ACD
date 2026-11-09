import { many, one, query } from '../config/db';
import { mailer } from '../integrations/mailer';
import { AppError } from '../utils/errors';
import { notify } from './escalations';

export async function sendPasswordReset(email: string, token: string): Promise<void> {
  await mailer.sendPasswordReset(email, token);
}

export async function listNotifications(userId: string, onlyUnread: boolean, limit: number, offset: number) {
  const clause = onlyUnread ? 'AND read_at IS NULL' : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 ${clause}`,
    [userId],
  );
  const rows = await many(
    `SELECT id, type, title, body, channel, read_at, created_at
       FROM notifications WHERE user_id = $1 ${clause}
      ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await one<{ count: string }>(
    'SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function markRead(userId: string, notificationId: string) {
  const row = await one<{ id: string }>(
    `UPDATE notifications SET read_at = now()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
    [notificationId, userId],
  );
  if (!row) throw AppError.notFound('Notification not found');
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await notify(userId, type, title.slice(0, 200), body.slice(0, 2000));
}
