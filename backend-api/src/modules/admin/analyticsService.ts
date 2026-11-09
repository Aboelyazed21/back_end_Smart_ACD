import { many, one } from '../../config/db';

export async function overview() {
  const [students, advisors, courses, plans, escalations, imports, anomalies, users] = await Promise.all([
    one<{ count: string; avg_cgpa: string | null }>(
      'SELECT count(*)::text AS count, avg(current_cgpa)::text AS avg_cgpa FROM students',
    ),
    one<{ count: string }>('SELECT count(*)::text AS count FROM advisors'),
    one<{ count: string }>('SELECT count(*)::text AS count FROM courses WHERE deleted_at IS NULL'),
    one<{
      total: string;
      draft: string;
      submitted: string;
      approved: string;
    }>(
      `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status='DRAFT')::text AS draft,
                count(*) FILTER (WHERE status='SUBMITTED')::text AS submitted,
                count(*) FILTER (WHERE status='APPROVED')::text AS approved
           FROM study_plans`,
    ),
    one<{ total: string; open: string; critical: string }>(
      `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status IN ('open','in_review'))::text AS open,
                count(*) FILTER (WHERE priority='critical' AND status IN ('open','in_review'))::text AS critical
           FROM escalations`,
    ),
    one<{ total: string; failed: string }>(
      `SELECT count(*)::text AS total, count(*) FILTER (WHERE status='failed')::text AS failed
           FROM import_jobs`,
    ),
    one<{ open: string; blocking: string; total: string }>(
      `SELECT count(*) FILTER (WHERE status='open')::text AS open,
                count(*) FILTER (WHERE status='open' AND severity='blocking')::text AS blocking,
                count(*)::text AS total
           FROM data_anomalies`,
    ),
    one<{ total: string; active: string }>(
      `SELECT count(*)::text AS total, count(*) FILTER (WHERE status='active' AND deleted_at IS NULL)::text AS active
           FROM users`,
    ),
  ]);
  return {
    students: { count: Number(students?.count ?? 0), averageCgpa: Number(students?.avg_cgpa ?? 0) },
    advisors: Number(advisors?.count ?? 0),
    courses: Number(courses?.count ?? 0),
    users,
    plans,
    escalations,
    imports,
    anomalies,
  };
}

export async function bottlenecks(limit = 20) {
  return many(
    `WITH RECURSIVE downstream(root, code) AS (
        SELECT cp.required_course_id, cp.course_id
          FROM course_prerequisites cp WHERE cp.type IN ('prerequisite','corequisite')
        UNION
        SELECT d.root, cp.course_id FROM downstream d
          JOIN course_prerequisites cp ON cp.required_course_id = d.code
         WHERE cp.type IN ('prerequisite','corequisite')
      )
      SELECT c.code, c.name_en, c.name_ar, c.credits, c.level_hint,
             COALESCE(count(e.id) FILTER (WHERE e.status IN ('failed','absent')),0)::int AS failure_count,
             COALESCE(count(e.id),0)::int AS attempts,
             CASE WHEN count(e.id) FILTER (WHERE e.status IN ('failed','absent')) = 0 THEN 0
                  ELSE round(100.0 * count(e.id) FILTER (WHERE e.status IN ('failed','absent')) / count(e.id), 1)
             END AS failure_rate_pct,
             (SELECT count(DISTINCT d.code)::int FROM downstream d WHERE d.root = c.id) AS downstream_unlocks
        FROM courses c
        LEFT JOIN enrollments e ON e.course_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY failure_count DESC, downstream_unlocks DESC, c.code
       LIMIT $1`,
    [limit],
  );
}

export async function enrollmentStats() {
  return many(
    `SELECT s.program, s.level,
            count(DISTINCT s.id)::int AS students,
            round(avg(s.current_cgpa),2) AS average_cgpa,
            count(DISTINCT e.id)::int AS enrollments,
            count(DISTINCT e.id) FILTER (WHERE e.status='failed')::int AS failures
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id
      GROUP BY s.program, s.level
      ORDER BY s.program, s.level`,
  );
}

export async function escalationStats() {
  return many(
    `SELECT type, status, priority, count(*)::int AS count
       FROM escalations GROUP BY type, status, priority ORDER BY count DESC`,
  );
}

export async function planStats() {
  return many(
    `SELECT status, count(*)::int AS count, round(avg(total_credits),1) AS average_credits
       FROM study_plans GROUP BY status ORDER BY count DESC`,
  );
}
