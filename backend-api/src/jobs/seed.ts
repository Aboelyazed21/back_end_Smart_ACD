import fs from 'node:fs';
import path from 'node:path';
import { PoolClient } from 'pg';
import { closePool, pool, withTransaction } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { hashPassword } from '../utils/password';

function dataDir(): string {
  if (process.env.REGULATION_DATA_DIR) return path.resolve(process.env.REGULATION_DATA_DIR);
  return path.resolve(__dirname, '../../../regulation-data');
}

function readJson<T = any>(name: string): T {
  const file = path.join(dataDir(), name);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

const POOL_NAMES: Record<string, { ar: string; en: string }> = {
  UNIV_ELECTIVE: { ar: 'اختياري جامعي', en: 'University Elective' },
  HUMANITIES_ELECTIVE: { ar: 'اختياري إنساني', en: 'Humanities Elective' },
  BASIC_COMPUTING_ELECTIVE: { ar: 'اختياري حوسبة أساسية', en: 'Basic Computing Elective' },
  CS_ELECTIVE: { ar: 'اختياري علوم الحاسب', en: 'Computer Science Elective' },
  IT_ELECTIVE: { ar: 'اختياري تكنولوجيا المعلومات', en: 'Information Technology Elective' },
  AI_ELECTIVE: { ar: 'اختياري الذكاء الاصطناعي', en: 'Artificial Intelligence Elective' },
  DS_ELECTIVE: { ar: 'اختياري علم البيانات', en: 'Data Science Elective' },
};

const DEPARTMENTS = [
  { code: 'CS', ar: 'علوم الحاسب', en: 'Computer Science' },
  { code: 'IT', ar: 'تكنولوجيا المعلومات', en: 'Information Technology' },
  { code: 'AI', ar: 'الذكاء الاصطناعي', en: 'Artificial Intelligence' },
  { code: 'DS', ar: 'علم البيانات', en: 'Data Science' },
];

interface DemoStudent {
  code: string;
  email: string;
  name: string;
  program: 'CS' | 'IT' | 'AI' | 'DS';
  level: number;
  cgpa: number;
  passed: number;
  regular: number;
  advisor: 1 | 2;
  warningNo: number;
  consecutive: number;
  total: number;
  probation: boolean;
  dismissal: boolean;
  finalChance: boolean;
}

const DEMO_STUDENTS: DemoStudent[] = [
  {
    code: '26000001',
    email: 'student1@aidm.bua.edu.eg',
    name: 'Ahmed Mahmoud Ali',
    program: 'CS',
    level: 1,
    cgpa: 3.4,
    passed: 0,
    regular: 0,
    advisor: 1,
    warningNo: 0,
    consecutive: 0,
    total: 0,
    probation: false,
    dismissal: false,
    finalChance: false,
  },
  {
    code: '26000002',
    email: 'student2@aidm.bua.edu.eg',
    name: 'Mariam Hassan Saleh',
    program: 'IT',
    level: 2,
    cgpa: 2.4,
    passed: 34,
    regular: 2,
    advisor: 2,
    warningNo: 0,
    consecutive: 0,
    total: 0,
    probation: false,
    dismissal: false,
    finalChance: false,
  },
  {
    code: '26000003',
    email: 'student3@aidm.bua.edu.eg',
    name: 'Youssef Ibrahim Kamal',
    program: 'AI',
    level: 3,
    cgpa: 1.95,
    passed: 64,
    regular: 4,
    advisor: 1,
    warningNo: 1,
    consecutive: 1,
    total: 1,
    probation: true,
    dismissal: false,
    finalChance: false,
  },
  {
    code: '26000004',
    email: 'student4@aidm.bua.edu.eg',
    name: 'Nour Adel Fathy',
    program: 'DS',
    level: 4,
    cgpa: 3.1,
    passed: 104,
    regular: 6,
    advisor: 2,
    warningNo: 0,
    consecutive: 0,
    total: 1,
    probation: false,
    dismissal: false,
    finalChance: false,
  },
  {
    code: '26000005',
    email: 'student5@aidm.bua.edu.eg',
    name: 'Omar Tarek Mostafa',
    program: 'CS',
    level: 4,
    cgpa: 1.6,
    passed: 110,
    regular: 8,
    advisor: 1,
    warningNo: 4,
    consecutive: 4,
    total: 4,
    probation: true,
    dismissal: true,
    finalChance: true,
  },
  {
    code: '26000006',
    email: 'student6@aidm.bua.edu.eg',
    name: 'Salma Hany Ezzat',
    program: 'IT',
    level: 1,
    cgpa: 0,
    passed: 0,
    regular: 0,
    advisor: 2,
    warningNo: 0,
    consecutive: 0,
    total: 0,
    probation: false,
    dismissal: false,
    finalChance: false,
  },
];

function academicYear(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function currentSeason(now = new Date()): 'fall' | 'spring' | 'summer' {
  const month = now.getUTCMonth() + 1;
  if (month >= 9) return 'fall';
  if (month <= 5) return 'spring';
  return 'summer';
}

async function seedReference(client: PoolClient) {
  const coursesPayload = readJson<{ courses: any[] }>('courses.json');
  const programs = readJson<any>('programs.json');
  const regulation = readJson<any>('regulation_rules.json');
  const anomalies = readJson<{ anomalies: any[] }>('anomalies.json');
  const courses = coursesPayload.courses;

  // Departments
  for (const dept of DEPARTMENTS) {
    await client.query(
      `INSERT INTO departments (code, name_ar, name_en) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
      [dept.code, dept.ar, dept.en],
    );
  }

  // Courses
  for (const course of courses) {
    await client.query(
      `INSERT INTO courses
         (code, name_ar, name_en, credits, category, counts_in_gpa, level_hint, term_hint, anomaly_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO UPDATE SET
         name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, credits = EXCLUDED.credits,
         category = EXCLUDED.category, counts_in_gpa = EXCLUDED.counts_in_gpa,
         level_hint = EXCLUDED.level_hint, term_hint = EXCLUDED.term_hint,
         anomaly_ids = EXCLUDED.anomaly_ids`,
      [
        course.code,
        course.name_ar ?? course.name_en ?? course.code,
        course.name_en ?? course.name_ar ?? course.code,
        course.credits,
        course.category,
        course.counts_in_gpa ?? true,
        course.level_hint ?? 1,
        course.term_hint ?? 1,
        JSON.stringify(course.anomaly_ids ?? []),
      ],
    );
  }

  // Prerequisites
  for (const course of courses) {
    const pre = course.prerequisites || {};
    for (const code of pre.all_of ?? []) {
      await client.query(
        `INSERT INTO course_prerequisites (course_id, type, required_course_id)
         SELECT c.id, 'prerequisite', r.id FROM courses c, courses r
          WHERE c.code = $1 AND r.code = $2
         ON CONFLICT (course_id, type, required_course_id) DO NOTHING`,
        [course.code, code],
      );
    }
    if (pre.min_passed_credit_hours != null) {
      const exists = await client.query(
        `SELECT 1 FROM course_prerequisites cp JOIN courses c ON c.id = cp.course_id
          WHERE c.code = $1 AND cp.type = 'hours_required'`,
        [course.code],
      );
      if (exists.rowCount === 0) {
        await client.query(
          `INSERT INTO course_prerequisites (course_id, type, min_passed_credit_hours)
           SELECT id, 'hours_required', $2 FROM courses WHERE code = $1`,
          [course.code, pre.min_passed_credit_hours],
        );
      }
    }
  }

  // Elective pools and their courses
  for (const [poolCode, poolData] of Object.entries<any>(programs.elective_pools ?? {})) {
    const names = POOL_NAMES[poolCode] ?? { ar: poolCode, en: poolCode };
    const poolRow = await client.query<{ id: string }>(
      `INSERT INTO elective_pools (code, name_ar, name_en, credits_required, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET credits_required = EXCLUDED.credits_required,
         source = EXCLUDED.source, name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en
       RETURNING id`,
      [poolCode, names.ar, names.en, poolData.credits_required ?? 0, poolData.source ?? null],
    );
    const poolId = poolRow.rows[0]!.id;
    const mandatory = new Set<string>(poolData.mandatory ?? []);
    for (const code of poolData.courses ?? []) {
      await client.query(
        `INSERT INTO elective_pool_courses (pool_id, course_id, is_mandatory)
         SELECT $1, id, $3 FROM courses WHERE code = $2
         ON CONFLICT (pool_id, course_id) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory`,
        [poolId, code, mandatory.has(code)],
      );
    }
  }

  // Program requirements
  const programPools: Record<string, string> = {};
  for (const [program, info] of Object.entries<any>(programs.programs ?? {})) {
    programPools[program] = info.elective_pool;
    const add = async (code: string, role: string, poolCode?: string) => {
      let poolId: string | null = null;
      if (poolCode) {
        const row = await client.query<{ id: string }>('SELECT id FROM elective_pools WHERE code = $1', [
          poolCode,
        ]);
        poolId = row.rows[0]?.id ?? null;
      }
      await client.query(
        `INSERT INTO program_requirements (program, course_id, role, pool_id)
         SELECT $1, id, $3, $4 FROM courses WHERE code = $2
         ON CONFLICT (program, course_id, role) DO NOTHING`,
        [program, code, role, poolId],
      );
    };
    for (const code of programs.common_compulsory ?? []) await add(code, 'compulsory');
    for (const code of info.compulsory ?? []) await add(code, 'compulsory');
    for (const code of info.labs ?? []) await add(code, 'lab');
    for (const code of info.project ?? []) await add(code, 'project');
    if (info.field_training) await add(info.field_training, 'field_training');
    if (info.selected_topic) await add(info.selected_topic, 'selected_topic');
    for (const [poolCode, poolData] of Object.entries<any>(programs.elective_pools ?? {})) {
      if (!Array.isArray((poolData as any).courses)) continue;
      for (const code of (poolData as any).courses) {
        await add(code, 'elective', poolCode);
      }
    }
  }

  // Recommended plans
  const plans = programs.recommended_plans ?? {};
  for (const [program, slots] of Object.entries<any>(plans)) {
    // "COMMON" is a valid plan namespace.
    for (const [slot, items] of Object.entries<any>(slots)) {
      const [levelText, termText] = slot.split('-');
      const level = Number(levelText);
      const term = Number(termText);
      if (!level || !term) continue;
      await client.query('DELETE FROM recommended_plans WHERE program = $1 AND level = $2 AND term = $3', [
        program,
        level,
        term,
      ]);
      let position = 0;
      for (const item of items) {
        let courseId: string | null = null;
        let poolId: string | null = null;
        let credits = Number(item.credits ?? 0);
        if (item.course) {
          const row = await client.query<{ id: string; credits: number }>(
            'SELECT id, credits FROM courses WHERE code = $1',
            [item.course],
          );
          if (!row.rows[0]) continue;
          courseId = row.rows[0].id;
          credits = row.rows[0].credits;
        } else if (item.elective_pool) {
          const row = await client.query<{ id: string }>('SELECT id FROM elective_pools WHERE code = $1', [
            item.elective_pool,
          ]);
          if (!row.rows[0]) continue;
          poolId = row.rows[0].id;
        } else {
          continue;
        }
        await client.query(
          `INSERT INTO recommended_plans
             (program, level, term, position, course_id, pool_id, credits)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [program, level, term, position, courseId, poolId, credits],
        );
        position += 1;
      }
    }
  }

  // Grade scale (regular grades only; special grades are applied by the engine)
  for (const grade of regulation.grade_scale ?? []) {
    await client.query(
      `INSERT INTO grade_scale (letter, min_pct, max_pct_exclusive, points, counts_in_gpa, passed)
       VALUES ($1,$2,$3,$4,true,$5)
       ON CONFLICT (letter) DO UPDATE SET min_pct = EXCLUDED.min_pct,
         max_pct_exclusive = EXCLUDED.max_pct_exclusive, points = EXCLUDED.points,
         counts_in_gpa = EXCLUDED.counts_in_gpa, passed = EXCLUDED.passed`,
      [grade.letter, grade.min_pct, grade.max_pct_exclusive ?? null, grade.points, grade.letter !== 'F'],
    );
  }

  // Regulation rule index
  for (const rule of regulation.rules ?? []) {
    await client.query(
      `INSERT INTO regulation_rules
         (rule_code, article_no, clause_no, page_no, title_ar, title_en, summary_ar, summary_en, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')
       ON CONFLICT (rule_code) DO UPDATE SET
         article_no = EXCLUDED.article_no, clause_no = EXCLUDED.clause_no,
         page_no = EXCLUDED.page_no, title_ar = EXCLUDED.title_ar,
         summary_ar = EXCLUDED.summary_ar, summary_en = EXCLUDED.summary_en`,
      [
        rule.rule_code,
        String(rule.article),
        rule.clause == null ? null : String(rule.clause),
        String(rule.page),
        rule.title_ar ?? rule.rule_code,
        rule.title_en ?? null,
        rule.summary_ar ?? '',
        rule.summary_en ?? null,
      ],
    );
  }

  // Data anomalies: preserve admin resolutions on re-seed.
  for (const anomaly of anomalies.anomalies ?? []) {
    await client.query(
      `INSERT INTO data_anomalies
         (id, severity, type, title_ar, title_en, description_ar, description_en, sources,
          affected_courses, affected_rules, working_value, resolved_value, engine_behavior,
          suggested_resolution, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         severity = EXCLUDED.severity, type = EXCLUDED.type, title_ar = EXCLUDED.title_ar,
         title_en = EXCLUDED.title_en, description_ar = EXCLUDED.description_ar,
         description_en = EXCLUDED.description_en, sources = EXCLUDED.sources,
         affected_courses = EXCLUDED.affected_courses, affected_rules = EXCLUDED.affected_rules,
         engine_behavior = EXCLUDED.engine_behavior,
         suggested_resolution = EXCLUDED.suggested_resolution`,
      [
        anomaly.id,
        anomaly.severity,
        anomaly.type,
        anomaly.title_ar,
        anomaly.title_en ?? null,
        anomaly.description_ar ?? '',
        anomaly.description_en ?? null,
        JSON.stringify(anomaly.sources ?? []),
        JSON.stringify(anomaly.affected_courses ?? []),
        JSON.stringify(anomaly.affected_rules ?? []),
        anomaly.working_value ?? null,
        anomaly.resolved_value ?? null,
        anomaly.engine_behavior ?? null,
        anomaly.suggested_resolution_non_binding ?? null,
        anomaly.status ?? 'open',
      ],
    );
  }

  // Policy document metadata (chunks and embeddings are ingested by the rule engine).
  try {
    const policy = readJson<{ document: any }>('policy_chunks.json');
    const doc = policy.document;
    await client.query(
      `INSERT INTO policy_documents (title, source_file, checksum, page_count, language)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (checksum) DO UPDATE SET title = EXCLUDED.title`,
      [doc.title, doc.source_file, doc.checksum, doc.page_count ?? 60, doc.language ?? 'ar'],
    );
  } catch (error) {
    logger.warn({ err: error }, 'policy chunk metadata not seeded');
  }
}

async function seedOfferings(client: PoolClient) {
  const year = academicYear();
  const seasons: Array<'fall' | 'spring' | 'summer'> = ['fall', 'spring', 'summer'];
  const courses = (
    await client.query<{ id: string; code: string }>('SELECT id, code FROM courses WHERE deleted_at IS NULL')
  ).rows;
  for (const season of seasons) {
    for (const course of courses) {
      await client.query(
        `INSERT INTO course_offerings (course_id, academic_year, season, capacity, enrolled_count, status)
         VALUES ($1,$2,$3,50,20,'open')
         ON CONFLICT (course_id, academic_year, season) DO NOTHING`,
        [course.id, year, season],
      );
    }
  }
}

async function seedDemo(client: PoolClient) {
  // An explicit SEED_DEMO always wins; otherwise demo accounts follow the
  // environment (local development yes, production no). This prevents a
  // production stack from creating demo logins just because Compose defaulted
  // a variable.
  const flag = process.env.SEED_DEMO;
  const enabled = flag === undefined ? process.env.NODE_ENV !== 'production' : flag === 'true';
  if (!enabled) {
    logger.info('demo data skipped (set SEED_DEMO=true to include it)');
    return;
  }
  const passwordHash = await hashPassword(env.DEMO_PASSWORD);

  const makeUser = async (
    email: string,
    fullName: string,
    role: 'student' | 'advisor' | 'admin',
    isDemo = true,
  ): Promise<string | null> => {
    const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) return existing.rows[0].id;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, full_name, must_change_password, is_demo)
       VALUES ($1,$2,$3,$4,false,$5) RETURNING id`,
      [email, passwordHash, role, fullName, isDemo],
    );
    return inserted.rows[0]!.id;
  };

  const adminId = await makeUser('admin@bua.edu.eg', 'System Administrator', 'admin');

  const deptRows = await client.query<{ id: string; code: string }>('SELECT id, code FROM departments');
  const departments = new Map(deptRows.rows.map((row) => [row.code, row.id]));

  const advisorSpecs = [
    { email: 'advisor1@aidm.bua.edu.eg', name: 'Dr. Hoda Abdelrahman', dept: 'CS' },
    { email: 'advisor2@aidm.bua.edu.eg', name: 'Dr. Karim El-Sayed', dept: 'IT' },
  ];
  const advisorIds: string[] = [];
  for (const spec of advisorSpecs) {
    const userId = await makeUser(spec.email, spec.name, 'advisor');
    const existing = await client.query<{ id: string }>('SELECT id FROM advisors WHERE user_id = $1', [
      userId,
    ]);
    if (existing.rows[0]) {
      advisorIds.push(existing.rows[0].id);
      continue;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO advisors (user_id, department_id, office_location, max_students)
       VALUES ($1,$2,$3,60) RETURNING id`,
      [userId, departments.get(spec.dept) ?? null, `Office ${spec.dept}-201`],
    );
    advisorIds.push(inserted.rows[0]!.id);
  }

  const year = academicYear();
  const season = currentSeason();
  const term = `${year}-${season}`;
  const slotTerm = season === 'spring' ? 2 : 1;
  const demoStudentIds: string[] = [];

  for (const spec of DEMO_STUDENTS) {
    const userId = await makeUser(spec.email, spec.name, 'student');
    const existing = await client.query<{ id: string }>('SELECT id FROM students WHERE student_code = $1', [
      spec.code,
    ]);
    let studentId: string;
    if (existing.rows[0]) {
      studentId = existing.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO students
           (user_id, student_code, department_id, advisor_id, program, level, admission_term,
            current_cgpa, passed_credits, regular_semesters_completed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          userId,
          spec.code,
          departments.get(spec.program) ?? null,
          advisorIds[spec.advisor - 1] ?? null,
          spec.program,
          spec.level,
          `${year}-${season}`,
          spec.cgpa,
          spec.passed,
          spec.regular,
        ],
      );
      studentId = inserted.rows[0]!.id;
    }
    demoStudentIds.push(studentId);

    // Current draft-term enrolments from the recommended plan.
    const recommended = await client.query<{ course_id: string | null; position: number }>(
      `SELECT course_id, position FROM recommended_plans
        WHERE program IN ('COMMON',$1) AND level = $2 AND term = $3 AND course_id IS NOT NULL
        ORDER BY program, position LIMIT 5`,
      [spec.program, spec.level, slotTerm],
    );
    for (const row of recommended.rows) {
      if (!row.course_id) continue;
      await client.query(
        `INSERT INTO enrollments
           (student_id, course_id, term, academic_year, season, status, attempt_no, counts_in_gpa)
         SELECT $1, id, $2, $3, $4, 'in_progress', 1, true FROM courses WHERE id = $5
         ON CONFLICT (student_id, course_id, term, attempt_no) DO NOTHING`,
        [studentId, term, year, season, row.course_id],
      );
    }

    // A little transcript history so failed-course and repeat flows are visible.
    if (spec.code === '26000003') {
      await client.query(
        `INSERT INTO enrollments
           (student_id, course_id, term, academic_year, season, grade_letter, percentage,
            grade_points, status, attempt_no, counts_in_gpa, recorded_at)
         SELECT $1, id, '2025-2026-fall', '2025-2026', 'fall', 'F', 45, 0, 'failed', 1, true, now()
           FROM courses WHERE code = 'CSB1201'
         ON CONFLICT (student_id, course_id, term, attempt_no) DO NOTHING`,
        [studentId],
      );
    }
    if (spec.code === '26000005') {
      for (const code of ['CSB2201', 'CSC3101']) {
        await client.query(
          `INSERT INTO enrollments
             (student_id, course_id, term, academic_year, season, grade_letter, percentage,
              grade_points, status, attempt_no, counts_in_gpa, recorded_at)
           SELECT $1, id, '2025-2026-fall', '2025-2026', 'fall', 'F', 42, 0, 'failed', 1, true, now()
             FROM courses WHERE code = $2
           ON CONFLICT (student_id, course_id, term, attempt_no) DO NOTHING`,
          [studentId, code],
        );
      }
    }

    await client.query(
      `INSERT INTO academic_standing
         (student_id, term, academic_year, sgpa, cgpa, passed_credits, level, warning_no,
          consecutive_warnings, total_warnings, probation, dismissal_risk, final_chance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (student_id, term) DO UPDATE SET
         sgpa = EXCLUDED.sgpa, cgpa = EXCLUDED.cgpa, passed_credits = EXCLUDED.passed_credits,
         level = EXCLUDED.level, warning_no = EXCLUDED.warning_no,
         consecutive_warnings = EXCLUDED.consecutive_warnings,
         total_warnings = EXCLUDED.total_warnings, probation = EXCLUDED.probation,
         dismissal_risk = EXCLUDED.dismissal_risk, final_chance = EXCLUDED.final_chance`,
      [
        studentId,
        term,
        year,
        spec.cgpa,
        spec.cgpa,
        spec.passed,
        spec.level,
        spec.warningNo,
        spec.consecutive,
        spec.total,
        spec.probation,
        spec.dismissal,
        spec.finalChance,
      ],
    );

    const hasNotification = await client.query('SELECT 1 FROM notifications WHERE user_id = $1 LIMIT 1', [
      userId,
    ]);
    if (hasNotification.rowCount === 0) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1,'welcome','Welcome to Smart Academic Advisor',
                 'Your advisory account is ready. Plans are always drafts and never register courses.')`,
        [userId],
      );
    }
  }

  // Office hours for demo advisors.
  for (const advisorId of advisorIds) {
    const count = await client.query('SELECT 1 FROM office_hour_slots WHERE advisor_id = $1 LIMIT 1', [
      advisorId,
    ]);
    if (count.rowCount === 0) {
      await client.query(
        `INSERT INTO office_hour_slots (advisor_id, weekday, start_time, end_time, location)
         VALUES ($1,0,'10:00','11:30','Advisor office'),
                ($1,2,'13:00','14:30','Advisor office')`,
        [advisorId],
      );
    }
  }

  logger.info(
    { students: demoStudentIds.length, advisors: advisorIds.length, admin: Boolean(adminId) },
    'demo accounts seeded',
  );
}

async function main() {
  const started = Date.now();
  logger.info({ dataDir: dataDir() }, 'seeding regulation data');
  await withTransaction(async (client) => {
    await seedReference(client);
    await seedOfferings(client);
    await seedDemo(client);
  });
  const counts = await pool.query<{ courses: string; rules: string; anomalies: string }>(
    `SELECT (SELECT count(*) FROM courses)::text AS courses,
            (SELECT count(*) FROM regulation_rules)::text AS rules,
            (SELECT count(*) FROM data_anomalies)::text AS anomalies`,
  );
  logger.info({ ...counts.rows[0], durationMs: Date.now() - started }, 'seed complete');
  await closePool();
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'seed failed');
  await closePool().catch(() => undefined);
  process.exitCode = 1;
});
