import { many, query } from '../../config/db';
import { logger } from '../../config/logger';
import { mailer } from '../../integrations/mailer';
import { writeAudit } from '../../utils/audit';
import { sanitizeText } from '../../utils/sanitize';

export type Audience = 'all' | 'students' | 'advisors' | 'admins';

const AUDIENCE_ROLES: Record<Audience, string[]> = {
  all: ['student', 'advisor', 'admin'],
  students: ['student'],
  advisors: ['advisor'],
  admins: ['admin'],
};

export interface BroadcastInput {
  audience: Audience;
  title: string;
  body: string;
  sendEmail?: boolean;
}

/**
 * Sends one in-app announcement to every active account in the audience and,
 * optionally, the same message by email. The audit entry records the audience
 * and the number of recipients, never the message body of individual users.
 */
export async function broadcast(
  input: BroadcastInput,
  actorId: string,
  context: { ip?: string | null; correlationId?: string | null },
) {
  const roles = AUDIENCE_ROLES[input.audience];
  const recipients = await many<{ id: string; email: string }>(
    `SELECT id, email FROM users
      WHERE deleted_at IS NULL AND status = 'active' AND role = ANY($1::text[])`,
    [roles],
  );
  if (recipients.length === 0) return { recipients: 0, emailed: 0 };

  const title = sanitizeText(input.title, 200);
  const body = sanitizeText(input.body, 2000);

  await query(
    `INSERT INTO notifications (user_id, type, title, body, channel, created_by)
     SELECT unnest($1::uuid[]), 'announcement', $2, $3, 'in_app', $4`,
    [recipients.map((recipient) => recipient.id), title, body, actorId],
  );

  let emailed = 0;
  if (input.sendEmail) {
    const results = await Promise.allSettled(
      recipients.map((recipient) => mailer.sendAnnouncement(recipient.email, title, body)),
    );
    emailed = results.filter((result) => result.status === 'fulfilled').length;
    if (emailed < recipients.length) {
      logger.warn({ failed: recipients.length - emailed }, 'some announcement emails could not be delivered');
    }
  }

  await writeAudit({
    actorId,
    action: 'ANNOUNCEMENT_SENT',
    entityType: 'notification',
    after: {
      audience: input.audience,
      title,
      recipients: recipients.length,
      emailed,
    },
    ip: context.ip ?? null,
    correlationId: context.correlationId ?? null,
  });

  return { recipients: recipients.length, emailed };
}

export async function recentBroadcasts(limit = 20) {
  return many(
    `SELECT min(n.created_at) AS created_at, n.title, n.body,
            count(*)::int AS recipients, n.created_by, u.full_name AS created_by_name
       FROM notifications n
       LEFT JOIN users u ON u.id = n.created_by
      WHERE n.type = 'announcement'
      GROUP BY n.title, n.body, n.created_by, u.full_name, date_trunc('minute', n.created_at)
      ORDER BY min(n.created_at) DESC
      LIMIT $1`,
    [limit],
  );
}
