import { AppError } from '../../utils/errors';
import { many, one } from '../../config/db';
import { writeAudit } from '../../utils/audit';
import { evaluateCourse } from '../../services/advising';
import { updateEscalation } from '../../services/escalations';
import { requireStudentById } from '../../services/studentContext';
import { parseTerm } from '../../services/term';

export interface AnomalyRow {
  id: string;
  severity: 'blocking' | 'warning' | 'info';
  type: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string;
  description_en: string | null;
  sources: Array<Record<string, unknown>>;
  affected_courses: string[];
  affected_rules: string[];
  working_value: string | null;
  resolved_value: string | null;
  engine_behavior: string | null;
  suggested_resolution: string | null;
  status: 'open' | 'resolved';
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function listAnomalies(filters: {
  status?: string;
  severity?: string;
  type?: string;
  course?: string;
  limit: number;
  offset: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.status) add('status = ?', filters.status);
  if (filters.severity) add('severity = ?', filters.severity);
  if (filters.type) add('type = ?', filters.type);
  if (filters.course) add(`affected_courses @> to_jsonb(ARRAY[?]::text[])`, filters.course);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM data_anomalies ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many<AnomalyRow>(
    `SELECT * FROM data_anomalies ${clause}
      ORDER BY CASE severity WHEN 'blocking' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function getAnomaly(id: string): Promise<AnomalyRow> {
  const row = await one<AnomalyRow>('SELECT * FROM data_anomalies WHERE id = $1', [id]);
  if (!row) throw AppError.notFound('Anomaly not found');
  return row;
}

/**
 * Resolve an anomaly and re-evaluate every decision that was escalated because
 * of it. Original sources and the historical working value are preserved.
 */
export async function resolveAnomaly(
  id: string,
  input: { resolvedValue: string; note?: string },
  actorId: string,
  context: { ip?: string | null; correlationId?: string },
) {
  const before = await getAnomaly(id);
  if (before.status === 'resolved') {
    throw AppError.conflict('ANOMALY_ALREADY_RESOLVED', 'Anomaly is already resolved');
  }
  const row = await one<AnomalyRow>(
    `UPDATE data_anomalies SET status = 'resolved', resolved_value = $2,
       resolved_by = $3, resolved_at = now(), working_value = COALESCE(working_value, $2)
     WHERE id = $1 RETURNING *`,
    [id, input.resolvedValue, actorId],
  );
  await writeAudit({
    actorId,
    action: 'ANOMALY_RESOLVED',
    entityType: 'data_anomaly',
    entityId: id,
    before: { status: before.status, workingValue: before.working_value },
    after: { status: 'resolved', resolvedValue: input.resolvedValue, note: input.note ?? null },
    ip: context.ip ?? null,
    correlationId: context.correlationId ?? null,
  });

  const reEvaluated = await reEvaluateAffected(id, actorId);
  return { anomaly: row, ...reEvaluated };
}

export async function reopenAnomaly(id: string, actorId: string, reason: string) {
  const before = await getAnomaly(id);
  if (before.status === 'open') throw AppError.conflict('ANOMALY_ALREADY_OPEN', 'Anomaly is open');
  const row = await one<AnomalyRow>(
    `UPDATE data_anomalies SET status = 'open', resolved_value = NULL, resolved_by = NULL,
       resolved_at = NULL WHERE id = $1 RETURNING *`,
    [id],
  );
  await writeAudit({
    actorId,
    action: 'ANOMALY_REOPENED',
    entityType: 'data_anomaly',
    entityId: id,
    before: { status: before.status, resolvedValue: before.resolved_value },
    after: { status: 'open', reason },
  });
  return row;
}

async function reEvaluateAffected(anomalyId: string, actorId: string) {
  const escalations = await many<{
    id: string;
    student_id: string;
    related_course_code: string | null;
  }>(
    `SELECT id, student_id, related_course_code FROM escalations
      WHERE status IN ('open','in_review') AND anomaly_ids @> $1::jsonb
      ORDER BY created_at LIMIT 100`,
    [JSON.stringify([anomalyId])],
  );
  let resolved = 0;
  let stillReview = 0;
  const errors: string[] = [];
  for (const escalation of escalations) {
    if (!escalation.related_course_code) continue;
    try {
      const student = await requireStudentById(escalation.student_id);
      const term = parseTerm(undefined);
      const result = await evaluateCourse(student, escalation.related_course_code, term, actorId, {
        graduationPossible: student.passed_credits >= 115,
      });
      if (result.decision.status !== 'REVIEW_REQUIRED') {
        await updateEscalation(escalation.id, actorId, {
          status: 'resolved',
          resolution: `Re-evaluated after resolving ${anomalyId}: now ${result.decision.status} (${result.decision.rule_code}).`,
        });
        resolved += 1;
      } else {
        stillReview += 1;
      }
    } catch {
      errors.push(`${escalation.id}: re-evaluation failed`);
    }
  }
  return { reEvaluated: escalations.length, autoResolved: resolved, stillReview, errors };
}
