import { AppError } from '../../utils/errors';
import { many, one, withTransaction } from '../../config/db';
import { writeAudit } from '../../utils/audit';
import { sanitizeText } from '../../utils/sanitize';

export async function listDepartments() {
  return many(
    `SELECT d.id, d.code, d.name_ar, d.name_en, d.created_at,
            (SELECT count(*)::int FROM students s WHERE s.department_id = d.id) AS student_count
       FROM departments d ORDER BY d.code`,
  );
}

export async function createDepartment(
  input: { code: string; nameAr: string; nameEn: string },
  actorId: string,
) {
  const row = await one(`INSERT INTO departments (code, name_ar, name_en) VALUES ($1,$2,$3) RETURNING *`, [
    input.code,
    sanitizeText(input.nameAr, 200),
    sanitizeText(input.nameEn, 200),
  ]);
  await writeAudit({
    actorId,
    action: 'DEPARTMENT_CREATED',
    entityType: 'department',
    entityId: String((row as { id?: string })?.id ?? ''),
    after: input,
  });
  return row;
}

export async function updateDepartment(
  id: string,
  patch: { nameAr?: string; nameEn?: string },
  actorId: string,
) {
  const row = await one(
    `UPDATE departments SET name_ar = COALESCE($2,name_ar), name_en = COALESCE($3,name_en)
      WHERE id = $1 RETURNING *`,
    [
      id,
      patch.nameAr ? sanitizeText(patch.nameAr, 200) : null,
      patch.nameEn ? sanitizeText(patch.nameEn, 200) : null,
    ],
  );
  if (!row) throw AppError.notFound('Department not found');
  await writeAudit({
    actorId,
    action: 'DEPARTMENT_UPDATED',
    entityType: 'department',
    entityId: id,
    after: patch,
  });
  return row;
}

export async function listStudents(filters: {
  program?: string;
  level?: number;
  search?: string;
  atRisk?: boolean;
  limit: number;
  offset: number;
}) {
  const where: string[] = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.program) {
    params.push(filters.program);
    where.push(`s.program = $${params.length}`);
  }
  if (filters.level) {
    params.push(filters.level);
    where.push(`s.level = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR s.student_code ILIKE $${params.length})`);
  }
  if (filters.atRisk) where.push('s.current_cgpa < 2.00');
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM students s JOIN users u ON u.id = s.user_id ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `SELECT s.id, s.student_code, s.program, s.level, s.current_cgpa, s.passed_credits,
            s.transfer_credits, s.regular_semesters_completed, s.advisor_id, s.department_id,
            u.id AS user_id, u.full_name, u.email, u.status, u.phone
       FROM students s JOIN users u ON u.id = s.user_id ${clause}
      ORDER BY s.student_code LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function getStudent(studentId: string) {
  const student = await one(
    `SELECT s.*, u.full_name, u.email, u.phone, u.status, u.is_demo
       FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [studentId],
  );
  if (!student) throw AppError.notFound('Student not found');
  const [advisor, enrollments, plans, escalations] = await Promise.all([
    one(
      `SELECT a.id, a.office_location, u.full_name, u.email FROM advisors a
        JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
      [(student as { advisor_id: string | null }).advisor_id],
    ),
    many(
      `SELECT e.id, c.code AS course_code, c.name_en, c.credits, e.term, e.status,
              e.grade_letter, e.percentage, e.attempt_no
         FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = $1 ORDER BY e.academic_year DESC, e.season DESC, c.code`,
      [studentId],
    ),
    many(
      `SELECT id, term, status, total_credits, created_at FROM study_plans
        WHERE student_id = $1 ORDER BY created_at DESC`,
      [studentId],
    ),
    many(
      `SELECT id, ticket_no, type, status, priority, subject, created_at FROM escalations
        WHERE student_id = $1 ORDER BY created_at DESC`,
      [studentId],
    ),
  ]);
  return { student, advisor, enrollments, plans, escalations };
}

export async function updateStudent(studentId: string, patch: Record<string, unknown>, actorId: string) {
  const before = await one('SELECT * FROM students WHERE id = $1', [studentId]);
  if (!before) throw AppError.notFound('Student not found');
  if (patch.advisorId) {
    const advisor = await one<{ id: string; max_students: number; count: number }>(
      `SELECT a.id, a.max_students,
              (SELECT count(*)::int FROM students s WHERE s.advisor_id = a.id) AS count
         FROM advisors a WHERE a.id = $1`,
      [patch.advisorId],
    );
    if (!advisor) throw AppError.badRequest('UNKNOWN_ADVISOR', 'Advisor does not exist');
    if (advisor.count >= advisor.max_students) {
      throw AppError.conflict('ADVISOR_FULL', 'Advisor has reached the maximum number of students');
    }
  }
  const row = await one(
    `UPDATE students SET
       program = COALESCE($2, program),
       level = COALESCE($3, level),
       advisor_id = CASE WHEN $4::boolean THEN $5 ELSE advisor_id END,
       department_id = CASE WHEN $6::boolean THEN $7 ELSE department_id END,
       admission_term = COALESCE($8, admission_term),
       current_cgpa = COALESCE($9, current_cgpa),
       passed_credits = COALESCE($10, passed_credits),
       transfer_credits = COALESCE($11, transfer_credits),
       regular_semesters_completed = COALESCE($12, regular_semesters_completed)
     WHERE id = $1 RETURNING *`,
    [
      studentId,
      patch.program ?? null,
      patch.level ?? null,
      patch.advisorId !== undefined,
      patch.advisorId ?? null,
      patch.departmentId !== undefined,
      patch.departmentId ?? null,
      patch.admissionTerm ?? null,
      patch.cgpa ?? null,
      patch.passedCredits ?? null,
      patch.transferCredits ?? null,
      patch.regularSemestersCompleted ?? null,
    ],
  );
  await withTransaction(async (client) => {
    await writeAudit(
      {
        actorId,
        action: 'STUDENT_UPDATED',
        entityType: 'student',
        entityId: studentId,
        before,
        after: patch,
      },
      client,
    );
  });
  return row;
}

const COURSE_SELECT = `
  SELECT c.id, c.code, c.name_ar, c.name_en, c.credits, c.category, c.counts_in_gpa,
         c.level_hint, c.term_hint, c.anomaly_ids, c.active, c.deleted_at, c.created_at
    FROM courses c
`;

export async function listCourses(filters: {
  search?: string;
  program?: string;
  level?: number;
  active?: boolean;
  limit: number;
  offset: number;
}) {
  const where: string[] = ['c.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.search) {
    params.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(
      `(c.code ILIKE $${params.length} OR c.name_en ILIKE $${params.length} OR c.name_ar ILIKE $${params.length})`,
    );
  }
  if (filters.level) {
    params.push(filters.level);
    where.push(`c.level_hint = $${params.length}`);
  }
  if (filters.active !== undefined) {
    params.push(filters.active);
    where.push(`c.active = $${params.length}`);
  }
  if (filters.program) {
    params.push(filters.program);
    where.push(
      `EXISTS (SELECT 1 FROM program_requirements pr WHERE pr.course_id = c.id AND pr.program = $${params.length})`,
    );
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM courses c ${clause}`,
    params,
  );
  params.push(filters.limit, filters.offset);
  const rows = await many(
    `${COURSE_SELECT} ${clause} ORDER BY c.code LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function getCourse(courseId: string) {
  const course = await one(`${COURSE_SELECT} WHERE c.id = $1`, [courseId]);
  if (!course) throw AppError.notFound('Course not found');
  const [prerequisites, requirements, offerings] = await Promise.all([
    many(
      `SELECT cp.id, cp.type, cp.required_course_id, c.code AS required_course_code,
              cp.min_passed_credit_hours
         FROM course_prerequisites cp LEFT JOIN courses c ON c.id = cp.required_course_id
        WHERE cp.course_id = $1 ORDER BY cp.type, c.code`,
      [courseId],
    ),
    many(
      `SELECT pr.id, pr.program, pr.role, pr.pool_id, p.code AS pool_code
         FROM program_requirements pr LEFT JOIN elective_pools p ON p.id = pr.pool_id
        WHERE pr.course_id = $1 ORDER BY pr.program, pr.role`,
      [courseId],
    ),
    many(
      `SELECT id, academic_year, season, capacity, enrolled_count, status
         FROM course_offerings WHERE course_id = $1 ORDER BY academic_year DESC, season`,
      [courseId],
    ),
  ]);
  return { course, prerequisites, requirements, offerings };
}

export async function createCourse(input: Record<string, any>, actorId: string) {
  return withTransaction(async (client) => {
    const course = (
      await client.query(
        `INSERT INTO courses
           (code, name_ar, name_en, credits, category, counts_in_gpa, level_hint, term_hint, anomaly_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          input.code,
          sanitizeText(input.nameAr, 200),
          sanitizeText(input.nameEn, 200),
          input.credits,
          sanitizeText(input.category, 50),
          input.countsInGpa ?? true,
          input.levelHint,
          input.termHint,
          JSON.stringify(input.anomalyIds ?? []),
        ],
      )
    ).rows[0]!;
    if (input.prerequisites) {
      for (const code of input.prerequisites.allOf ?? []) {
        await client.query(
          `INSERT INTO course_prerequisites (course_id, type, required_course_id)
           SELECT $1, 'prerequisite', id FROM courses WHERE code = $2`,
          [course.id, code],
        );
      }
      if (input.prerequisites.minPassedCreditHours != null) {
        await client.query(
          `INSERT INTO course_prerequisites (course_id, type, min_passed_credit_hours)
           VALUES ($1,'hours_required',$2)`,
          [course.id, input.prerequisites.minPassedCreditHours],
        );
      }
    }
    if (input.roles) {
      for (const [program, role] of Object.entries(input.roles as Record<string, string>)) {
        await client.query(`INSERT INTO program_requirements (program, course_id, role) VALUES ($1,$2,$3)`, [
          program,
          course.id,
          role,
        ]);
      }
    }
    await writeAudit(
      {
        actorId,
        action: 'COURSE_CREATED',
        entityType: 'course',
        entityId: course.id,
        after: { code: input.code, credits: input.credits },
      },
      client,
    );
    return course;
  });
}

export async function updateCourse(courseId: string, patch: Record<string, any>, actorId: string) {
  const row = await one(
    `UPDATE courses SET
       name_ar = COALESCE($2,name_ar), name_en = COALESCE($3,name_en),
       credits = COALESCE($4,credits), category = COALESCE($5,category),
       counts_in_gpa = COALESCE($6,counts_in_gpa), level_hint = COALESCE($7,level_hint),
       term_hint = COALESCE($8,term_hint), active = COALESCE($9,active)
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [
      courseId,
      patch.nameAr ? sanitizeText(patch.nameAr, 200) : null,
      patch.nameEn ? sanitizeText(patch.nameEn, 200) : null,
      patch.credits ?? null,
      patch.category ? sanitizeText(patch.category, 50) : null,
      patch.countsInGpa ?? null,
      patch.levelHint ?? null,
      patch.termHint ?? null,
      patch.active ?? null,
    ],
  );
  if (!row) throw AppError.notFound('Course not found');
  await writeAudit({
    actorId,
    action: 'COURSE_UPDATED',
    entityType: 'course',
    entityId: courseId,
    after: patch,
  });
  return row;
}

export async function deleteCourse(courseId: string, actorId: string) {
  const row = await one<{ id: string; code: string }>(
    `UPDATE courses SET active = false, deleted_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING id, code`,
    [courseId],
  );
  if (!row) throw AppError.notFound('Course not found');
  await writeAudit({
    actorId,
    action: 'COURSE_DELETED',
    entityType: 'course',
    entityId: courseId,
    after: { code: row.code, softDelete: true },
  });
}

export async function addPrerequisite(
  courseId: string,
  input: {
    type: 'prerequisite' | 'corequisite' | 'hours_required';
    requiredCourseCode?: string;
    minPassedCreditHours?: number;
  },
  actorId: string,
) {
  let requiredId: string | null = null;
  if (input.requiredCourseCode) {
    const required = await one<{ id: string }>('SELECT id FROM courses WHERE code = $1', [
      input.requiredCourseCode,
    ]);
    if (!required) throw AppError.badRequest('UNKNOWN_COURSE', 'Prerequisite course not found');
    requiredId = required.id;
  }
  if (input.type === 'hours_required' && input.minPassedCreditHours == null) {
    throw AppError.badRequest('INVALID_PREREQUISITE', 'minPassedCreditHours is required');
  }
  if (input.type !== 'hours_required' && !requiredId) {
    throw AppError.badRequest('INVALID_PREREQUISITE', 'requiredCourseCode is required');
  }
  const row = await one(
    `INSERT INTO course_prerequisites (course_id, type, required_course_id, min_passed_credit_hours)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [courseId, input.type, requiredId, input.minPassedCreditHours ?? null],
  );
  await writeAudit({
    actorId,
    action: 'PREREQUISITE_ADDED',
    entityType: 'course',
    entityId: courseId,
    after: input,
  });
  return row;
}

export async function deletePrerequisite(id: string, actorId: string) {
  const row = await one<{ id: string; course_id: string }>(
    'DELETE FROM course_prerequisites WHERE id = $1 RETURNING id, course_id',
    [id],
  );
  if (!row) throw AppError.notFound('Prerequisite not found');
  await writeAudit({
    actorId,
    action: 'PREREQUISITE_DELETED',
    entityType: 'course',
    entityId: row.course_id,
    after: { prerequisiteId: id },
  });
}

export async function createOffering(
  courseId: string,
  input: {
    academicYear: string;
    season: 'fall' | 'spring' | 'summer';
    capacity?: number;
    status?: string;
    meetingTimes?: Array<{ day: string; start: string; end: string; room?: string }>;
    exam?: { date: string; start: string; end: string; room?: string };
  },
  actorId: string,
) {
  return withTransaction(async (client) => {
    const offering = (
      await client.query(
        `INSERT INTO course_offerings (course_id, academic_year, season, capacity, status)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [courseId, input.academicYear, input.season, input.capacity ?? 50, input.status ?? 'open'],
      )
    ).rows[0]!;
    for (const slot of input.meetingTimes ?? []) {
      await client.query(
        `INSERT INTO meeting_times (offering_id, day, start_time, end_time, room)
         VALUES ($1,$2,$3,$4,$5)`,
        [offering.id, slot.day, slot.start, slot.end, slot.room ? sanitizeText(slot.room, 100) : null],
      );
    }
    if (input.exam) {
      await client.query(
        `INSERT INTO exams (offering_id, exam_type, exam_date, start_time, end_time, room)
         VALUES ($1,'final',$2,$3,$4,$5)`,
        [
          offering.id,
          input.exam.date,
          input.exam.start,
          input.exam.end,
          input.exam.room ? sanitizeText(input.exam.room, 100) : null,
        ],
      );
    }
    await writeAudit(
      {
        actorId,
        action: 'OFFERING_CREATED',
        entityType: 'course_offering',
        entityId: offering.id,
        after: { courseId, term: `${input.academicYear}-${input.season}` },
      },
      client,
    );
    return offering;
  });
}

export async function updateOffering(
  offeringId: string,
  patch: { capacity?: number; enrolledCount?: number; status?: string },
  actorId: string,
) {
  const row = await one(
    `UPDATE course_offerings SET capacity = COALESCE($2,capacity),
       enrolled_count = COALESCE($3,enrolled_count), status = COALESCE($4,status)
     WHERE id = $1 RETURNING *`,
    [offeringId, patch.capacity ?? null, patch.enrolledCount ?? null, patch.status ?? null],
  );
  if (!row) throw AppError.notFound('Offering not found');
  await writeAudit({
    actorId,
    action: 'OFFERING_UPDATED',
    entityType: 'course_offering',
    entityId: offeringId,
    after: patch,
  });
  return row;
}

export async function deleteOffering(offeringId: string, actorId: string) {
  const row = await one<{ id: string }>(`DELETE FROM course_offerings WHERE id = $1 RETURNING id`, [
    offeringId,
  ]);
  if (!row) throw AppError.notFound('Offering not found');
  await writeAudit({
    actorId,
    action: 'OFFERING_DELETED',
    entityType: 'course_offering',
    entityId: offeringId,
  });
}
