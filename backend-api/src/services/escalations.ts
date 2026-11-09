import { randomBytes } from 'node:crypto';
import { PoolClient } from 'pg';
import { many, one, query } from '../config/db';
import { AppError } from '../utils/errors';
import { writeAudit } from '../utils/audit';
import { sanitizeText } from '../utils/sanitize';

export type EscalationType = 'RULE_ENGINE' | 'PLAN_REVIEW' | 'ACADEMIC' | 'ANOMALY' | 'IMPORT' | 'OTHER';

export interface EscalationRow {
  id: string;
  ticket_no: string;
  student_id: string;
  created_by: string | null;
  assigned_to: string | null;
  type: EscalationType;
  status: 'open' | 'in_review' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  related_plan_id: string | null;
  related_course_code: string | null;
  anomaly_ids: string[];
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEscalationInput {
  studentId: string;
  createdBy: string | null;
  type: EscalationType;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  relatedCourseCode?: string | null;
  relatedPlanId?: string | null;
  anomalyIds?: string[];
  dedupe?: boolean;
}

function ticketNo(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ESC-${stamp}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function assignedAdvisorUser(studentId: string): Promise<string | null> {
  const row = await one<{ user_id: string }>(
    `SELECT a.user_id FROM students s JOIN advisors a ON a.id = s.advisor_id WHERE s.id = $1`,
    [studentId],
  );
  return row?.user_id ?? null;
}

export async function notify(
  userId: string | null,
  type: string,
  title: string,
  body: string,
  client?: PoolClient,
): Promise<void> {
  if (!userId) return;
  const text = `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4)`;
  const params = [userId, type, title, body];
  if (client) await client.query(text, params);
  else await query(text, params);
}

export async function createEscalation(
  input: CreateEscalationInput,
  client?: PoolClient,
): Promise<EscalationRow> {
  const executor = client ?? null;
  if (input.dedupe) {
    const existing = await one<EscalationRow>(
      `SELECT * FROM escalations
        WHERE student_id = $1 AND type = $2 AND status IN ('open','in_review')
          AND COALESCE(related_course_code, '') = COALESCE($3, '')
        ORDER BY created_at DESC LIMIT 1`,
      [input.studentId, input.type, input.relatedCourseCode ?? null],
    );
    if (existing) return existing;
  }
  const assignee = await assignedAdvisorUser(input.studentId);
  const id = crypto.randomUUID();
  const sql = `
    INSERT INTO escalations
      (id, ticket_no, student_id, created_by, assigned_to, type, priority, subject,
       description, related_plan_id, related_course_code, anomaly_ids)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`;
  const params = [
    id,
    ticketNo(),
    input.studentId,
    input.createdBy,
    assignee,
    input.type,
    input.priority ?? 'medium',
    sanitizeText(input.subject, 300),
    sanitizeText(input.description, 5000),
    input.relatedPlanId ?? null,
    input.relatedCourseCode ?? null,
    JSON.stringify(input.anomalyIds ?? []),
  ];
  let row: EscalationRow | null;
  if (executor) {
    row = (await executor.query<EscalationRow>(sql, params)).rows[0] ?? null;
    await executor.query(
      `INSERT INTO escalation_events (escalation_id, actor_id, event_type, notes)
       VALUES ($1,$2,'created',$3)`,
      [id, input.createdBy, 'Case opened automatically'],
    );
  } else {
    row = await one<EscalationRow>(sql, params);
    await query(
      `INSERT INTO escalation_events (escalation_id, actor_id, event_type, notes)
       VALUES ($1,$2,'created',$3)`,
      [id, input.createdBy, 'Case opened automatically'],
    );
  }
  if (!row) throw new AppError(500, 'ESCALATION_FAILED', 'Could not create escalation', {}, false);
  await notify(assignee, 'escalation', `New advising case ${row.ticket_no}`, row.subject, client);
  const studentUser = await one<{ user_id: string }>('SELECT user_id FROM students WHERE id = $1', [
    input.studentId,
  ]);
  await notify(
    studentUser?.user_id ?? null,
    'escalation',
    'Your case was referred to an advisor',
    `${row.ticket_no}: ${row.subject}`,
    client,
  );
  await writeAudit(
    {
      actorId: input.createdBy,
      action: 'ESCALATION_CREATED',
      entityType: 'escalation',
      entityId: row.id,
      after: {
        ticketNo: row.ticket_no,
        type: row.type,
        course: row.related_course_code,
        anomalyIds: row.anomaly_ids,
      },
    },
    client,
  );
  return row;
}

export async function listEscalations(filters: {
  studentId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: EscalationRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.studentId) {
    params.push(filters.studentId);
    where.push(`e.student_id = $${params.length}`);
  }
  if (filters.assignedTo) {
    params.push(filters.assignedTo);
    where.push(`e.assigned_to = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`e.status = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    where.push(`e.type = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM escalations e ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many<EscalationRow>(
    `SELECT e.* FROM escalations e ${clause}
      ORDER BY CASE e.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getEscalation(id: string): Promise<EscalationRow> {
  const row = await one<EscalationRow>('SELECT * FROM escalations WHERE id = $1', [id]);
  if (!row) throw AppError.notFound('Escalation not found');
  return row;
}

export async function updateEscalation(
  id: string,
  actorId: string,
  patch: {
    status?: 'open' | 'in_review' | 'resolved' | 'closed';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignedTo?: string | null;
    resolution?: string | null;
  },
): Promise<EscalationRow> {
  const before = await getEscalation(id);
  const resolved = patch.status === 'resolved' || patch.status === 'closed';
  const row = await one<EscalationRow>(
    `UPDATE escalations SET
       status = COALESCE($2, status),
       priority = COALESCE($3, priority),
       assigned_to = COALESCE($4, assigned_to),
       resolution = COALESCE($5, resolution),
       resolved_by = CASE WHEN $6 THEN $7 ELSE resolved_by END,
       resolved_at = CASE WHEN $6 THEN now() ELSE resolved_at END
     WHERE id = $1 RETURNING *`,
    [
      id,
      patch.status ?? null,
      patch.priority ?? null,
      patch.assignedTo === undefined ? null : patch.assignedTo,
      patch.resolution ? sanitizeText(patch.resolution, 5000) : null,
      resolved,
      actorId,
    ],
  );
  await query(
    `INSERT INTO escalation_events (escalation_id, actor_id, event_type, notes)
     VALUES ($1,$2,$3,$4)`,
    [id, actorId, resolved ? 'resolved' : 'updated', patch.resolution ?? patch.status ?? null],
  );
  await writeAudit({
    actorId,
    action: 'ESCALATION_UPDATED',
    entityType: 'escalation',
    entityId: id,
    before: { status: before.status, priority: before.priority, assignedTo: before.assigned_to },
    after: { status: row?.status, priority: row?.priority, assignedTo: row?.assigned_to },
  });
  if (!row) throw AppError.notFound('Escalation not found');
  return row;
}

export async function escalationEvents(id: string) {
  return many(
    `SELECT ev.id, ev.event_type, ev.notes, ev.created_at, ev.actor_id, u.full_name AS actor_name
       FROM escalation_events ev LEFT JOIN users u ON u.id = ev.actor_id
      WHERE ev.escalation_id = $1 ORDER BY ev.created_at`,
    [id],
  );
}
