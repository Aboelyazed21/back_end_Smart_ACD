import { many, one } from '../../config/db';
import { AppError } from '../../utils/errors';

export async function listAuditLogs(filters: {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.actorId) add('a.actor_id = ?', filters.actorId);
  if (filters.entityType) add('a.entity_type = ?', filters.entityType);
  if (filters.entityId) add('a.entity_id = ?', filters.entityId);
  if (filters.action) add('a.action = ?', filters.action);
  if (filters.from) add('a.created_at >= ?::timestamptz', filters.from);
  if (filters.to) add('a.created_at <= ?::timestamptz', filters.to);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_logs a ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `SELECT a.id, a.actor_id, u.full_name AS actor_name, a.action, a.entity_type, a.entity_id,
            a.before, a.after, a.ip, a.correlation_id, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${clause} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function listRules(filters: {
  search?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(
      `(rule_code ILIKE $${params.length} OR title_ar ILIKE $${params.length} OR title_en ILIKE $${params.length})`,
    );
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM regulation_rules ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `SELECT rule_code, article_no, clause_no, page_no, title_ar, title_en, summary_ar,
            summary_en, status
       FROM regulation_rules ${clause} ORDER BY article_no, rule_code
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function getRule(ruleCode: string) {
  const row = await one('SELECT * FROM regulation_rules WHERE rule_code = $1', [ruleCode]);
  if (!row) throw AppError.notFound('Rule not found');
  return row;
}

export async function listAllEscalations(filters: {
  status?: string;
  type?: string;
  priority?: string;
  limit: number;
  offset: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.status) add('e.status = ?', filters.status);
  if (filters.type) add('e.type = ?', filters.type);
  if (filters.priority) add('e.priority = ?', filters.priority);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM escalations e ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `SELECT e.*, s.student_code, u.full_name AS student_name, a.full_name AS assignee_name
       FROM escalations e
       JOIN students s ON s.id = e.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN users a ON a.id = e.assigned_to
       ${clause}
      ORDER BY CASE e.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}
