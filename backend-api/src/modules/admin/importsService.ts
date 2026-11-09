import { many, one, query, withTransaction } from '../../config/db';
import { AppError } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { assertCsvUpload, mapCsvRows, parseCsvBuffer } from '../../utils/csv';
import { scanUpload } from '../../integrations/antivirus';
import { generateTemporaryPassword, hashPassword } from '../../utils/password';
import { isValidEmailDomain, sanitizeText } from '../../utils/sanitize';
import { env } from '../../config/env';

interface RowError {
  row: number;
  code: string | null;
  message: string;
  raw: Record<string, string>;
}

async function createJob(type: 'students' | 'transcripts', filename: string, total: number, actorId: string) {
  return one<{ id: string }>(
    `INSERT INTO import_jobs (type, status, filename, total_rows, created_by, started_at)
     VALUES ($1,'processing',$2,$3,$4,now()) RETURNING id`,
    [type, filename.slice(0, 255), total, actorId],
  );
}

async function finishJob(
  jobId: string,
  status: 'completed' | 'failed',
  success: number,
  errors: number,
  message?: string,
) {
  await query(
    `UPDATE import_jobs SET status = $2, success_rows = $3, error_rows = $4,
       error_message = $5, finished_at = now() WHERE id = $1`,
    [jobId, status, success, errors, message ?? null],
  );
}

async function saveErrors(jobId: string, errors: RowError[]): Promise<void> {
  for (const error of errors.slice(0, 2000)) {
    await query(
      `INSERT INTO import_row_errors (job_id, row_no, code, message, raw)
       VALUES ($1,$2,$3,$4,$5)`,
      [jobId, error.row, error.code, error.message.slice(0, 500), JSON.stringify(error.raw)],
    );
  }
}

function requireColumns(rows: Array<Record<string, string>>, columns: string[]): void {
  if (rows.length === 0) throw AppError.badRequest('CSV_EMPTY', 'CSV has no data rows');
  const present = new Set(Object.keys(rows[0]!));
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length) {
    throw AppError.badRequest('CSV_MISSING_COLUMNS', `Missing columns: ${missing.join(', ')}`);
  }
}

export async function importStudents(file: Express.Multer.File | undefined, actorId: string) {
  assertCsvUpload(file);
  await scanUpload(file!.buffer);
  const rows = mapCsvRows(parseCsvBuffer(file!.buffer));
  requireColumns(rows, ['email', 'full_name', 'student_code', 'program', 'level', 'cgpa', 'passed_credits']);
  const job = await createJob('students', file!.originalname, rows.length, actorId);
  const jobId = job!.id;
  const errors: RowError[] = [];
  let success = 0;
  const seenEmails = new Set<string>();
  const seenCodes = new Set<string>();
  // Imported accounts have no disclosed password; a single random secret is
  // hashed once and never stored. Users must use the reset flow to sign in.
  const lockedHash = await hashPassword(generateTemporaryPassword());

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const rowNo = index + 2;
    try {
      const email = (row.email ?? '').trim().toLowerCase();
      const fullName = sanitizeText(row.full_name ?? '', 200);
      const studentCode = (row.student_code ?? '').trim();
      const program = (row.program ?? '').trim().toUpperCase();
      const level = Number(row.level);
      const cgpa = Number(row.cgpa);
      const passedCredits = Number(row.passed_credits);
      const transferCredits = Number(row.transfer_credits || 0);
      if (!isValidEmailDomain(email, env.ALLOWED_EMAIL_DOMAIN)) {
        throw new Error(`email must use @${env.ALLOWED_EMAIL_DOMAIN}`);
      }
      if (!fullName) throw new Error('full_name is required');
      if (!/^\d{6,15}$/.test(studentCode)) throw new Error('invalid student_code');
      if (!['CS', 'IT', 'AI', 'DS'].includes(program)) throw new Error('program must be CS, IT, AI or DS');
      if (!Number.isInteger(level) || level < 1 || level > 4) throw new Error('level must be 1-4');
      if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 4) throw new Error('cgpa must be 0-4');
      if (!Number.isInteger(passedCredits) || passedCredits < 0 || passedCredits > 300) {
        throw new Error('passed_credits must be 0-300');
      }
      if (!Number.isInteger(transferCredits) || transferCredits < 0 || transferCredits > 54) {
        throw new Error('transfer_credits must be 0-54');
      }
      if (seenEmails.has(email) || seenCodes.has(studentCode)) {
        throw new Error('duplicate email or student_code in file');
      }
      seenEmails.add(email);
      seenCodes.add(studentCode);
      const existing = await one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
      if (existing) throw new Error('email already exists');
      const existingCode = await one<{ id: string }>('SELECT id FROM students WHERE student_code = $1', [
        studentCode,
      ]);
      if (existingCode) throw new Error('student_code already exists');
      let advisorId: string | null = null;
      if (row.advisor_email) {
        const advisor = await one<{ id: string }>(
          `SELECT a.id FROM advisors a JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
          [row.advisor_email.trim().toLowerCase()],
        );
        if (!advisor) throw new Error('advisor_email not found');
        advisorId = advisor.id;
      }
      await withTransaction(async (client) => {
        const user = (
          await client.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, role, full_name, must_change_password)
             VALUES ($1,$2,'student',$3,true) RETURNING id`,
            [email, lockedHash, fullName],
          )
        ).rows[0]!;
        await client.query(
          `INSERT INTO students
             (user_id, student_code, program, level, advisor_id, admission_term,
              current_cgpa, passed_credits, transfer_credits)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            user.id,
            studentCode,
            program,
            level,
            advisorId,
            row.admission_term ?? null,
            cgpa,
            passedCredits,
            transferCredits,
          ],
        );
      });
      success += 1;
    } catch (error) {
      errors.push({
        row: rowNo,
        code: row.student_code ?? null,
        message: error instanceof Error ? error.message : 'invalid row',
        raw: row,
      });
    }
  }
  await saveErrors(jobId, errors);
  await finishJob(jobId, 'completed', success, errors.length);
  await writeAudit({
    actorId,
    action: 'IMPORT_COMPLETED',
    entityType: 'import_job',
    entityId: jobId,
    after: { type: 'students', total: rows.length, success, errors: errors.length },
  });
  return getJob(jobId);
}

const VALID_STATUS = new Set([
  'passed',
  'failed',
  'in_progress',
  'withdrawn',
  'incomplete',
  'continued',
  'absent',
]);
const SEASONS = new Set(['fall', 'spring', 'summer']);

export async function importTranscripts(file: Express.Multer.File | undefined, actorId: string) {
  assertCsvUpload(file);
  await scanUpload(file!.buffer);
  const rows = mapCsvRows(parseCsvBuffer(file!.buffer));
  requireColumns(rows, ['student_code', 'course_code', 'academic_year', 'season']);
  const job = await createJob('transcripts', file!.originalname, rows.length, actorId);
  const jobId = job!.id;
  const errors: RowError[] = [];
  let success = 0;
  const touchedStudents = new Set<string>();
  const gradeRows = await many<{
    letter: string;
    min_pct: string;
    max_pct_exclusive: string | null;
    points: string;
    counts_in_gpa: boolean;
    passed: boolean;
  }>('SELECT * FROM grade_scale ORDER BY min_pct DESC');
  const gradeByLetter = new Map(gradeRows.map((row) => [row.letter, row]));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const rowNo = index + 2;
    try {
      const studentCode = (row.student_code ?? '').trim();
      const courseCode = (row.course_code ?? '').trim().toUpperCase();
      const academicYear = (row.academic_year ?? '').trim();
      const season = (row.season ?? '').trim().toLowerCase();
      if (!/^\d{6,15}$/.test(studentCode)) throw new Error('invalid student_code');
      if (!/^[A-Z]{3}\d{4}$/.test(courseCode)) throw new Error('invalid course_code');
      if (!/^\d{4}-\d{4}$/.test(academicYear)) throw new Error('academic_year must be YYYY-YYYY');
      if (!SEASONS.has(season)) throw new Error('season must be fall, spring or summer');
      const student = await one<{ id: string }>('SELECT id FROM students WHERE student_code = $1', [
        studentCode,
      ]);
      if (!student) throw new Error('unknown student_code');
      const course = await one<{
        id: string;
        credits: number;
        counts_in_gpa: boolean;
        level_hint: number;
      }>(
        'SELECT id, credits, counts_in_gpa, level_hint FROM courses WHERE code = $1 AND deleted_at IS NULL',
        [courseCode],
      );
      if (!course) throw new Error(`unknown course_code ${courseCode}`);
      let letter = (row.grade_letter ?? '').trim().toUpperCase() || null;
      const percentage: number | null = row.percentage ? Number(row.percentage) : null;
      if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
        throw new Error('percentage must be 0-100');
      }
      if (letter && !gradeByLetter.has(letter)) throw new Error(`unknown grade letter ${letter}`);
      if (!letter && percentage !== null) {
        const match = gradeRows.find((item) => {
          const min = Number(item.min_pct);
          const max = item.max_pct_exclusive === null ? 100.0001 : Number(item.max_pct_exclusive);
          return percentage! >= min && percentage! < max;
        });
        letter = match?.letter ?? null;
      }
      if (!letter) throw new Error('grade_letter or percentage is required');
      const scale = gradeByLetter.get(letter)!;
      let status = (row.status ?? '').trim().toLowerCase();
      if (!status) status = scale.passed ? 'passed' : 'failed';
      if (!VALID_STATUS.has(status)) throw new Error(`unknown status ${status}`);
      const term = (row.term ?? '').trim() || `${academicYear}-${season}`;
      const attemptNo = row.attempt_no ? Number(row.attempt_no) : 1;
      if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > 20) {
        throw new Error('attempt_no must be 1-20');
      }
      const previous = await one<{ count: string }>(
        `SELECT count(*)::text AS count FROM enrollments
          WHERE student_id = $1 AND course_id = $2 AND status = 'passed'`,
        [student.id, course.id],
      );
      const isRepeat = Number(previous?.count ?? 0) > 0 && status !== 'in_progress';
      await query(
        `INSERT INTO enrollments
           (student_id, course_id, term, academic_year, season, grade_letter, percentage,
            grade_points, status, attempt_no, counts_in_gpa, is_repeat, recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         ON CONFLICT (student_id, course_id, term, attempt_no) DO UPDATE SET
           grade_letter = EXCLUDED.grade_letter, percentage = EXCLUDED.percentage,
           grade_points = EXCLUDED.grade_points, status = EXCLUDED.status,
           counts_in_gpa = EXCLUDED.counts_in_gpa, is_repeat = EXCLUDED.is_repeat,
           recorded_at = now(), updated_at = now()`,
        [
          student.id,
          course.id,
          term,
          academicYear,
          season,
          letter,
          percentage,
          scale.points,
          status,
          attemptNo,
          course.counts_in_gpa && scale.counts_in_gpa,
          isRepeat,
        ],
      );
      touchedStudents.add(student.id);
      success += 1;
    } catch (error) {
      errors.push({
        row: rowNo,
        code: row.course_code ?? null,
        message: error instanceof Error ? error.message : 'invalid row',
        raw: row,
      });
    }
  }
  for (const studentId of touchedStudents) {
    await recomputeStudentTotals(studentId);
  }
  await saveErrors(jobId, errors);
  await finishJob(jobId, 'completed', success, errors.length);
  await writeAudit({
    actorId,
    action: 'IMPORT_COMPLETED',
    entityType: 'import_job',
    entityId: jobId,
    after: { type: 'transcripts', total: rows.length, success, errors: errors.length },
  });
  return getJob(jobId);
}

/** Recompute official CGPA/passed credits/level from recorded transcript rows. */
export async function recomputeStudentTotals(studentId: string): Promise<void> {
  const passed = await one<{ credits: string }>(
    `WITH best AS (
       SELECT course_id, max(credits)::int AS credits
         FROM (SELECT e.course_id, c.credits FROM enrollments e
                 JOIN courses c ON c.id = e.course_id
                WHERE e.student_id = $1 AND e.status = 'passed') x
        GROUP BY course_id
     ) SELECT COALESCE(sum(credits),0)::text AS credits FROM best`,
    [studentId],
  );
  const gpa = await one<{ cgpa: string | null }>(
    `SELECT round(sum(c.credits * e.grade_points) / NULLIF(sum(c.credits),0), 2)::text AS cgpa
       FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = $1 AND e.counts_in_gpa = true
        AND e.grade_points IS NOT NULL AND e.status IN ('passed','failed')`,
    [studentId],
  );
  const credits = Number(passed?.credits ?? 0);
  const level = credits >= 96 ? 4 : credits >= 62 ? 3 : credits >= 26 ? 2 : 1;
  await query(
    `UPDATE students SET passed_credits = $2, current_cgpa = COALESCE($3, current_cgpa),
       level = $4 WHERE id = $1`,
    [studentId, credits, gpa?.cgpa === null ? null : Number(gpa?.cgpa), level],
  );
}

export async function getJob(jobId: string) {
  const job = await one('SELECT * FROM import_jobs WHERE id = $1', [jobId]);
  if (!job) throw AppError.notFound('Import job not found');
  return job;
}

export async function listJobs(filters: { type?: string; status?: string; limit: number; offset: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.type) {
    params.push(filters.type);
    where.push(`type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM import_jobs ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `SELECT * FROM import_jobs ${clause} ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function jobErrors(jobId: string) {
  await getJob(jobId);
  return many(
    `SELECT id, row_no, code, message, raw, created_at FROM import_row_errors
      WHERE job_id = $1 ORDER BY row_no`,
    [jobId],
  );
}
