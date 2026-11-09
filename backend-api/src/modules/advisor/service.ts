import { many, one } from '../../config/db';
import { AppError } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { sanitizeText } from '../../utils/sanitize';
import {
  assertStudentAccess,
  buildStudentRecord,
  findAdvisorByUserId,
  loadOfferings,
  resolvedAnomalyIds,
  StudentRow,
  STUDENT_SELECT,
} from '../../services/studentContext';
import {
  earlyWarningFor,
  evaluateBulk,
  graduationAuditFor,
  listPlans,
  reviewPlan,
  standingFor,
} from '../../services/advising';
import { Term } from '../../services/term';
import { candidateCourseCodes, enrollmentsFor, profileFor } from '../../modules/student/service';

export interface AdvisorRow {
  id: string;
  user_id: string;
  department_id: string | null;
  office_location: string | null;
  max_students: number;
}

export async function requireAdvisor(userId: string): Promise<AdvisorRow> {
  const row = await one<AdvisorRow>('SELECT * FROM advisors WHERE user_id = $1', [userId]);
  if (!row) throw AppError.forbidden('No advisor profile is linked to this account');
  return row;
}

export async function dashboard(advisor: AdvisorRow) {
  const [counts, pendingPlans, openCases, requests, officeHours] = await Promise.all([
    one<{
      students: string;
      at_risk: string;
      probations: string;
    }>(
      `SELECT count(*)::text AS students,
              count(*) FILTER (WHERE s.current_cgpa < 2.00)::text AS at_risk,
              count(*) FILTER (WHERE s.current_cgpa < 2.00 AND s.regular_semesters_completed > 0)::text AS probations
         FROM students s WHERE s.advisor_id = $1`,
      [advisor.id],
    ),
    one<{ count: string }>(
      `SELECT count(*)::text AS count FROM study_plans p
         JOIN students s ON s.id = p.student_id
        WHERE s.advisor_id = $1 AND p.status = 'SUBMITTED'`,
      [advisor.id],
    ),
    one<{ count: string }>(
      `SELECT count(*)::text AS count FROM escalations e
         JOIN students s ON s.id = e.student_id
        WHERE s.advisor_id = $1 AND e.status IN ('open','in_review')`,
      [advisor.id],
    ),
    one<{ count: string }>(
      `SELECT count(*)::text AS count FROM office_hour_requests r
         JOIN office_hour_slots o ON o.id = r.slot_id
        WHERE o.advisor_id = $1 AND r.status = 'pending'`,
      [advisor.id],
    ),
    many(
      `SELECT id, weekday, start_time::text AS start_time, end_time::text AS end_time, location, active
         FROM office_hour_slots WHERE advisor_id = $1 ORDER BY weekday, start_time`,
      [advisor.id],
    ),
  ]);
  return {
    students: Number(counts?.students ?? 0),
    atRisk: Number(counts?.at_risk ?? 0),
    probations: Number(counts?.probations ?? 0),
    pendingPlans: Number(pendingPlans?.count ?? 0),
    openCases: Number(openCases?.count ?? 0),
    pendingOfficeHourRequests: Number(requests?.count ?? 0),
    officeHours,
  };
}

export async function listStudents(
  advisor: AdvisorRow,
  options: { search?: string; page: number; limit: number; offset: number },
) {
  const params: unknown[] = [advisor.id];
  let searchClause = '';
  if (options.search) {
    params.push(`%${options.search.replace(/[\\%_]/g, '\\$&')}%`);
    searchClause = `AND (u.full_name ILIKE $2 OR s.student_code ILIKE $2)`;
  }
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.advisor_id = $1 ${searchClause}`,
    params,
  );
  params.push(options.limit, options.offset);
  const rows = await many(
    `SELECT s.id, s.student_code, s.program, s.level, s.current_cgpa, s.passed_credits,
            s.regular_semesters_completed, u.full_name, u.email, u.status
       FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.advisor_id = $1 ${searchClause}
      ORDER BY s.current_cgpa ASC, u.full_name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function atRisk(advisor: AdvisorRow) {
  return many(
    `SELECT s.id, s.student_code, s.program, s.level, s.current_cgpa, s.passed_credits,
            s.regular_semesters_completed, u.full_name, u.email,
            st.warning_no, st.consecutive_warnings, st.total_warnings,
            st.probation, st.dismissal_risk, st.final_chance, st.sgpa, st.term AS standing_term,
            CASE
              WHEN st.dismissal_risk THEN 'critical'
              WHEN st.consecutive_warnings >= 2 OR s.current_cgpa < 1.5 THEN 'high'
              ELSE 'medium'
            END AS risk_level
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN LATERAL (
         SELECT * FROM academic_standing a WHERE a.student_id = s.id
          ORDER BY a.created_at DESC LIMIT 1
       ) st ON true
      WHERE s.advisor_id = $1
        AND (s.current_cgpa < 2.00 OR COALESCE(st.warning_no,0) > 0 OR COALESCE(st.dismissal_risk,false))
      ORDER BY CASE WHEN st.dismissal_risk THEN 0 WHEN s.current_cgpa < 1.5 THEN 1 ELSE 2 END,
               s.current_cgpa ASC`,
    [advisor.id],
  );
}

export async function studentDetail(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
) {
  const student = await assertStudentAccess(actor, studentId);
  const [profile, enrollments, standing, plans] = await Promise.all([
    profileFor(student),
    enrollmentsFor(student),
    one(`SELECT * FROM academic_standing WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`, [
      student.id,
    ]),
    listPlans(student.id),
  ]);
  return { profile, enrollments, latestStanding: standing, plans };
}

export async function studentStanding(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
  term: Term,
) {
  const student = await assertStudentAccess(actor, studentId);
  return standingFor(student, term);
}

export async function studentEligibility(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
  term: Term,
  courseCodes?: string[],
) {
  const student = await assertStudentAccess(actor, studentId);
  const codes =
    courseCodes && courseCodes.length ? courseCodes : await candidateCourseCodes(student, term, 80);
  return evaluateBulk(student, codes, term, actor.id, {
    graduationPossible: student.passed_credits >= 115,
  });
}

export async function studentGraduation(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
  term: Term,
) {
  const student = await assertStudentAccess(actor, studentId);
  return graduationAuditFor(student, term);
}

export async function studentEarlyWarning(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
  term: Term,
) {
  const student = await assertStudentAccess(actor, studentId);
  return earlyWarningFor(student, term);
}

export async function pendingPlans(advisor: AdvisorRow, status?: string) {
  const params: unknown[] = [advisor.id];
  let clause = `AND p.status IN ('SUBMITTED','MODIFIED')`;
  if (status) {
    params.push(status);
    clause = `AND p.status = $2`;
  }
  return many(
    `SELECT p.id, p.term, p.status, p.total_credits, p.created_at, p.submitted_at,
            s.id AS student_id, s.student_code, s.program, s.level, u.full_name
       FROM study_plans p
       JOIN students s ON s.id = p.student_id
       JOIN users u ON u.id = s.user_id
      WHERE s.advisor_id = $1 ${clause}
      ORDER BY p.submitted_at NULLS LAST, p.created_at`,
    params,
  );
}

export async function review(
  advisor: AdvisorRow,
  planId: string,
  actorId: string,
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED',
  feedback: string,
) {
  const plan = await one<{ student_id: string; advisor_id: string | null }>(
    `SELECT p.student_id, s.advisor_id FROM study_plans p
       JOIN students s ON s.id = p.student_id WHERE p.id = $1`,
    [planId],
  );
  if (!plan) throw AppError.notFound('Study plan not found');
  if (plan.advisor_id !== advisor.id) throw AppError.forbidden();
  return reviewPlan(planId, actorId, decision, feedback);
}

export async function notes(actorId: string, studentId: string, role: 'student' | 'advisor' | 'admin') {
  const params: unknown[] = [studentId, actorId];
  const clause =
    role === 'admin'
      ? ''
      : role === 'student'
        ? `AND n.visibility = 'student'`
        : `AND (n.visibility = 'student' OR a.user_id = $2)`;
  return many(
    `SELECT n.id, n.note, n.visibility, n.created_at, n.updated_at, u.full_name AS advisor_name
       FROM advising_notes n JOIN advisors a ON a.id = n.advisor_id
       JOIN users u ON u.id = a.user_id
      WHERE n.student_id = $1 ${clause}
      ORDER BY n.created_at DESC`,
    params,
  );
}

export async function createNote(
  advisor: AdvisorRow,
  studentId: string,
  note: string,
  visibility: 'advisor_only' | 'student',
  actorId: string,
) {
  const student = await one<{ id: string }>('SELECT id FROM students WHERE id = $1 AND advisor_id = $2', [
    studentId,
    advisor.id,
  ]);
  if (!student) throw AppError.forbidden();
  const row = await one(
    `INSERT INTO advising_notes (advisor_id, student_id, note, visibility)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [advisor.id, studentId, sanitizeText(note, 5000), visibility],
  );
  await writeAudit({
    actorId,
    action: 'ADVISING_NOTE_CREATED',
    entityType: 'advising_note',
    entityId: String((row as { id?: string })?.id ?? ''),
    after: { studentId, visibility },
  });
  return row;
}

export async function officeHours(advisor: AdvisorRow) {
  return many(
    `SELECT id, weekday, start_time::text AS start_time, end_time::text AS end_time,
            location, active, created_at
       FROM office_hour_slots WHERE advisor_id = $1 ORDER BY weekday, start_time`,
    [advisor.id],
  );
}

export async function createOfficeHour(
  advisor: AdvisorRow,
  input: { weekday: number; startTime: string; endTime: string; location?: string },
) {
  return one(
    `INSERT INTO office_hour_slots (advisor_id, weekday, start_time, end_time, location)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      advisor.id,
      input.weekday,
      input.startTime,
      input.endTime,
      input.location ? sanitizeText(input.location, 200) : null,
    ],
  );
}

export async function updateOfficeHour(
  advisor: AdvisorRow,
  slotId: string,
  input: { weekday?: number; startTime?: string; endTime?: string; location?: string; active?: boolean },
) {
  const row = await one(
    `UPDATE office_hour_slots SET
       weekday = COALESCE($3, weekday),
       start_time = COALESCE($4, start_time),
       end_time = COALESCE($5, end_time),
       location = COALESCE($6, location),
       active = COALESCE($7, active)
     WHERE id = $1 AND advisor_id = $2 RETURNING *`,
    [
      slotId,
      advisor.id,
      input.weekday ?? null,
      input.startTime ?? null,
      input.endTime ?? null,
      input.location ? sanitizeText(input.location, 200) : null,
      input.active ?? null,
    ],
  );
  if (!row) throw AppError.notFound('Office hour slot not found');
  return row;
}

export async function deleteOfficeHour(advisor: AdvisorRow, slotId: string) {
  const row = await one<{ id: string }>(
    `UPDATE office_hour_slots SET active = false WHERE id = $1 AND advisor_id = $2 RETURNING id`,
    [slotId, advisor.id],
  );
  if (!row) throw AppError.notFound('Office hour slot not found');
}

export async function officeHourRequests(advisor: AdvisorRow) {
  return many(
    `SELECT r.id, r.status, r.reason, r.created_at, r.updated_at,
            s.id AS student_id, s.student_code, u.full_name AS student_name,
            o.weekday, o.start_time::text AS start_time, o.end_time::text AS end_time, o.location
       FROM office_hour_requests r
       JOIN office_hour_slots o ON o.id = r.slot_id
       JOIN students s ON s.id = r.student_id
       JOIN users u ON u.id = s.user_id
      WHERE o.advisor_id = $1 ORDER BY r.created_at DESC`,
    [advisor.id],
  );
}

export async function updateOfficeHourRequest(
  advisor: AdvisorRow,
  requestId: string,
  status: 'approved' | 'rejected' | 'cancelled',
  actorId: string,
) {
  const row = await one<{ id: string; student_id: string }>(
    `UPDATE office_hour_requests r SET status = $3
       FROM office_hour_slots o
      WHERE r.id = $1 AND o.id = r.slot_id AND o.advisor_id = $2
      RETURNING r.*`,
    [requestId, advisor.id, status],
  );
  if (!row) throw AppError.notFound('Office hour request not found');
  const studentUser = await one<{ user_id: string }>('SELECT user_id FROM students WHERE id = $1', [
    row.student_id,
  ]);
  if (studentUser?.user_id) {
    const { createNotification } = await import('../../services/notifications');
    await createNotification(
      studentUser.user_id,
      'office_hour',
      `Office hour request ${status}`,
      `Your advisor ${status} your office hour request.`,
    );
  }
  await writeAudit({
    actorId,
    action: 'OFFICE_HOUR_REQUEST_UPDATED',
    entityType: 'office_hour_request',
    entityId: requestId,
    after: { status },
  });
  return row;
}

export async function advisorEscalations(advisor: AdvisorRow, status?: string) {
  const params: unknown[] = [advisor.id];
  let clause = '';
  if (status) {
    params.push(status);
    clause = `AND e.status = $2`;
  }
  return many(
    `SELECT e.*, s.student_code, u.full_name AS student_name
       FROM escalations e
       JOIN students s ON s.id = e.student_id
       JOIN users u ON u.id = s.user_id
      WHERE s.advisor_id = $1 ${clause}
      ORDER BY CASE e.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               e.created_at DESC`,
    params,
  );
}

export async function getStudentForActor(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
): Promise<StudentRow> {
  return assertStudentAccess(actor, studentId);
}

export async function advisorForUser(userId: string) {
  return findAdvisorByUserId(userId);
}

export async function studentByCode(code: string) {
  return one<StudentRow>(`${STUDENT_SELECT} WHERE s.student_code = $1`, [code]);
}

export async function offeringsFor(term: Term) {
  return loadOfferings(term);
}

export async function resolvedFor() {
  return resolvedAnomalyIds();
}

export async function engineStudentRecord(student: StudentRow, term: Term) {
  return buildStudentRecord(student, term);
}
