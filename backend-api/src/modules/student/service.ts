import { many, one } from '../../config/db';
import { AppError } from '../../utils/errors';
import {
  assertStudentAccess,
  EnrollmentRow,
  findAdvisorByUserId,
  StudentRow,
  STUDENT_SELECT,
} from '../../services/studentContext';
import { Term } from '../../services/term';

export async function profileFor(student: StudentRow) {
  const [advisor, department, user] = await Promise.all([
    student.advisor_id
      ? one(
          `SELECT a.id, a.office_location, a.max_students, u.full_name, u.email
             FROM advisors a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
          [student.advisor_id],
        )
      : null,
    student.department_id
      ? one('SELECT id, code, name_ar, name_en FROM departments WHERE id = $1', [student.department_id])
      : null,
    one('SELECT phone FROM users WHERE id = $1', [student.user_id]),
  ]);
  return {
    student: {
      id: student.id,
      studentCode: student.student_code,
      program: student.program,
      level: student.level,
      admissionTerm: student.admission_term,
      cgpa: Number(student.current_cgpa),
      passedCredits: student.passed_credits,
      transferCredits: student.transfer_credits,
      regularSemestersCompleted: student.regular_semesters_completed,
      fullName: student.full_name,
      email: student.email,
      phone: (user as { phone: string | null } | null)?.phone ?? null,
    },
    advisor,
    department,
  };
}

export async function dashboardFor(student: StudentRow, term: Term) {
  const [profile, standing, currentCourses, plans, notifications, degree] = await Promise.all([
    profileFor(student),
    one(
      `SELECT term, sgpa, cgpa, passed_credits, level, warning_no, consecutive_warnings,
              total_warnings, probation, dismissal_risk, final_chance, created_at
         FROM academic_standing WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [student.id],
    ),
    many(
      `SELECT e.id, c.code AS course_code, c.name_en, c.name_ar, c.credits, e.status, e.term
         FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = $1 AND e.status = 'in_progress'
        ORDER BY c.code`,
      [student.id],
    ),
    many(
      `SELECT id, term, status, total_credits, created_at FROM study_plans
        WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [student.id],
    ),
    one<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [student.user_id],
    ),
    one(
      `SELECT count(*)::text AS passed, COALESCE(sum(c.credits),0)::int AS credits
         FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = $1 AND e.status = 'passed'`,
      [student.id],
    ),
  ]);
  const passedCredits = Number((degree as { credits?: number } | null)?.credits ?? 0);
  return {
    profile,
    term: { value: term.term, season: term.season, academicYear: term.academicYear },
    standing,
    currentCourses,
    recentPlans: plans,
    unreadNotifications: Number(notifications?.count ?? 0),
    graduation: {
      requiredCredits: 136,
      passedCredits: Math.max(passedCredits, student.passed_credits),
      remainingCredits: Math.max(0, 136 - Math.max(passedCredits, student.passed_credits)),
    },
    advisoryOnly: true,
  };
}

export async function enrollmentsFor(student: StudentRow) {
  const rows = await many<EnrollmentRow & { name_en: string; name_ar: string }>(
    `SELECT e.id, e.course_id, c.code, c.name_en, c.name_ar, c.credits, c.level_hint,
            e.term, e.academic_year, e.season, e.grade_letter, e.percentage, e.grade_points,
            e.status, e.attempt_no, e.counts_in_gpa, e.is_repeat
       FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = $1
      ORDER BY e.academic_year DESC, e.season DESC, c.code, e.attempt_no`,
    [student.id],
  );
  return rows.map((row) => ({
    id: row.id,
    courseCode: row.code,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    credits: row.credits,
    term: row.term,
    academicYear: row.academic_year,
    season: row.season,
    gradeLetter: row.grade_letter,
    percentage: row.percentage === null ? null : Number(row.percentage),
    gradePoints: row.grade_points === null ? null : Number(row.grade_points),
    status: row.status,
    attemptNo: row.attempt_no,
    countsInGpa: row.counts_in_gpa,
    isRepeat: row.is_repeat,
  }));
}

export async function recommendedPlan(student: StudentRow, level: number, term: Term) {
  const slot = `${level}-${term.season === 'spring' ? 2 : 1}`;
  const rows = await many<{
    kind: string;
    position: number;
    course_code: string | null;
    pool_code: string | null;
    credits: number | null;
    name_en: string | null;
    name_ar: string | null;
    course_credits: number | null;
  }>(
    `SELECT rp.position,
            CASE WHEN rp.course_id IS NULL THEN 'elective' ELSE 'course' END AS kind,
            c.code AS course_code, p.code AS pool_code,
            rp.credits, c.name_en, c.name_ar, c.credits AS course_credits
       FROM recommended_plans rp
       LEFT JOIN courses c ON c.id = rp.course_id
       LEFT JOIN elective_pools p ON p.id = rp.pool_id
      WHERE rp.program = $1 AND rp.level = $2 AND rp.term = $3
      ORDER BY rp.position`,
    [`COMMON`, level, term.season === 'spring' ? 2 : 1],
  );
  const programRows = await many<{
    kind: string;
    position: number;
    course_code: string | null;
    pool_code: string | null;
    credits: number | null;
    name_en: string | null;
    name_ar: string | null;
    course_credits: number | null;
  }>(
    `SELECT rp.position,
            CASE WHEN rp.course_id IS NULL THEN 'elective' ELSE 'course' END AS kind,
            c.code AS course_code, p.code AS pool_code,
            rp.credits, c.name_en, c.name_ar, c.credits AS course_credits
       FROM recommended_plans rp
       LEFT JOIN courses c ON c.id = rp.course_id
       LEFT JOIN elective_pools p ON p.id = rp.pool_id
      WHERE rp.program = $1 AND rp.level = $2 AND rp.term = $3
      ORDER BY rp.position`,
    [student.program, level, term.season === 'spring' ? 2 : 1],
  );
  const combined = [...rows, ...programRows];
  const totalCredits = combined.reduce((sum, row) => sum + Number(row.course_credits ?? row.credits ?? 0), 0);
  return {
    slot,
    level,
    term: term.term,
    program: student.program,
    totalCredits,
    items: combined.map((row) => ({
      position: row.position,
      kind: row.kind,
      courseCode: row.course_code,
      pool: row.pool_code,
      credits: Number(row.course_credits ?? row.credits ?? 0),
      nameEn: row.name_en,
      nameAr: row.name_ar,
    })),
    advisoryOnly: true,
  };
}

/** Course codes that are relevant to the student's program and are offered. */
export async function candidateCourseCodes(student: StudentRow, term: Term, limit = 60): Promise<string[]> {
  const poolCodes = await many<{ code: string }>(
    `SELECT DISTINCT p.code FROM elective_pools p
       JOIN elective_pool_courses epc ON epc.pool_id = p.id
       JOIN courses c ON c.id = epc.course_id
       JOIN program_requirements pr ON pr.course_id = c.id AND pr.program = $1
      WHERE pr.role = 'elective'`,
    [student.program],
  );
  const pools = poolCodes.map((row) => row.code);
  const rows = await many<{ code: string }>(
    `SELECT DISTINCT c.code
       FROM courses c
       LEFT JOIN program_requirements pr ON pr.course_id = c.id AND pr.program = $1
       LEFT JOIN elective_pool_courses epc ON epc.course_id = c.id
       LEFT JOIN elective_pools p ON p.id = epc.pool_id
      WHERE c.active = true AND c.deleted_at IS NULL
        AND (pr.id IS NOT NULL OR p.code = ANY($2))
        AND EXISTS (
          SELECT 1 FROM course_offerings o
           WHERE o.course_id = c.id AND o.academic_year = $3 AND o.season = $4
             AND o.status = 'open'
        )
      ORDER BY c.code
      LIMIT $5`,
    [student.program, pools, term.academicYear, term.season, limit],
  );
  return rows.map((row) => row.code);
}

export async function failedCourseCodes(studentId: string): Promise<string[]> {
  const rows = await many<{ code: string }>(
    `SELECT DISTINCT c.code FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = $1 AND e.status IN ('failed','absent')
        AND NOT EXISTS (
          SELECT 1 FROM enrollments p WHERE p.student_id = e.student_id
            AND p.course_id = e.course_id AND p.status = 'passed'
        )`,
    [studentId],
  );
  return rows.map((row) => row.code);
}

export async function studentForAdvisor(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
) {
  return assertStudentAccess(actor, studentId);
}

export async function advisorProfileFor(student: StudentRow) {
  if (!student.advisor_id) return null;
  return one(
    `SELECT a.id, a.office_location, a.max_students, u.full_name, u.email,
            d.name_en AS department
       FROM advisors a JOIN users u ON u.id = a.user_id
       LEFT JOIN departments d ON d.id = a.department_id
      WHERE a.id = $1`,
    [student.advisor_id],
  );
}

export async function programInfo(program: string) {
  const row = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM program_requirements WHERE program = $1`,
    [program],
  );
  if (!row || Number(row.count) === 0) throw AppError.notFound('Program not found');
  const pools = await many(
    `SELECT DISTINCT p.code, p.name_en, p.name_ar, p.credits_required, p.source
       FROM elective_pools p JOIN elective_pool_courses epc ON epc.pool_id = p.id
       JOIN program_requirements pr ON pr.course_id = epc.course_id AND pr.program = $1`,
    [program],
  );
  return { program, pools };
}

export async function findStudentRowByUserId(userId: string): Promise<StudentRow | null> {
  return one<StudentRow>(`${STUDENT_SELECT} WHERE s.user_id = $1`, [userId]);
}

export async function advisorIdForUser(userId: string) {
  return findAdvisorByUserId(userId);
}

export async function advisorsOfficeHours(advisorId: string) {
  return many(
    `SELECT id, weekday, start_time::text AS start_time, end_time::text AS end_time, location
       FROM office_hour_slots WHERE advisor_id = $1 AND active = true
      ORDER BY weekday, start_time`,
    [advisorId],
  );
}

export async function listOfficeHourRequests(studentId: string) {
  return many(
    `SELECT r.id, r.status, r.reason, r.created_at,
            s.weekday, s.start_time::text AS start_time, s.end_time::text AS end_time, s.location,
            u.full_name AS advisor_name
       FROM office_hour_requests r
       JOIN office_hour_slots s ON s.id = r.slot_id
       JOIN advisors a ON a.id = s.advisor_id
       JOIN users u ON u.id = a.user_id
      WHERE r.student_id = $1 ORDER BY r.created_at DESC`,
    [studentId],
  );
}
