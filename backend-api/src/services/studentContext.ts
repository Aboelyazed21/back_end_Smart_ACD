import { many, one } from '../config/db';
import { AppError } from '../utils/errors';
import { Term } from './term';

export interface StudentRow {
  id: string;
  user_id: string;
  student_code: string;
  program: 'CS' | 'IT' | 'AI' | 'DS';
  level: number;
  department_id: string | null;
  advisor_id: string | null;
  admission_term: string | null;
  current_cgpa: string | number;
  passed_credits: number;
  transfer_credits: number;
  regular_semesters_completed: number;
  status: string;
  full_name: string;
  email: string;
  must_change_password: boolean;
  is_demo: boolean;
  phone: string | null;
  user_created_at: Date;
  user_updated_at: Date;
}

export const STUDENT_SELECT = `
  SELECT s.id, s.user_id, s.student_code, s.program, s.level, s.department_id,
         s.advisor_id, s.admission_term, s.current_cgpa, s.passed_credits,
         s.transfer_credits, s.regular_semesters_completed, s.created_at,
         u.status, u.full_name, u.email, u.must_change_password, u.is_demo,
         u.phone, u.created_at AS user_created_at, u.updated_at AS user_updated_at
  FROM students s
  JOIN users u ON u.id = s.user_id
`;

export async function findStudentByUserId(userId: string): Promise<StudentRow | null> {
  return one<StudentRow>(`${STUDENT_SELECT} WHERE s.user_id = $1`, [userId]);
}

export async function findStudentById(studentId: string): Promise<StudentRow | null> {
  return one<StudentRow>(`${STUDENT_SELECT} WHERE s.id = $1`, [studentId]);
}

export async function requireStudentByUserId(userId: string): Promise<StudentRow> {
  const student = await findStudentByUserId(userId);
  if (!student) throw AppError.forbidden('No student profile is linked to this account');
  return student;
}

export async function requireStudentById(studentId: string): Promise<StudentRow> {
  const student = await findStudentById(studentId);
  if (!student) throw AppError.notFound('Student not found');
  return student;
}

/** Object-level authorisation: advisors may only access assigned students. */
export async function assertStudentAccess(
  actor: { id: string; role: 'student' | 'advisor' | 'admin' },
  studentId: string,
): Promise<StudentRow> {
  const student = await requireStudentById(studentId);
  if (actor.role === 'admin') return student;
  if (actor.role === 'student') {
    if (student.user_id !== actor.id) throw AppError.forbidden();
    return student;
  }
  const advisor = await one<{ id: string }>('SELECT id FROM advisors WHERE user_id = $1', [actor.id]);
  if (!advisor) throw AppError.forbidden('No advisor profile is linked to this account');
  if (student.advisor_id !== advisor.id) throw AppError.forbidden();
  return student;
}

export interface EnrollmentRow {
  id: string;
  course_id: string;
  code: string;
  credits: number;
  level_hint: number;
  term: string;
  academic_year: string;
  season: string;
  grade_letter: string | null;
  percentage: string | number | null;
  grade_points: string | number | null;
  status: string;
  attempt_no: number;
  counts_in_gpa: boolean;
  is_repeat: boolean;
}

export interface AttemptPayload {
  code: string;
  credits: number;
  percentage: number | null;
  grade_letter: string | null;
  status: string;
  attempt_no: number;
  counts_in_gpa: boolean;
  is_repeat: boolean;
  term: string | null;
  course_level: number;
}

/**
 * Reconciles declared passed credits that are missing from detailed transcript
 * rows (accepted transfer/exemption credits) as synthetic non-GPA attempts.
 * The engine caps a single attempt at 12 credits, so the gap is split into
 * chunks with unique valid course codes.
 */
export function reconciliationAttempts(
  creditsGap: number,
  level: number,
  usedCodes: Iterable<string> = [],
): AttemptPayload[] {
  const used = new Set(usedCodes);
  const attempts: AttemptPayload[] = [];
  let remaining = Math.min(Math.max(0, Math.floor(creditsGap)), 300);
  for (let index = 1; remaining > 0; index += 1) {
    const code = `TRF${String(index).padStart(4, '0')}`;
    if (used.has(code)) continue;
    used.add(code);
    const credits = Math.min(12, remaining);
    attempts.push({
      code,
      credits,
      percentage: null,
      grade_letter: 'P',
      status: 'passed',
      attempt_no: 1,
      counts_in_gpa: false,
      is_repeat: false,
      term: null,
      course_level: level,
    });
    remaining -= credits;
  }
  return attempts;
}

export async function loadEnrollments(studentId: string): Promise<EnrollmentRow[]> {
  return many<EnrollmentRow>(
    `SELECT e.id, e.course_id, c.code, c.credits, c.level_hint, e.term, e.academic_year,
            e.season, e.grade_letter, e.percentage, e.grade_points, e.status, e.attempt_no,
            e.counts_in_gpa, e.is_repeat
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = $1
      ORDER BY e.academic_year, e.season, e.course_id, e.attempt_no`,
    [studentId],
  );
}

const COMPLETED_STATUSES = new Set(['passed', 'failed', 'withdrawn', 'incomplete', 'continued', 'absent']);

function toAttempt(row: EnrollmentRow): AttemptPayload {
  return {
    code: row.code,
    credits: row.credits,
    percentage: row.percentage === null ? null : Number(row.percentage),
    grade_letter: row.grade_letter,
    status: row.status,
    attempt_no: row.attempt_no,
    counts_in_gpa: row.counts_in_gpa,
    is_repeat: row.is_repeat,
    term: row.term,
    course_level: row.level_hint,
  };
}

export interface StudentEngineRecord {
  id: string;
  program: string;
  cgpa: number | null;
  passed_credits: number;
  transfer_credits: number;
  level: number;
  completed: AttemptPayload[];
  current: AttemptPayload[];
  regular_semesters_completed: number;
  suspension_semesters: number;
  improvement_courses_count: number;
  warning_no: number;
  consecutive_warnings: number;
  total_warnings: number;
  first_semester_non_transfer: boolean;
  previous_incomplete_courses: string[];
  remaining_credits: number;
  semesters: Array<Record<string, unknown>>;
}

/**
 * Builds the exact StudentRecord contract consumed by the Python engine. The
 * database remains the source of truth for enrolments and grades; the stored
 * CGPA/passed-credit counters are reconciled with a synthetic transfer attempt
 * when transcripts are incomplete (imported/transfer students).
 */
export async function buildStudentRecord(student: StudentRow, term: Term): Promise<StudentEngineRecord> {
  const enrollments = await loadEnrollments(student.id);
  const current = enrollments.filter((e) => e.status === 'in_progress').map(toAttempt);
  const completed = enrollments.filter((e) => COMPLETED_STATUSES.has(e.status)).map(toAttempt);

  const standing = await one<{
    warning_no: number;
    consecutive_warnings: number;
    total_warnings: number;
    passed_credits: number;
  }>(
    `SELECT warning_no, consecutive_warnings, total_warnings, passed_credits
       FROM academic_standing WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [student.id],
  );

  const passedByCourse = new Map<string, number>();
  for (const attempt of completed) {
    if (attempt.status === 'passed') {
      passedByCourse.set(attempt.code, Math.max(passedByCourse.get(attempt.code) ?? 0, attempt.credits));
    }
  }
  const enrollmentPassed = [...passedByCourse.values()].reduce((sum, value) => sum + value, 0);
  const declaredPassed = Math.max(student.passed_credits, standing?.passed_credits ?? 0);
  const gap = declaredPassed - enrollmentPassed;
  if (gap > 0) {
    // Represents accepted transfer/exempted credits so the engine's credit
    // thresholds match the official transcript summary.
    completed.push(
      ...reconciliationAttempts(
        gap,
        student.level,
        completed.map((attempt) => attempt.code),
      ),
    );
  }

  const previousIncomplete = completed
    .filter((attempt) => attempt.status === 'incomplete')
    .map((attempt) => attempt.code);

  const effectivePassed = enrollmentPassed + Math.max(0, student.transfer_credits) + Math.max(0, gap);
  return {
    id: student.id,
    program: student.program,
    cgpa: Number(student.current_cgpa),
    passed_credits: declaredPassed,
    transfer_credits: Math.max(0, student.transfer_credits),
    level: student.level,
    completed,
    current,
    regular_semesters_completed: student.regular_semesters_completed,
    suspension_semesters: 0,
    improvement_courses_count: 0,
    warning_no: standing?.warning_no ?? 0,
    consecutive_warnings: standing?.consecutive_warnings ?? 0,
    total_warnings: standing?.total_warnings ?? 0,
    first_semester_non_transfer: student.regular_semesters_completed === 0 && student.transfer_credits === 0,
    previous_incomplete_courses: previousIncomplete,
    remaining_credits: Math.max(0, 136 - effectivePassed - (term.season === 'summer' ? 0 : 0)),
    semesters: [],
  };
}

export interface OfferingPayload {
  code: string;
  enrolled_count: number;
  season: string;
  active: boolean;
  meeting_times: Array<{ day: string; start: string; end: string; room: string | null }>;
  exam: { date: string; start: string; end: string } | null;
}

export async function loadOfferings(term: Term): Promise<OfferingPayload[]> {
  const rows = await many<{
    code: string;
    enrolled_count: number;
    status: string;
    offering_id: string;
    day: string | null;
    start_time: string | null;
    end_time: string | null;
    room: string | null;
    exam_date: Date | string | null;
    exam_start: string | null;
    exam_end: string | null;
  }>(
    `SELECT c.code, o.enrolled_count, o.status, o.id AS offering_id,
            m.day, m.start_time::text AS start_time, m.end_time::text AS end_time, m.room,
            x.exam_date, x.start_time::text AS exam_start, x.end_time::text AS exam_end
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN meeting_times m ON m.offering_id = o.id
       LEFT JOIN exams x ON x.offering_id = o.id AND x.exam_type = 'final'
      WHERE o.academic_year = $1 AND o.season = $2
      ORDER BY c.code, m.day, m.start_time`,
    [term.academicYear, term.season],
  );
  const map = new Map<string, OfferingPayload>();
  for (const row of rows) {
    let offering = map.get(row.code);
    if (!offering) {
      offering = {
        code: row.code,
        enrolled_count: row.enrolled_count,
        season: term.season,
        active: row.status === 'open',
        meeting_times: [],
        exam: null,
      };
      map.set(row.code, offering);
    }
    if (row.day && row.start_time && row.end_time) {
      offering.meeting_times.push({
        day: row.day,
        start: row.start_time.slice(0, 5),
        end: row.end_time.slice(0, 5),
        room: row.room,
      });
    }
    if (row.exam_date && row.exam_start && row.exam_end && !offering.exam) {
      const date =
        row.exam_date instanceof Date
          ? row.exam_date.toISOString().slice(0, 10)
          : String(row.exam_date).slice(0, 10);
      offering.exam = {
        date,
        start: row.exam_start.slice(0, 5),
        end: row.exam_end.slice(0, 5),
      };
    }
  }
  return [...map.values()];
}

export async function resolvedAnomalyIds(): Promise<string[]> {
  const rows = await many<{ id: string }>(
    "SELECT id FROM data_anomalies WHERE status = 'resolved' ORDER BY id",
  );
  return rows.map((row) => row.id);
}

export async function findAdvisorByUserId(userId: string): Promise<{ id: string } | null> {
  return one<{ id: string }>('SELECT id FROM advisors WHERE user_id = $1', [userId]);
}
