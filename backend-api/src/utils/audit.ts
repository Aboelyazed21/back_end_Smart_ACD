import { PoolClient } from 'pg';
import { query } from '../config/db';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

/** Append-only audit entry. Accepts a transaction client when atomicity matters. */
export async function writeAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const text = `
    INSERT INTO audit_logs
      (actor_id, action, entity_type, entity_id, before, after, ip, user_agent, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;
  const params = [
    entry.actorId,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    entry.ip ?? null,
    entry.userAgent ?? null,
    entry.correlationId ?? null,
  ];
  if (client) {
    await client.query(text, params);
  } else {
    await query(text, params);
  }
}
