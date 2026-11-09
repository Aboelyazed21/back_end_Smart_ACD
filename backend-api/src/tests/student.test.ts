import { createApp } from '../app';
import { many, one, query } from '../config/db';
import { auth, login, newAgent, STUDENT1_EMAIL, STUDENT2_EMAIL, STUDENT3_EMAIL } from './helpers';

const app = createApp();

async function studentSession(email = STUDENT1_EMAIL) {
  const agent = newAgent(app);
  const session = await login(agent, email);
  const student = await one<{ id: string }>(
    'SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = $1',
    [email],
  );
  return { agent, session, studentId: student!.id };
}

describe('student workspace', () => {
  it('returns the profile, dashboard and transcript', async () => {
    const { agent, session } = await studentSession();
    const profile = await auth(agent.get('/api/student/profile'), session).expect(200);
    expect(profile.body.data.student).toMatchObject({
      studentCode: '26000001',
      program: 'CS',
      level: 1,
    });
    expect(profile.body.data.advisor.email).toBe('advisor1@aidm.bua.edu.eg');

    const dashboard = await auth(agent.get('/api/student/dashboard'), session).expect(200);
    expect(dashboard.body.data.term.value).toBe('2026-2027-fall');
    expect(dashboard.body.data.advisoryOnly).toBe(true);
    expect(dashboard.body.data.graduation.requiredCredits).toBe(136);

    const enrollments = await auth(agent.get('/api/student/enrollments'), session).expect(200);
    expect(Array.isArray(enrollments.body.data)).toBe(true);
    expect(enrollments.body.data.length).toBeGreaterThan(0);
    expect(enrollments.body.data[0]).toHaveProperty('courseCode');
  });

  it('returns recommended plans and program elective pools', async () => {
    const { agent, session } = await studentSession();
    const recommended = await auth(agent.get('/api/student/recommended-plan?level=1'), session).expect(200);
    expect(recommended.body.data.slot).toBe('1-1');
    expect(recommended.body.data.items.length).toBeGreaterThan(0);

    const program = await auth(agent.get('/api/student/courses'), session).expect(200);
    expect(program.body.data.program).toBe('CS');
    expect(program.body.data.pools.length).toBeGreaterThan(0);
  });

  it('evaluates a single course and persists the decision with its citation', async () => {
    const { agent, session, studentId } = await studentSession();
    const response = await auth(
      agent.get('/api/student/eligibility/UNI1204?term=2026-2027-fall'),
      session,
    ).expect(200);
    expect(response.body.data.decision).toMatchObject({
      status: 'ELIGIBLE',
      rule_code: 'REG-ELIG-01',
      article: '5',
      page: '12',
      anomaly_ids: ['A-REG-05'],
    });
    expect(response.body.data.decision.flags).toContain('ANOMALY_A_REG_05');
    expect(response.body.data.advisoryOnly).toBe(true);

    const persisted = await one<{ status: string; rule_code: string; anomaly_ids: unknown }>(
      `SELECT status, rule_code, anomaly_ids FROM eligibility_checks
        WHERE student_id = $1 AND course_code = 'UNI1204' ORDER BY created_at DESC LIMIT 1`,
      [studentId],
    );
    expect(persisted?.status).toBe('ELIGIBLE');
    expect(persisted?.rule_code).toBe('REG-ELIG-01');
    expect(persisted?.anomaly_ids).toEqual(['A-REG-05']);
  });

  it('reports reasons and anomalies for a not-eligible course', async () => {
    const { agent, session } = await studentSession();
    const response = await auth(agent.get('/api/student/eligibility/CSB2101'), session).expect(200);
    expect(response.body.data.decision).toMatchObject({
      status: 'NOT_ELIGIBLE',
      rule_code: 'REG-PREREQ-01',
      anomaly_ids: [],
    });
    expect(response.body.data.escalation).toBeNull();
  });

  it('escalates blocking anomalies exactly once per course', async () => {
    const { agent, session, studentId } = await studentSession();
    const first = await auth(agent.get('/api/student/eligibility/INF4105'), session).expect(200);
    const second = await auth(agent.get('/api/student/eligibility/INF4105'), session).expect(200);
    expect(first.body.data.decision.status).toBe('REVIEW_REQUIRED');
    expect(first.body.data.decision.anomaly_ids).toEqual(['A-CAT-09']);
    expect(first.body.data.escalation.id).toBe(second.body.data.escalation.id);
    expect(first.body.data.escalation.ticket_no).toMatch(/^ESC-\d{8}-[A-F0-9]{8}$/);

    const cases = await many<{ id: string }>(
      'SELECT id FROM escalations WHERE student_id = $1 AND related_course_code = $2',
      [studentId, 'INF4105'],
    );
    expect(cases).toHaveLength(1);
    const events = await one<{ count: string }>(
      'SELECT count(*)::text AS count FROM escalation_events WHERE escalation_id = $1',
      [cases[0]!.id],
    );
    expect(Number(events?.count)).toBe(1);
  });

  it('bulk-evaluates explicit courses and the default candidate list', async () => {
    const { agent, session } = await studentSession();
    const explicit = await auth(
      agent.get('/api/student/eligibility?courseCodes=CSB1101,CSB2101,UNI1204'),
      session,
    ).expect(200);
    expect(explicit.body.data.decisions).toHaveLength(3);
    expect(explicit.body.data.decisions.map((d: { status: string }) => d.status)).toEqual([
      'ELIGIBLE',
      'NOT_ELIGIBLE',
      'ELIGIBLE',
    ]);
    expect(explicit.body.data.loadDecision.rule_code).toBe('REG-LOAD-01');

    const automatic = await auth(agent.get('/api/student/eligibility'), session).expect(200);
    expect(automatic.body.data.decisions.length).toBeGreaterThan(0);
  });

  it('rejects invalid course codes, terms and planned credits', async () => {
    const { agent, session } = await studentSession();
    await auth(agent.get('/api/student/eligibility/not-a-code'), session).expect(400);
    await auth(agent.get('/api/student/eligibility?term=summer-1999'), session).expect(400);
    await auth(agent.get('/api/student/eligibility?plannedCredits=99'), session).expect(400);
  });

  it('returns standing, early warning and graduation audits', async () => {
    const { agent, session, studentId } = await studentSession();
    const standing = await auth(agent.get('/api/student/standing'), session).expect(200);
    expect(standing.body.data).toMatchObject({ cgpa: expect.any(Number) });
    const stored = await one<{ count: string }>(
      'SELECT count(*)::text AS count FROM academic_standing WHERE student_id = $1',
      [studentId],
    );
    expect(Number(stored?.count)).toBeGreaterThan(0);

    const warning = await auth(agent.get('/api/student/early-warning'), session).expect(200);
    expect(warning.body.data.risk_level).toBe('medium');

    const graduation = await auth(agent.get('/api/student/graduation-audit'), session).expect(200);
    expect(graduation.body.data.required_credits).toBe(136);
    expect(graduation.body.data.eligible).toBe(false);
  });

  it('simulates GPA and evaluates a major switch', async () => {
    const { agent, session } = await studentSession();
    const simulate = await auth(agent.post('/api/student/gpa/simulate'), session)
      .send({
        term: '2026-2027-fall',
        simulated: [{ courseCode: 'CSB1101', percentage: 88 }],
        futureCgpaTarget: 3,
      })
      .expect(200);
    expect(simulate.body.data.advisory_only).toBe(true);
    expect(simulate.body.data.simulated_courses).toBe(1);

    await auth(agent.post('/api/student/gpa/simulate'), session)
      .send({ simulated: [{ courseCode: 'TST9999', percentage: 80 }] })
      .expect(400);
    await auth(agent.post('/api/student/gpa/simulate'), session)
      .send({ simulated: [{ courseCode: 'CSB1101' }] })
      .expect(400);

    const whatif = await auth(agent.post('/api/student/whatif/major-switch'), session)
      .send({ targetProgram: 'DS' })
      .expect(200);
    expect(whatif.body.data.target_program).toBe('DS');
  });

  it('creates, lists, reads and submits a draft plan without exceeding the cap', async () => {
    const { agent, session } = await studentSession();
    const created = await auth(agent.post('/api/student/plans'), session)
      .send({ term: '2026-2027-fall', maxCredits: 6, planningSlot: '1-1' })
      .expect(201);
    const plan = created.body.data;
    expect(plan.status).toBe('DRAFT');
    expect(plan.advisory_only).toBe(true);
    expect(plan.total_credits).toBeLessThanOrEqual(6);
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) {
      expect(item.decision.status).toBe('ELIGIBLE');
    }
    const dbPlan = await one<{ status: string; total_credits: number }>(
      'SELECT status, total_credits FROM study_plans WHERE id = $1',
      [plan.id],
    );
    expect(dbPlan).toMatchObject({ status: 'DRAFT', total_credits: plan.total_credits });

    const list = await auth(agent.get('/api/student/plans'), session).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toContain(plan.id);

    const detail = await auth(agent.get(`/api/student/plans/${plan.id}`), session).expect(200);
    expect(detail.body.data.plan.id).toBe(plan.id);
    expect(detail.body.data.plan.notes).toContain('Never a registration');

    const submitted = await auth(agent.post(`/api/student/plans/${plan.id}/submit`), session).expect(200);
    expect(submitted.body.data.status).toBe('SUBMITTED');
    await auth(agent.post(`/api/student/plans/${plan.id}/submit`), session).expect(409);
  });

  it('prevents students from reading another student plan', async () => {
    const owner = await studentSession();
    const plan = (
      await auth(owner.agent.post('/api/student/plans'), owner.session).send({ maxCredits: 3 }).expect(201)
    ).body.data;
    const other = await studentSession(STUDENT2_EMAIL);
    await auth(other.agent.get(`/api/student/plans/${plan.id}`), other.session).expect(404);
    await auth(other.agent.get(`/api/student/plans/${plan.id}/export`), other.session).expect(404);
  });

  it('exports a signed PDF and records the export', async () => {
    const { agent, session } = await studentSession();
    const plan = (await auth(agent.post('/api/student/plans'), session).send({ maxCredits: 6 }).expect(201))
      .body.data;
    const response = await auth(agent.get(`/api/student/plans/${plan.id}/export`), session)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const audit = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'PLAN_EXPORTED'`,
    );
    expect(Number(audit?.count)).toBe(1);
  });

  it('shows the assigned advisor and manages office hour requests', async () => {
    const { agent, session } = await studentSession();
    const advisor = await auth(agent.get('/api/student/advisor'), session).expect(200);
    expect(advisor.body.data.advisor.email).toBe('advisor1@aidm.bua.edu.eg');
    expect(advisor.body.data.officeHours.length).toBeGreaterThan(0);

    const slotId = advisor.body.data.officeHours[0].id;
    await auth(agent.post('/api/student/office-hours/requests'), session)
      .send({ slotId, reason: 'Need advice on electives' })
      .expect(201);
    await auth(agent.post('/api/student/office-hours/requests'), session).send({ slotId }).expect(409);
    const list = await auth(agent.get('/api/student/office-hours/requests'), session).expect(200);
    expect(list.body.data[0].status).toBe('pending');

    const otherSlot = await one<{ id: string }>(
      `SELECT s.id FROM office_hour_slots s JOIN advisors a ON a.id = s.advisor_id
         JOIN users u ON u.id = a.user_id WHERE u.email = 'advisor2@aidm.bua.edu.eg' LIMIT 1`,
    );
    await auth(agent.post('/api/student/office-hours/requests'), session)
      .send({ slotId: otherSlot!.id })
      .expect(403);
  });

  it('lists, filters and marks notifications as read', async () => {
    const { agent, session, studentId } = await studentSession();
    const user = await one<{ user_id: string }>('SELECT user_id FROM students WHERE id = $1', [studentId]);
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1', [user!.user_id]);
    for (const title of ['First notice', 'Second notice']) {
      await query(`INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'test',$2,'body')`, [
        user!.user_id,
        title,
      ]);
    }
    const unread = await auth(agent.get('/api/student/notifications?unread=true'), session).expect(200);
    expect(unread.body.pagination.total).toBe(2);
    const id = unread.body.data[0].id;
    await auth(agent.patch(`/api/student/notifications/${id}/read`), session).expect(204);
    await auth(agent.patch(`/api/student/notifications/${id}/read`), session).expect(404);
    const all = await auth(agent.post('/api/student/notifications/read-all'), session).expect(200);
    expect(all.body.data.updated).toBe(1);
    await auth(agent.get('/api/student/notifications?page=not-a-number'), session).expect(400);
  });

  it('rejects access from other roles', async () => {
    const advisorAgent = newAgent(app);
    const advisor = await login(advisorAgent, 'advisor1@aidm.bua.edu.eg');
    await auth(advisorAgent.get('/api/student/profile'), advisor).expect(403);
  });

  it('reports the review-required decision for a probation student', async () => {
    const { agent, session } = await studentSession(STUDENT3_EMAIL);
    const response = await auth(agent.get('/api/student/eligibility/INF4105'), session).expect(200);
    expect(response.body.data.decision.status).toBe('REVIEW_REQUIRED');
    const cases = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM escalations e
         JOIN students s ON s.id = e.student_id
         JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
      [STUDENT3_EMAIL],
    );
    expect(Number(cases?.count)).toBe(1);
  });
});
