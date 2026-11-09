import { many, one, withTransaction } from '../config/db';
import { engineClient } from '../integrations/engineClient';
import { AppError } from '../utils/errors';
import { writeAudit } from '../utils/audit';
import { buildStudentRecord, loadOfferings, resolvedAnomalyIds, StudentRow } from './studentContext';
import { Term, termToEngine } from './term';
import { createEscalation, EscalationRow } from './escalations';

export interface Decision {
  status: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN' | 'REVIEW_REQUIRED';
  reason_ar: string;
  reason_en: string;
  rule_code: string;
  article: string;
  page: string;
  anomaly_ids: string[];
  flags: string[];
  details: Record<string, unknown>;
  course_code?: string;
}

export interface EligibilityResult {
  decision: Decision;
  loadDecision: Decision;
  escalation: EscalationRow | null;
}

export interface BulkEligibilityResult {
  decisions: Decision[];
  plannedCredits: number;
  loadDecision: Decision;
  escalations: EscalationRow[];
}

async function persistCheck(
  studentId: string,
  term: Term,
  decision: Decision,
  context: Record<string, unknown>,
): Promise<void> {
  const code = decision.course_code ?? '';
  const course = code ? await one<{ id: string }>('SELECT id FROM courses WHERE code = $1', [code]) : null;
  await one(
    `INSERT INTO eligibility_checks
       (student_id, course_id, course_code, term, status, rule_code, article, page,
        reason_ar, reason_en, anomaly_ids, context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      studentId,
      course?.id ?? null,
      code || 'UNKNOWN',
      term.term,
      decision.status,
      decision.rule_code,
      decision.article,
      decision.page,
      decision.reason_ar,
      decision.reason_en,
      JSON.stringify(decision.anomaly_ids ?? []),
      JSON.stringify(context),
    ],
  );
}

async function escalateIfReview(
  studentId: string,
  actorId: string | null,
  decision: Decision,
  planId?: string,
): Promise<EscalationRow | null> {
  const auto =
    decision.status === 'REVIEW_REQUIRED' &&
    (decision.details?.auto_escalation === true ||
      decision.details?.escalate === true ||
      (decision.anomaly_ids?.length ?? 0) > 0);
  if (!auto) return null;
  return createEscalation({
    studentId,
    createdBy: actorId,
    type: 'RULE_ENGINE',
    priority: 'high',
    subject: `Registration review required${decision.course_code ? ` for ${decision.course_code}` : ''}`,
    description: [
      decision.reason_en,
      decision.anomaly_ids?.length ? `Anomalies: ${decision.anomaly_ids.join(', ')}` : '',
      `Rule ${decision.rule_code} (article ${decision.article}, page ${decision.page}).`,
    ]
      .filter(Boolean)
      .join(' '),
    relatedCourseCode: decision.course_code ?? null,
    relatedPlanId: planId ?? null,
    anomalyIds: decision.anomaly_ids ?? [],
    dedupe: true,
  });
}

function requirementContext(student: StudentRow, term: Term) {
  return {
    student_id: student.id,
    term: term.term,
    season: term.season,
    week: term.week,
  };
}

export async function evaluateCourse(
  student: StudentRow,
  courseCode: string,
  term: Term,
  actorId: string | null,
  options: { plannedCredits?: number; graduationPossible?: boolean } = {},
): Promise<EligibilityResult> {
  const [record, offerings, resolved] = await Promise.all([
    buildStudentRecord(student, term),
    loadOfferings(term),
    resolvedAnomalyIds(),
  ]);
  const response = await engineClient.eligibility<{
    decision: Decision;
    load_decision: Decision;
  }>({
    student: record,
    course_code: courseCode,
    term: termToEngine(term),
    offerings,
    planned_credits: options.plannedCredits ?? null,
    resolved_anomaly_ids: resolved,
    graduation_possible: options.graduationPossible ?? false,
  });
  const decision = { ...response.decision, course_code: courseCode };
  const context = {
    ...requirementContext(student, term),
    load_decision: response.load_decision,
    planned_credits: options.plannedCredits ?? null,
  };
  await persistCheck(student.id, term, decision, context);
  const escalation = await escalateIfReview(student.id, actorId, decision);
  return { decision, loadDecision: response.load_decision, escalation };
}

export async function evaluateBulk(
  student: StudentRow,
  courseCodes: string[],
  term: Term,
  actorId: string | null,
  options: { plannedCredits?: number; graduationPossible?: boolean } = {},
): Promise<BulkEligibilityResult> {
  const [record, offerings, resolved] = await Promise.all([
    buildStudentRecord(student, term),
    loadOfferings(term),
    resolvedAnomalyIds(),
  ]);
  const response = await engineClient.bulkEligibility<{
    decisions: Decision[];
    planned_credits: number;
    load_decision: Decision;
  }>({
    student: record,
    course_codes: courseCodes,
    term: termToEngine(term),
    offerings,
    planned_credits: options.plannedCredits ?? null,
    resolved_anomaly_ids: resolved,
    graduation_possible: options.graduationPossible ?? false,
  });
  const decisions = response.decisions.map((decision) => ({
    ...decision,
    course_code: decision.course_code ?? '',
  }));
  const escalations: EscalationRow[] = [];
  for (const decision of decisions) {
    await persistCheck(student.id, term, decision, {
      ...requirementContext(student, term),
      load_decision: response.load_decision,
      planned_credits: response.planned_credits,
    });
    const escalation = await escalateIfReview(student.id, actorId, decision);
    if (escalation) escalations.push(escalation);
  }
  return {
    decisions,
    plannedCredits: response.planned_credits,
    loadDecision: response.load_decision,
    escalations,
  };
}

export interface PlanItem {
  course_code: string;
  credits: number;
  priority: number;
  source: string;
  decision: Decision;
  meeting_times: Array<Record<string, unknown>>;
}

export interface EnginePlan {
  status: 'DRAFT';
  student_id: string;
  program: string;
  term: Record<string, unknown>;
  total_credits: number;
  max_credits: number;
  items: PlanItem[];
  excluded: Decision[];
  load_decision: Decision;
  load_flags?: string[];
  load_anomaly_ids?: string[];
  planning_slot?: string;
  advisory_only: true;
  engine_version: string;
}

export async function generateDraftPlan(
  student: StudentRow,
  term: Term,
  actorId: string,
  options: {
    maxCredits?: number;
    planningSlot?: string;
    graduationPossible?: boolean;
    preferences?: Record<string, unknown>;
  } = {},
) {
  const [record, offerings, resolved] = await Promise.all([
    buildStudentRecord(student, term),
    loadOfferings(term),
    resolvedAnomalyIds(),
  ]);
  const plan = await engineClient.plan<EnginePlan>({
    student: record,
    term: termToEngine(term),
    offerings,
    max_credits: options.maxCredits ?? null,
    graduation_possible: options.graduationPossible ?? false,
    planning_slot: options.planningSlot ?? null,
    preferences: options.preferences ?? {},
    resolved_anomaly_ids: resolved,
  });

  // Defence in depth: only ELIGIBLE items may ever reach a persisted plan.
  const eligible = plan.items.filter((item) => item.decision.status === 'ELIGIBLE');
  const codes = eligible.map((item) => item.course_code);
  const courses = codes.length
    ? await many<{ id: string; code: string; credits: number }>(
        'SELECT id, code, credits FROM courses WHERE code = ANY($1)',
        [codes],
      )
    : [];
  const byCode = new Map(courses.map((course) => [course.code, course]));

  return withTransaction(async (client) => {
    const planRow = (
      await client.query<{ id: string }>(
        `INSERT INTO study_plans
           (student_id, term, academic_year, season, status, total_credits, generated_by,
            engine_version, planning_slot, load_flags, engine_payload, notes)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          student.id,
          term.term,
          term.academicYear,
          term.season,
          eligible.reduce((sum, item) => sum + (byCode.get(item.course_code)?.credits ?? item.credits), 0),
          actorId,
          plan.engine_version,
          plan.planning_slot ?? null,
          JSON.stringify(plan.load_flags ?? []),
          JSON.stringify({
            load_decision: plan.load_decision,
            excluded: plan.excluded,
            max_credits: plan.max_credits,
            load_anomaly_ids: plan.load_anomaly_ids ?? [],
          }),
          'Advisory draft generated by the rule engine. Never a registration.',
        ],
      )
    ).rows[0]!;

    let position = 0;
    for (const item of eligible) {
      const course = byCode.get(item.course_code);
      if (!course) continue;
      await client.query(
        `INSERT INTO study_plan_items
           (plan_id, course_id, position, credits, eligibility_status, rule_code,
            reason_ar, reason_en, article, page, anomaly_ids, meeting_times)
         VALUES ($1,$2,$3,$4,'ELIGIBLE',$5,$6,$7,$8,$9,$10,$11)`,
        [
          planRow.id,
          course.id,
          position,
          course.credits,
          item.decision.rule_code,
          item.decision.reason_ar,
          item.decision.reason_en,
          item.decision.article,
          item.decision.page,
          JSON.stringify(item.decision.anomaly_ids ?? []),
          JSON.stringify(item.meeting_times ?? []),
        ],
      );
      position += 1;
    }
    await client.query('UPDATE study_plans SET total_credits = $2 WHERE id = $1', [
      planRow.id,
      eligible.reduce((sum, item) => sum + (byCode.get(item.course_code)?.credits ?? 0), 0),
    ]);
    const escalations: EscalationRow[] = [];
    for (const item of eligible) {
      const escalation = await escalateIfReview(student.id, actorId, item.decision, planRow.id);
      if (escalation) escalations.push(escalation);
    }
    await writeAudit(
      {
        actorId,
        action: 'PLAN_GENERATED',
        entityType: 'study_plan',
        entityId: planRow.id,
        after: {
          totalCredits: eligible.reduce((sum, item) => sum + (byCode.get(item.course_code)?.credits ?? 0), 0),
          itemCount: position,
          status: 'DRAFT',
        },
      },
      client,
    );
    return { ...plan, id: planRow.id, items: eligible, escalations };
  });
}

export async function listPlans(studentId: string) {
  return many(
    `SELECT p.id, p.term, p.academic_year, p.season, p.status, p.total_credits,
            p.planning_slot, p.feedback, p.created_at, p.updated_at
       FROM study_plans p WHERE p.student_id = $1
      ORDER BY p.created_at DESC`,
    [studentId],
  );
}

export async function getPlan(planId: string) {
  const plan = await one<Record<string, unknown>>('SELECT * FROM study_plans WHERE id = $1', [planId]);
  if (!plan) throw AppError.notFound('Study plan not found');
  const items = await many(
    `SELECT i.id, i.position, i.credits, i.eligibility_status, i.rule_code, i.reason_ar,
            i.reason_en, i.article, i.page, i.anomaly_ids, i.meeting_times,
            c.code AS course_code, c.name_en, c.name_ar
       FROM study_plan_items i JOIN courses c ON c.id = i.course_id
      WHERE i.plan_id = $1 ORDER BY i.position`,
    [planId],
  );
  return { plan, items };
}

export async function submitPlan(student: StudentRow, planId: string, actorId: string) {
  // Check ownership first so a foreign plan is indistinguishable from a missing one.
  const owned = await one<{ status: string }>(
    'SELECT status FROM study_plans WHERE id = $1 AND student_id = $2',
    [planId, student.id],
  );
  if (!owned) throw AppError.notFound('Study plan not found');
  const result = await one<Record<string, unknown>>(
    `UPDATE study_plans SET status = 'SUBMITTED', submitted_at = now()
      WHERE id = $1 AND student_id = $2 AND status = 'DRAFT' RETURNING *`,
    [planId, student.id],
  );
  if (!result) {
    throw AppError.conflict('PLAN_NOT_SUBMITTABLE', 'Only a DRAFT plan can be submitted');
  }
  await writeAudit({
    actorId,
    action: 'PLAN_SUBMITTED',
    entityType: 'study_plan',
    entityId: planId,
    after: { status: 'SUBMITTED' },
  });
  return result;
}

export async function reviewPlan(
  planId: string,
  actorId: string,
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED',
  feedback: string,
) {
  const result = await one<Record<string, unknown>>(
    `UPDATE study_plans SET status = $2, feedback = $3, reviewed_by = $4, reviewed_at = now()
      WHERE id = $1 AND status IN ('SUBMITTED','MODIFIED') RETURNING *`,
    [planId, decision, feedback, actorId],
  );
  if (!result) throw AppError.conflict('PLAN_NOT_REVIEWABLE', 'Plan is not awaiting review');
  await writeAudit({
    actorId,
    action: 'PLAN_REVIEWED',
    entityType: 'study_plan',
    entityId: planId,
    after: { status: decision, feedback },
  });
  return result;
}

export async function standingFor(student: StudentRow, term: Term) {
  const record = await buildStudentRecord(student, term);
  const result = await engineClient.standing<Record<string, any>>({
    student: record,
    term: termToEngine(term),
  });
  await one(
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
      student.id,
      term.term,
      term.academicYear,
      Number(result.sgpa ?? 0),
      Number(result.cgpa ?? 0),
      Number(result.passed_credits ?? 0),
      Number(result.level ?? student.level),
      Number(result.warning_no ?? 0),
      Number(result.consecutive_warnings ?? 0),
      Number(result.total_warnings ?? 0),
      Boolean(result.probation),
      Boolean(result.dismissal_risk),
      Boolean(result.final_chance),
    ],
  );
  return result;
}

export async function graduationAuditFor(student: StudentRow, term: Term) {
  const record = await buildStudentRecord(student, term);
  return engineClient.graduationAudit<Record<string, any>>({
    student: record,
    term: termToEngine(term),
  });
}

export async function earlyWarningFor(student: StudentRow, term: Term) {
  const record = await buildStudentRecord(student, term);
  return engineClient.earlyWarning<Record<string, any>>({
    student: record,
    term: termToEngine(term),
  });
}

export async function whatIfFor(student: StudentRow, targetProgram: string) {
  const record = await buildStudentRecord(student, {
    season: 'fall',
    academicYear: '2026-2027',
    term: '2026-2027-fall',
    week: 1,
    isFirstSemester: false,
  });
  return engineClient.whatIf<Record<string, any>>({
    student: record,
    target_program: targetProgram,
  });
}

export async function simulateGpa(
  student: StudentRow,
  term: Term,
  simulated: Array<{ courseCode: string; percentage?: number | null; gradeLetter?: string | null }>,
  futureCgpaTarget?: number | null,
) {
  const codes = simulated.map((item) => item.courseCode);
  const courses = codes.length
    ? await many<{
        code: string;
        credits: number;
        level_hint: number;
        counts_in_gpa: boolean;
      }>('SELECT code, credits, level_hint, counts_in_gpa FROM courses WHERE code = ANY($1)', [codes])
    : [];
  const byCode = new Map(courses.map((course) => [course.code, course]));
  const attempts = simulated.map((item) => {
    const course = byCode.get(item.courseCode);
    if (!course) throw AppError.badRequest('UNKNOWN_COURSE', `Unknown course ${item.courseCode}`);
    return {
      code: course.code,
      credits: course.credits,
      percentage: item.percentage ?? null,
      grade_letter: item.gradeLetter ?? null,
      status: item.gradeLetter === 'F' ? 'failed' : 'passed',
      attempt_no: 1,
      counts_in_gpa: course.counts_in_gpa,
      is_repeat: false,
      term: term.term,
      course_level: course.level_hint,
    };
  });
  const record = await buildStudentRecord(student, term);
  return engineClient.gpaSimulate<Record<string, any>>({
    student: record,
    term: termToEngine(term),
    simulated: attempts,
    future_cgpa_target: futureCgpaTarget ?? null,
  });
}
