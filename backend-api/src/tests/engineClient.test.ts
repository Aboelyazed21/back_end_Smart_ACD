import { AppError } from '../utils/errors';
import { engineClient, enginePost } from '../integrations/engineClient';
import { fakeEngine } from './fakeEngine';

describe('rule engine client', () => {
  beforeEach(() => {
    fakeEngine.reset();
    engineClient._internal.recordSuccess();
  });

  afterEach(() => {
    fakeEngine.reset();
    engineClient._internal.recordSuccess();
  });

  it('calls the engine with the service token and HMAC signature', async () => {
    const result = await engineClient.eligibility<{
      decision: { status: string; rule_code: string };
    }>({
      course_code: 'UNI1204',
      student: { id: 'test-student', program: 'CS', level: 1 },
      planned_credits: 3,
    });

    expect(result.decision).toMatchObject({
      status: 'ELIGIBLE',
      rule_code: 'REG-ELIG-01',
    });
    const call = fakeEngine.calls.at(-1)!;
    expect(call.path).toBe('/engine/eligibility');
    expect(call.headers.authorization).toBe(`Bearer ${process.env.ENGINE_SERVICE_TOKEN}`);
    expect(call.headers['x-engine-signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(call.headers['x-engine-timestamp']).toMatch(/^\d+$/);
    expect(call.headers['x-correlation-id']).toBeTruthy();
    expect(call.body).toMatchObject({ course_code: 'UNI1204' });
  });

  it('exposes the remaining typed engine operations', async () => {
    const plan = await engineClient.plan<{ status: string; advisory_only: boolean }>({
      student: { id: 'test-student', program: 'CS', completed: [], current: [] },
      offerings: [],
      term: { season: 'fall', academic_year: '2026-2027', week: 1, is_first_semester: false },
    });
    expect(plan).toMatchObject({ status: 'DRAFT', advisory_only: true });

    const bulk = await engineClient.bulkEligibility<{ decisions: unknown[] }>({
      course_codes: ['UNI1204'],
      student: { id: 'test-student' },
    });
    expect(bulk.decisions).toHaveLength(1);

    const gpa = await engineClient.gpaSimulate<{ simulated_courses: number }>({
      student: { cgpa: 2.5 },
      simulated: [{ courseCode: 'UNI1204' }],
    });
    expect(gpa.simulated_courses).toBe(1);

    const standing = await engineClient.standing<{ term: unknown }>({
      student: { cgpa: 2.5 },
      term: { season: 'fall' },
    });
    expect(standing.term).toBeDefined();

    const graduation = await engineClient.graduationAudit<{ required_credits: number }>({
      student: { passed_credits: 100 },
    });
    expect(graduation.required_credits).toBe(136);

    const whatIf = await engineClient.whatIf<{ transferable_credits: number }>({
      student: { id: 'test-student' },
      target_program: 'IT',
    });
    expect(whatIf.transferable_credits).toBe(30);

    const warning = await engineClient.earlyWarning<{ risk_level: string }>({
      student: { id: 'test-student' },
    });
    expect(warning.risk_level).toBe('medium');

    const answer = await engineClient.ask<{ citations: unknown[]; confidence: number }>({
      question: 'What is the maximum credit load?',
    });
    expect(answer.confidence).toBeGreaterThan(0.5);
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  it('retries a transient failure before giving up', async () => {
    fakeEngine.failNext(1);
    const result = await enginePost<{ decision: { status: string } }>('/engine/eligibility', {
      course_code: 'CSB1101',
      student: { id: 'test-student' },
    });
    expect(result.decision.status).toBe('ELIGIBLE');
    expect(fakeEngine.calls.filter((call) => call.path === '/engine/eligibility')).toHaveLength(1);
  });

  it('maps persistent engine failures to a safe 503 without internals', async () => {
    fakeEngine.failNext(3);
    await expect(enginePost('/engine/eligibility', { course_code: 'CSB1101' })).rejects.toMatchObject({
      status: 503,
      code: 'ENGINE_UNAVAILABLE',
      expose: false,
    });
    fakeEngine.failNext(3);
    const error = await enginePost('/engine/plan', { student: {} }).catch((value) => value);
    expect(error).toBeInstanceOf(AppError);
    expect((error as Error).message).not.toMatch(/engine_http_|simulated|stack/i);
  });

  it('opens the circuit after repeated failures and recovers on success', async () => {
    for (let i = 0; i < 5; i += 1) engineClient._internal.recordFailure();
    fakeEngine.reset();

    await expect(enginePost('/engine/eligibility', {})).rejects.toMatchObject({
      status: 503,
      code: 'ENGINE_UNAVAILABLE',
    });
    expect(fakeEngine.calls).toHaveLength(0);

    engineClient._internal.recordSuccess();
    const healthy = await enginePost<{ decision: { status: string } }>('/engine/eligibility', {
      course_code: 'CSB1101',
    });
    expect(healthy.decision.status).toBe('ELIGIBLE');
  });

  it('reports engine health and degrades to null when unavailable', async () => {
    const health = await engineClient.health();
    expect(health).toMatchObject({ status: 'ok', regulation_loaded: true });

    const spy = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('connection refused'));
    try {
      expect(await engineClient.health()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
