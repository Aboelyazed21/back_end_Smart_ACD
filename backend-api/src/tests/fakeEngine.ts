import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/**
 * Deterministic stand-in for the Python rule engine. It implements the same
 * JSON contract, validates the service token and HMAC signature, and exposes a
 * few course codes that deliberately return blocking decisions so the backend's
 * escalation and re-evaluation paths can be exercised.
 */

export interface EngineCall {
  path: string;
  body: Record<string, any>;
  headers: http.IncomingHttpHeaders;
}

const PORT = Number(new URL(process.env.ENGINE_URL!).port || 4599);
const REVIEW_COURSES: Record<string, string> = { INF4105: 'A-CAT-09' };
const NOT_ELIGIBLE_COURSES = new Set(['CSB2101', 'CSB2201', 'CSC3101']);
const WARNING_COURSES: Record<string, string> = { UNI1204: 'A-REG-05' };
const INFO_COURSES: Record<string, string> = { AIN3205: 'A-CAT-16' };

let server: http.Server | null = null;
let failuresRemaining = 0;
const calls: EngineCall[] = [];

function loadCredits(): Map<string, number> {
  try {
    const file = path.resolve(
      process.env.REGULATION_DATA_DIR ?? path.resolve(__dirname, '../../../regulation-data'),
      'courses.json',
    );
    const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      courses: Array<{ code: string; credits: number }>;
    };
    return new Map(payload.courses.map((course) => [course.code, course.credits]));
  } catch {
    return new Map();
  }
}

const CREDITS = loadCredits();

function decision(courseCode: string, resolved: string[]): Record<string, unknown> {
  const reviewAnomaly = REVIEW_COURSES[courseCode];
  const warningAnomaly = WARNING_COURSES[courseCode];
  const infoAnomaly = INFO_COURSES[courseCode];
  const common = {
    reason_ar: 'قرار توضيحي من محرك القواعد.',
    reason_en: 'Deterministic rule engine decision.',
    article: '5',
    page: '12',
    flags: [] as string[],
    details: {} as Record<string, unknown>,
  };

  if (reviewAnomaly && !resolved.includes(reviewAnomaly)) {
    return {
      ...common,
      status: 'REVIEW_REQUIRED',
      reason_ar: 'توجد مخالفة مانعة تتطلب مراجعة المستشار.',
      reason_en: `Blocking anomaly ${reviewAnomaly} requires advisor review.`,
      rule_code: reviewAnomaly,
      anomaly_ids: [reviewAnomaly],
      flags: ['ANOMALY_BLOCKING'],
      details: { auto_escalation: true },
    };
  }
  if (NOT_ELIGIBLE_COURSES.has(courseCode)) {
    return {
      ...common,
      status: 'NOT_ELIGIBLE',
      reason_ar: 'المتطلب السابق غير مكتمل.',
      reason_en: 'Prerequisite has not been passed.',
      rule_code: 'REG-PREREQ-01',
      anomaly_ids: [],
    };
  }
  if (warningAnomaly) {
    return {
      ...common,
      status: 'ELIGIBLE',
      reason_ar: 'مؤهل مع ملاحظة تحذيرية.',
      reason_en: 'Eligible with a documented warning anomaly.',
      rule_code: 'REG-ELIG-01',
      anomaly_ids: [warningAnomaly],
      flags: [`ANOMALY_${warningAnomaly.replace(/-/g, '_')}`],
      details: { working_value_used: true },
    };
  }
  if (infoAnomaly) {
    return {
      ...common,
      status: 'ELIGIBLE',
      reason_ar: 'مؤهل مع ملاحظة معلوماتية.',
      reason_en: 'Eligible; an informational anomaly is documented.',
      rule_code: 'REG-ELIG-01',
      anomaly_ids: [infoAnomaly],
    };
  }
  return {
    ...common,
    status: 'ELIGIBLE',
    reason_ar: 'مؤهل للتسجيل في هذا المقرر.',
    reason_en: 'Eligible for this course.',
    rule_code: 'REG-ELIG-01',
    anomaly_ids: [],
    details: { checks: ['prerequisites', 'load', 'level'] },
  };
}

function loadDecision(plannedCredits: number): Record<string, unknown> {
  return {
    status: 'ELIGIBLE',
    reason_ar: 'الحمل الدراسي داخل الحد المسموح.',
    reason_en: 'Planned load is within the allowed maximum.',
    rule_code: 'REG-LOAD-01',
    article: '7',
    page: '15',
    anomaly_ids: [],
    flags: [],
    details: { planned_credits: plannedCredits, max_credits: 18 },
  };
}

function makePlan(body: Record<string, any>): Record<string, unknown> {
  const resolved: string[] = body.resolved_anomaly_ids ?? [];
  const term = body.term ?? { season: 'fall', academic_year: '2026-2027' };
  const maxCredits = body.max_credits ?? 15;
  const attempted = new Set(
    [...(body.student?.completed ?? []), ...(body.student?.current ?? [])].map(
      (item: { code: string }) => item.code,
    ),
  );
  const available: string[] = (body.offerings ?? [])
    .map((offering: { code: string }) => offering.code)
    .filter(
      (code: string) => !attempted.has(code) && !NOT_ELIGIBLE_COURSES.has(code) && !REVIEW_COURSES[code],
    );
  const unique = [...new Set(available)];
  const items: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const code of unique) {
    const credits = CREDITS.get(code) ?? 0;
    if (credits <= 0 || items.length >= 6 || total + credits > maxCredits) continue;
    const courseDecision = decision(code, resolved);
    if (courseDecision.status !== 'ELIGIBLE') continue;
    items.push({
      course_code: code,
      credits,
      priority: items.length + 1,
      source: 'program_requirement',
      decision: courseDecision,
      meeting_times: [],
    });
    total += credits;
  }
  const reviewCodes = unique.filter(
    (code) => REVIEW_COURSES[code] && !resolved.includes(REVIEW_COURSES[code]!),
  );
  return {
    status: 'DRAFT',
    student_id: body.student?.id ?? 'unknown',
    program: body.student?.program ?? 'CS',
    term,
    total_credits: total,
    max_credits: maxCredits,
    items,
    excluded: reviewCodes.map((code) => ({ ...decision(code, resolved), course_code: code })),
    load_decision: loadDecision(total),
    load_flags: [],
    load_anomaly_ids: [],
    advisory_only: true,
    engine_version: 'test-engine-1.0.0',
  };
}

function ragAnswer(body: Record<string, any>): Record<string, unknown> {
  const question = String(body.question ?? '');
  if (/unknown topic|غير معروف/i.test(question)) {
    return {
      answer: 'لا تتوفر مادة نظامية كافية للإجابة على هذا السؤال.',
      answer_language: 'ar',
      citations: [],
      confidence: 0.18,
      escalate: true,
      escalate_reason: 'Low retrieval confidence',
      anomaly_ids: [],
      flags: ['LOW_CONFIDENCE'],
    };
  }
  if (/A-[A-Z]+-\d{2}/.test(question)) {
    const anomaly = question.match(/A-[A-Z]+-\d{2}/)![0];
    return {
      answer: 'الموضوع مرتبط بمخالفة بيانات مفتوحة ويحتاج مراجعة.',
      answer_language: 'ar',
      citations: [{ article: '4', clause: '2', page: 9, source: 'BUA-AIDM.pdf', title: 'اللائحة' }],
      confidence: 0.55,
      escalate: true,
      escalate_reason: 'Open anomaly affects this topic',
      anomaly_ids: [anomaly],
      flags: ['OPEN_ANOMALY'],
    };
  }
  return {
    answer: 'According to Article 7, a student may register up to 18 credit hours in a regular semester.',
    answer_language: 'en',
    citations: [{ article: '7', clause: '1', page: 15, source: 'BUA-AIDM.pdf', title: 'Credit load' }],
    confidence: 0.91,
    escalate: false,
    escalate_reason: null,
    anomaly_ids: [],
    flags: [],
  };
}

function handle(path: string, body: Record<string, any>): Record<string, unknown> {
  const resolved: string[] = body.resolved_anomaly_ids ?? [];
  switch (path) {
    case '/engine/eligibility': {
      const code = String(body.course_code);
      return {
        decision: { ...decision(code, resolved), course_code: code },
        load_decision: loadDecision(Number(body.planned_credits ?? 0)),
      };
    }
    case '/engine/eligibility/bulk': {
      const codes: string[] = body.course_codes ?? [];
      return {
        decisions: codes.map((code) => ({ ...decision(code, resolved), course_code: code })),
        planned_credits: Number(body.planned_credits ?? 0),
        load_decision: loadDecision(Number(body.planned_credits ?? 0)),
      };
    }
    case '/engine/plan':
      return makePlan(body);
    case '/engine/gpa/simulate': {
      const currentGpa = Number(body.student?.cgpa ?? 2);
      const projected = Math.min(4, Math.round((currentGpa + 0.1) * 100) / 100);
      const gpa = (cgpa: number) => ({
        sgpa: cgpa,
        cgpa,
        total_credits: 12,
        quality_points: Math.round(cgpa * 12 * 100) / 100,
        courses: [],
        repeat_cap_applied: [],
        classification: cgpa >= 3 ? 'very_good' : cgpa >= 2 ? 'good' : 'weak',
        flags: [],
      });
      return {
        current: gpa(currentGpa),
        projected: gpa(projected),
        simulated_courses: (body.simulated ?? []).length,
        repeat_cap_pct: 83,
        target_reachable:
          body.future_cgpa_target == null ? null : projected >= Number(body.future_cgpa_target),
        advisory_only: true,
      };
    }
    case '/engine/standing': {
      const student = body.student ?? {};
      return {
        term: body.term,
        sgpa: Number(student.cgpa ?? 2),
        cgpa: Number(student.cgpa ?? 2),
        passed_credits: Number(student.passed_credits ?? 0),
        level: Number(student.level ?? 1),
        warning_no: Number(student.warning_no ?? 0),
        consecutive_warnings: Number(student.consecutive_warnings ?? 0),
        total_warnings: Number(student.total_warnings ?? 0),
        probation: Number(student.cgpa ?? 2) < 2,
        dismissal_risk: Number(student.consecutive_warnings ?? 0) >= 4,
        final_chance: Number(student.consecutive_warnings ?? 0) >= 4,
        flags: [],
        article: '10',
        page: '20',
      };
    }
    case '/engine/graduation-audit':
      return {
        eligible: false,
        required_credits: 136,
        passed_credits: Number(body.student?.passed_credits ?? 0),
        remaining_credits: Math.max(0, 136 - Number(body.student?.passed_credits ?? 0)),
        remaining_courses: [],
        by_category: [],
        flags: [],
        article: '12',
        page: '24',
      };
    case '/engine/whatif':
      return {
        target_program: body.target_program,
        transferable_credits: 30,
        remaining_credits: 106,
        estimated_semesters: 4,
        flags: [],
        article: '3',
        page: '6',
      };
    case '/engine/early-warning':
      return {
        risk_level: 'medium',
        attendance_pct: null,
        flags: [],
        recommendations: [],
        article: '9',
        page: '18',
      };
    case '/engine/rag/ask':
      return ragAnswer(body);
    default:
      throw new Error(`unhandled fake engine path ${path}`);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorised(headers: http.IncomingHttpHeaders, payload: string): boolean {
  const token = String(headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (token !== process.env.ENGINE_SERVICE_TOKEN) return false;
  const secret = process.env.ENGINE_HMAC_SECRET ?? '';
  if (!secret) return true;
  const timestamp = String(headers['x-engine-timestamp'] ?? '');
  const signature = String(headers['x-engine-signature'] ?? '');
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0] ?? '';
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && path === '/health') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: 'ok',
        engine_version: 'test-engine-1.0.0',
        regulation_loaded: true,
        policy_chunks: 539,
        database: true,
      }),
    );
    return;
  }
  if (failuresRemaining > 0) {
    failuresRemaining -= 1;
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'simulated engine failure' }));
    return;
  }
  const payload = await readBody(req);
  if (!authorised(req.headers, payload)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ detail: 'invalid service token or signature' }));
    return;
  }
  let body: Record<string, any> = {};
  try {
    body = payload ? (JSON.parse(payload) as Record<string, any>) : {};
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ detail: 'invalid json' }));
    return;
  }
  calls.push({ path, body, headers: req.headers });
  try {
    const result = handle(path, body);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: error instanceof Error ? error.message : 'error' }));
  }
}

export const fakeEngine = {
  calls,
  start(): Promise<void> {
    if (server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        void requestHandler(req, res);
      });
      server.once('error', reject);
      server.listen(PORT, '127.0.0.1', () => resolve());
    });
  },
  stop(): Promise<void> {
    if (!server) return Promise.resolve();
    const current = server;
    server = null;
    return new Promise((resolve) => current.close(() => resolve()));
  },
  reset(): void {
    calls.length = 0;
    failuresRemaining = 0;
  },
  failNext(count = 1): void {
    failuresRemaining = count;
  },
  setFailures(count: number): void {
    failuresRemaining = count;
  },
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  },
};
