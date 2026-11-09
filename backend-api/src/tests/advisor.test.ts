import { createApp } from '../app';
import { many } from '../config/db';
import {
  ADVISOR1_EMAIL,
  ADVISOR2_EMAIL,
  auth,
  login,
  newAgent,
  STUDENT1_EMAIL,
  STUDENT3_EMAIL,
  studentByCode,
} from './helpers';

const app = createApp();

async function advisorSession(email = ADVISOR1_EMAIL) {
  const agent = newAgent(app);
  const session = await login(agent, email);
  return { agent, session };
}

async function studentCreatesPlan(email = STUDENT1_EMAIL) {
  const agent = newAgent(app);
  const session = await login(agent, email);
  const plan = (await auth(agent.post('/api/student/plans'), session).send({ maxCredits: 6 }).expect(201))
    .body.data;
  await auth(agent.post(`/api/student/plans/${plan.id}/submit`), session).expect(200);
  return plan;
}

describe('advisor workspace', () => {
  it('returns an advisor dashboard scoped to assigned students', async () => {
    const { agent, session } = await advisorSession();
    const response = await auth(agent.get('/api/advisor/dashboard'), session).expect(200);
    expect(response.body.data.students).toBe(3);
    expect(response.body.data.atRisk).toBeGreaterThanOrEqual(2);
    expect(response.body.data.officeHours.length).toBeGreaterThan(0);
  });

  it('lists only assigned students, supports search and pagination', async () => {
    const { agent, session } = await advisorSession();
    const list = await auth(agent.get('/api/advisor/students'), session).expect(200);
    expect(list.body.pagination.total).toBe(3);
    const codes = list.body.data.map((row: { student_code: string }) => row.student_code);
    expect(codes).not.toContain('26000002');

    const search = await auth(agent.get('/api/advisor/students?search=Youssef'), session).expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].student_code).toBe('26000003');

    const paged = await auth(agent.get('/api/advisor/students?limit=1&page=2'), session).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination.pages).toBe(3);
    await auth(agent.get('/api/advisor/students?limit=500'), session).expect(400);
  });

  it('exposes at-risk students with a risk level', async () => {
    const { agent, session } = await advisorSession();
    const response = await auth(agent.get('/api/advisor/at-risk'), session).expect(200);
    const codes = response.body.data.map((row: { student_code: string }) => row.student_code);
    expect(codes).toContain('26000005');
    for (const row of response.body.data) {
      expect(['low', 'medium', 'high', 'critical']).toContain(row.risk_level);
    }
  });

  it('returns a detailed student view with standing and history', async () => {
    const { agent, session } = await advisorSession();
    const student = await studentByCode('26000003');
    const response = await auth(agent.get(`/api/advisor/students/${student!.id}`), session).expect(200);
    expect(response.body.data.profile.student.program).toBe('AI');
    expect(Array.isArray(response.body.data.enrollments)).toBe(true);
    expect(response.body.data.latestStanding).not.toBeNull();
  });

  it('runs standing, eligibility, graduation and early-warning checks for a student', async () => {
    const { agent, session } = await advisorSession();
    const student = await studentByCode('26000003');
    const base = `/api/advisor/students/${student!.id}`;

    const standing = await auth(agent.get(`${base}/standing`), session).expect(200);
    expect(standing.body.data.cgpa).toBeCloseTo(1.95, 2);

    const eligibility = await auth(
      agent.get(`${base}/eligibility?courseCodes=CSB1101,INF4105`),
      session,
    ).expect(200);
    expect(eligibility.body.data.decisions).toHaveLength(2);
    expect(eligibility.body.data.decisions[1].status).toBe('REVIEW_REQUIRED');
    expect(eligibility.body.data.escalations.length).toBe(1);

    const graduation = await auth(agent.get(`${base}/graduation-audit`), session).expect(200);
    expect(graduation.body.data.required_credits).toBe(136);

    const warning = await auth(agent.get(`${base}/early-warning`), session).expect(200);
    expect(warning.body.data.risk_level).toBe('medium');
  });

  it('prevents an advisor from reading a student assigned to someone else', async () => {
    const { agent, session } = await advisorSession();
    const other = await studentByCode('26000002');
    await auth(agent.get(`/api/advisor/students/${other!.id}`), session).expect(403);
    await auth(agent.get(`/api/advisor/students/${other!.id}/standing`), session).expect(403);
    await auth(agent.get(`/api/advisor/students/${other!.id}/notes`), session).expect(403);
    await auth(agent.get('/api/advisor/students/not-a-uuid'), session).expect(400);
  });

  it('creates and lists advising notes with visibility rules', async () => {
    const { agent, session } = await advisorSession();
    const student = await studentByCode('26000001');
    await auth(agent.post(`/api/advisor/students/${student!.id}/notes`), session)
      .send({ note: 'Private note about electives', visibility: 'advisor_only' })
      .expect(201);
    await auth(agent.post(`/api/advisor/students/${student!.id}/notes`), session)
      .send({ note: 'Shared note for the student', visibility: 'student' })
      .expect(201);
    await auth(agent.post(`/api/advisor/students/${student!.id}/notes`), session)
      .send({ note: 'x', visibility: 'invalid' })
      .expect(400);

    const notes = await auth(agent.get(`/api/advisor/students/${student!.id}/notes`), session).expect(200);
    expect(notes.body.data).toHaveLength(2);

    const otherAdvisor = await advisorSession(ADVISOR2_EMAIL);
    const otherStudent = await studentByCode('26000002');
    await auth(
      otherAdvisor.agent.post(`/api/advisor/students/${otherStudent!.id}/notes`),
      otherAdvisor.session,
    )
      .send({ note: 'not allowed', visibility: 'student' })
      .expect(201);
    const isolated = await auth(agent.get(`/api/advisor/students/${student!.id}/notes`), session).expect(200);
    expect(
      isolated.body.data.every(
        (row: { advisor_name: string }) => row.advisor_name === 'Dr. Hoda Abdelrahman',
      ),
    ).toBe(true);
  });

  it('reviews only plans submitted to the assigned advisor', async () => {
    const plan = await studentCreatesPlan();
    const { agent, session } = await advisorSession();
    const list = await auth(agent.get('/api/advisor/plans?status=SUBMITTED'), session).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toContain(plan.id);

    const other = await advisorSession(ADVISOR2_EMAIL);
    await auth(other.agent.patch(`/api/advisor/plans/${plan.id}/review`), other.session)
      .send({ decision: 'APPROVED', feedback: 'Should not be allowed' })
      .expect(403);

    const reviewed = await auth(agent.patch(`/api/advisor/plans/${plan.id}/review`), session)
      .send({ decision: 'APPROVED', feedback: 'Looks reasonable for a draft.' })
      .expect(200);
    expect(reviewed.body.data.status).toBe('APPROVED');
    await auth(agent.patch(`/api/advisor/plans/${plan.id}/review`), session)
      .send({ decision: 'REJECTED', feedback: 'Cannot review twice.' })
      .expect(409);
    await auth(agent.patch(`/api/advisor/plans/${plan.id}/review`), session)
      .send({ decision: 'MAYBE', feedback: 'x' })
      .expect(400);
  });

  it('manages office hour slots and approves student requests', async () => {
    const { agent, session } = await advisorSession();
    const created = await auth(agent.post('/api/advisor/office-hours'), session)
      .send({ weekday: 3, startTime: '09:00', endTime: '10:00', location: 'Test Room A' })
      .expect(201);
    const slotId = created.body.data.id;
    await auth(agent.patch(`/api/advisor/office-hours/${slotId}`), session)
      .send({ location: 'Test Room B', active: true })
      .expect(200);

    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT1_EMAIL);
    const request = await auth(studentAgent.post('/api/student/office-hours/requests'), student)
      .send({ slotId, reason: 'Discuss plan' })
      .expect(201);

    const requests = await auth(agent.get('/api/advisor/office-hour-requests'), session).expect(200);
    expect(requests.body.data.map((row: { id: string }) => row.id)).toContain(request.body.data.id);
    const approved = await auth(
      agent.patch(`/api/advisor/office-hour-requests/${request.body.data.id}`),
      session,
    )
      .send({ status: 'approved' })
      .expect(200);
    expect(approved.body.data.status).toBe('approved');

    const other = await advisorSession(ADVISOR2_EMAIL);
    await auth(other.agent.patch(`/api/advisor/office-hour-requests/${request.body.data.id}`), other.session)
      .send({ status: 'rejected' })
      .expect(404);

    await auth(agent.delete(`/api/advisor/office-hours/${slotId}`), session).expect(204);
    const after = await auth(agent.get('/api/advisor/office-hours'), session).expect(200);
    const deleted = after.body.data.find((row: { id: string }) => row.id === slotId);
    expect(deleted.active).toBe(false);
  });

  it('lists and updates escalations belonging to assigned students', async () => {
    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT3_EMAIL);
    const decision = await auth(studentAgent.get('/api/student/eligibility/INF4105'), student).expect(200);
    const escalationId = decision.body.data.escalation.id;

    const { agent, session } = await advisorSession();
    const list = await auth(agent.get('/api/advisor/escalations?status=open'), session).expect(200);
    const row = list.body.data.find((item: { id: string }) => item.id === escalationId);
    expect(row).toBeDefined();
    expect(row.student_code).toBe('26000003');

    const updated = await auth(agent.patch(`/api/advisor/escalations/${escalationId}`), session)
      .send({ status: 'in_review', priority: 'critical' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ status: 'in_review', priority: 'critical' });

    const events = await many<{ event_type: string }>(
      'SELECT event_type FROM escalation_events WHERE escalation_id = $1 ORDER BY created_at',
      [escalationId],
    );
    expect(events.map((event) => event.event_type)).toEqual(['created', 'updated']);

    const other = await advisorSession(ADVISOR2_EMAIL);
    await auth(other.agent.patch(`/api/advisor/escalations/${escalationId}`), other.session)
      .send({ status: 'resolved', resolution: 'Not my student' })
      .expect(404);
  });

  it('rejects student and admin tokens from the advisor workspace', async () => {
    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT1_EMAIL);
    await auth(studentAgent.get('/api/advisor/dashboard'), student).expect(403);

    const adminAgent = newAgent(app);
    const admin = await login(adminAgent, 'admin@bua.edu.eg');
    await auth(adminAgent.get('/api/advisor/dashboard'), admin).expect(403);
  });
});
