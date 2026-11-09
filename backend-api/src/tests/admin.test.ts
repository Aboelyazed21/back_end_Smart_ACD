import request from 'supertest';
import { createApp } from '../app';
import { one } from '../config/db';
import {
  ADMIN_EMAIL,
  advisorByEmail,
  auth,
  departmentByCode,
  login,
  newAgent,
  STUDENT1_EMAIL,
} from './helpers';

const app = createApp();
const PASSWORD = 'Temporary!2026';

interface AdminContext {
  agent: ReturnType<typeof newAgent>;
  session: Awaited<ReturnType<typeof login>>;
}

async function adminContext(): Promise<AdminContext> {
  const agent = newAgent(app);
  const session = await login(agent, ADMIN_EMAIL);
  return { agent, session };
}

async function createStudentViaApi(ctx: AdminContext, suffix = '1') {
  const advisor = await advisorByEmail('advisor1@aidm.bua.edu.eg');
  const department = await departmentByCode('CS');
  const response = await auth(ctx.agent.post('/api/admin/users'), ctx.session)
    .send({
      email: `test-student-${suffix}@aidm.bua.edu.eg`,
      fullName: `Test Student ${suffix}`,
      role: 'student',
      password: PASSWORD,
      student: {
        studentCode: `2700000${suffix}`,
        program: 'CS',
        level: 1,
        advisorId: advisor!.id,
        departmentId: department!.id,
        admissionTerm: '2026-2027-fall',
        cgpa: 2.5,
        passedCredits: 10,
      },
    })
    .expect(201);
  return response.body.data.user;
}

describe('admin workspace', () => {
  it('lists users with filters and never exposes password hashes', async () => {
    const { agent, session } = await adminContext();
    const all = await auth(agent.get('/api/admin/users?limit=100'), session).expect(200);
    expect(all.body.pagination.total).toBeGreaterThanOrEqual(9);
    expect(all.body.data[0].password_hash).toBeUndefined();
    expect(JSON.stringify(all.body)).not.toContain('$argon2');

    const students = await auth(agent.get('/api/admin/users?role=student'), session).expect(200);
    expect(students.body.data.every((row: { role: string }) => row.role === 'student')).toBe(true);

    const search = await auth(agent.get('/api/admin/users?search=student1'), session).expect(200);
    expect(search.body.data).toHaveLength(1);

    await auth(agent.get('/api/admin/users?role=superuser'), session).expect(400);
  });

  it('creates students, advisors and admins with validated profiles', async () => {
    const ctx = await adminContext();
    const student = await createStudentViaApi(ctx);
    expect(student).toMatchObject({ email: 'test-student-1@aidm.bua.edu.eg', role: 'student' });
    expect(student.mustChangePassword).toBe(false);

    const advisor = await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-advisor@aidm.bua.edu.eg',
        fullName: 'Test Advisor',
        role: 'advisor',
        password: PASSWORD,
        advisor: { officeLocation: 'Room 1', maxStudents: 10 },
      })
      .expect(201);
    expect(advisor.body.data.user.role).toBe('advisor');

    await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-admin@bua.edu.eg',
        fullName: 'Test Admin',
        role: 'admin',
        password: PASSWORD,
      })
      .expect(201);

    await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-student-1@aidm.bua.edu.eg',
        fullName: 'Duplicate',
        role: 'student',
        password: PASSWORD,
        student: { studentCode: '27999999', program: 'CS' },
      })
      .expect(409);

    await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-outside@example.com',
        fullName: 'Outside Domain',
        role: 'student',
        password: PASSWORD,
        student: { studentCode: '27999998', program: 'CS' },
      })
      .expect(400);

    await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-noprofile@aidm.bua.edu.eg',
        fullName: 'No Profile',
        role: 'student',
        password: PASSWORD,
      })
      .expect(400);
    await auth(ctx.agent.post('/api/admin/users'), ctx.session)
      .send({
        email: 'test-noadvisor@aidm.bua.edu.eg',
        fullName: 'No Advisor',
        role: 'advisor',
        password: PASSWORD,
      })
      .expect(400);
  });

  it('updates users, blocks self-lockout and soft-deletes accounts', async () => {
    const ctx = await adminContext();
    const user = await createStudentViaApi(ctx, '2');
    const updated = await auth(ctx.agent.patch(`/api/admin/users/${user.id}`), ctx.session)
      .send({ fullName: 'Renamed Student', status: 'suspended' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ fullName: 'Renamed Student', status: 'suspended' });

    await auth(ctx.agent.patch(`/api/admin/users/${ctx.session.userId}`), ctx.session)
      .send({ status: 'inactive' })
      .expect(400);
    await auth(ctx.agent.delete(`/api/admin/users/${ctx.session.userId}`), ctx.session).expect(400);
    await auth(ctx.agent.patch('/api/admin/users/not-a-uuid'), ctx.session)
      .send({ fullName: 'x' })
      .expect(400);
    await auth(ctx.agent.patch(`/api/admin/users/${user.id}`), ctx.session)
      .send({})
      .expect(400);

    await auth(ctx.agent.delete(`/api/admin/users/${user.id}`), ctx.session).expect(204);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-student-2@aidm.bua.edu.eg', password: PASSWORD })
      .expect(401);
    await auth(ctx.agent.delete(`/api/admin/users/${user.id}`), ctx.session).expect(404);
  });

  it('resets a user password and forces a change on next login', async () => {
    const ctx = await adminContext();
    const user = await createStudentViaApi(ctx, '3');
    const response = await auth(
      ctx.agent.post(`/api/admin/users/${user.id}/reset-password`),
      ctx.session,
    ).expect(200);
    expect(response.body.data.message).toContain('temporary password');
    const row = await one<{ must_change_password: boolean }>(
      'SELECT must_change_password FROM users WHERE id = $1',
      [user.id],
    );
    expect(row?.must_change_password).toBe(true);
    await auth(ctx.agent.post('/api/admin/users/not-a-uuid/reset-password'), ctx.session).expect(400);
  });

  it('lists and updates advisors', async () => {
    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/advisors'), session).expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const advisor = await advisorByEmail('advisor1@aidm.bua.edu.eg');
    const updated = await auth(agent.patch(`/api/admin/advisors/${advisor!.id}`), session)
      .send({ officeLocation: 'Office CS-305', maxStudents: 75 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ office_location: 'Office CS-305', max_students: 75 });
    await auth(agent.patch('/api/admin/advisors/not-a-uuid'), session).send({ maxStudents: 10 }).expect(400);
    await auth(agent.patch(`/api/admin/advisors/${advisor!.id}`), session)
      .send({})
      .expect(400);
  });

  it('lists and updates students with validated references', async () => {
    const ctx = await adminContext();
    const created = await createStudentViaApi(ctx, '4');
    const student = await one<{ id: string }>('SELECT id FROM students WHERE user_id = $1', [created.id]);

    const list = await auth(ctx.agent.get('/api/admin/students?program=CS&level=1'), ctx.session).expect(200);
    expect(list.body.data.some((row: { student_code: string }) => row.student_code === '27000004')).toBe(
      true,
    );
    const atRisk = await auth(ctx.agent.get('/api/admin/students?atRisk=true'), ctx.session).expect(200);
    expect(atRisk.body.data.every((row: { current_cgpa: string }) => Number(row.current_cgpa) < 2)).toBe(
      true,
    );

    const detail = await auth(ctx.agent.get(`/api/admin/students/${student!.id}`), ctx.session).expect(200);
    expect(detail.body.data.student.student_code).toBe('27000004');

    const updated = await auth(ctx.agent.patch(`/api/admin/students/${student!.id}`), ctx.session)
      .send({ cgpa: 3.1, level: 2, passedCredits: 40 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ current_cgpa: '3.10', level: 2, passed_credits: 40 });

    await auth(ctx.agent.patch(`/api/admin/students/${student!.id}`), ctx.session)
      .send({ advisorId: '00000000-0000-4000-8000-000000000000' })
      .expect(400);
    await auth(ctx.agent.get('/api/admin/students/not-a-uuid'), ctx.session).expect(400);
    await auth(ctx.agent.get('/api/admin/students/00000000-0000-4000-8000-000000000000'), ctx.session).expect(
      404,
    );
  });

  it('manages departments', async () => {
    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/departments'), session).expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(4);
    const created = await auth(agent.post('/api/admin/departments'), session)
      .send({ code: 'ZZ', nameAr: 'قسم اختبار', nameEn: 'Test Department' })
      .expect(201);
    const updated = await auth(agent.patch(`/api/admin/departments/${created.body.data.id}`), session)
      .send({ nameEn: 'Renamed Department' })
      .expect(200);
    expect(updated.body.data.name_en).toBe('Renamed Department');
    await auth(agent.post('/api/admin/departments'), session)
      .send({ code: 'ZZ', nameAr: 'قسم', nameEn: 'Duplicate' })
      .expect(409);
    await auth(agent.post('/api/admin/departments'), session)
      .send({ code: 'lower', nameAr: 'x', nameEn: 'y' })
      .expect(400);
    await auth(agent.patch('/api/admin/departments/00000000-0000-4000-8000-000000000000'), session)
      .send({ nameEn: 'Missing' })
      .expect(404);
  });

  it('manages courses, prerequisites and offerings', async () => {
    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/courses?search=CSB'), session).expect(200);
    expect(list.body.pagination.total).toBeGreaterThan(0);

    const created = await auth(agent.post('/api/admin/courses'), session)
      .send({
        code: 'TST9999',
        nameAr: 'مقرر اختبار',
        nameEn: 'Test Course',
        credits: 3,
        category: 'college_basic_computing',
        levelHint: 1,
        termHint: 1,
        prerequisites: { allOf: ['CSB1101'], minPassedCreditHours: 0 },
        roles: { CS: 'elective' },
      })
      .expect(201);
    const courseId = created.body.data.id;

    const detail = await auth(agent.get(`/api/admin/courses/${courseId}`), session).expect(200);
    expect(detail.body.data.course.code).toBe('TST9999');
    expect(detail.body.data.prerequisites.length).toBeGreaterThanOrEqual(2);

    const patched = await auth(agent.patch(`/api/admin/courses/${courseId}`), session)
      .send({ nameEn: 'Renamed Test Course', credits: 4 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ name_en: 'Renamed Test Course', credits: 4 });

    const prereq = await auth(agent.post(`/api/admin/courses/${courseId}/prerequisites`), session)
      .send({ type: 'prerequisite', requiredCourseCode: 'CSB1201' })
      .expect(201);
    await auth(agent.post(`/api/admin/courses/${courseId}/prerequisites`), session)
      .send({ type: 'prerequisite', requiredCourseCode: 'ZZZ9999' })
      .expect(400);
    await auth(agent.post(`/api/admin/courses/${courseId}/prerequisites`), session)
      .send({ type: 'hours_required' })
      .expect(400);
    await auth(agent.delete(`/api/admin/prerequisites/${prereq.body.data.id}`), session).expect(204);

    const offering = await auth(agent.post(`/api/admin/courses/${courseId}/offerings`), session)
      .send({
        academicYear: '2030-2031',
        season: 'fall',
        capacity: 40,
        meetingTimes: [{ day: 'sun', start: '09:00', end: '10:30', room: 'Lab 1' }],
        exam: { date: '2031-01-10', start: '09:00', end: '11:00' },
      })
      .expect(201);
    const offeringId = offering.body.data.id;
    const updatedOffering = await auth(agent.patch(`/api/admin/offerings/${offeringId}`), session)
      .send({ capacity: 55, status: 'closed' })
      .expect(200);
    expect(updatedOffering.body.data).toMatchObject({ capacity: 55, status: 'closed' });
    await auth(agent.post(`/api/admin/courses/${courseId}/offerings`), session)
      .send({ academicYear: '2030-2031', season: 'fall' })
      .expect(409);
    await auth(agent.delete(`/api/admin/offerings/${offeringId}`), session).expect(204);

    await auth(agent.delete(`/api/admin/courses/${courseId}`), session).expect(204);
    await auth(agent.get(`/api/admin/courses/${courseId}`), session).expect(200);
    await auth(agent.post('/api/admin/courses'), session)
      .send({
        code: 'bad',
        nameAr: 'x',
        nameEn: 'y',
        credits: 3,
        category: 'test',
        levelHint: 1,
        termHint: 1,
      })
      .expect(400);
  });

  it('resolves a blocking anomaly, re-evaluates decisions and records an audit trail', async () => {
    const studentAgent = newAgent(app);
    const studentSession = await login(studentAgent, STUDENT1_EMAIL);
    const decision = await auth(studentAgent.get('/api/student/eligibility/INF4105'), studentSession).expect(
      200,
    );
    const escalationId = decision.body.data.escalation.id;

    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/anomalies?severity=blocking'), session).expect(200);
    expect(list.body.data.some((row: { id: string }) => row.id === 'A-CAT-09')).toBe(true);
    const detail = await auth(agent.get('/api/admin/anomalies/A-CAT-09'), session).expect(200);
    expect(detail.body.data.severity).toBe('blocking');
    expect(detail.body.data.status).toBe('open');

    const resolved = await auth(agent.patch('/api/admin/anomalies/A-CAT-09/resolve'), session)
      .send({
        resolvedValue: 'Prerequisite chain confirmed by the college council.',
        note: 'Council minute 12',
      })
      .expect(200);
    expect(resolved.body.data.anomaly.status).toBe('resolved');
    expect(resolved.body.data.reEvaluated).toBe(1);
    expect(resolved.body.data.autoResolved).toBe(1);

    const escalation = await one<{ status: string; resolution: string | null }>(
      'SELECT status, resolution FROM escalations WHERE id = $1',
      [escalationId],
    );
    expect(escalation?.status).toBe('resolved');
    expect(escalation?.resolution).toContain('now ELIGIBLE');

    const audit = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'ANOMALY_RESOLVED'`,
    );
    expect(Number(audit?.count)).toBe(1);
    const engineCall = [...fakeEngineCalls()].reverse().find((call) => call.path === '/engine/eligibility');
    expect((engineCall?.body.resolved_anomaly_ids as string[]) ?? []).toContain('A-CAT-09');

    await auth(agent.patch('/api/admin/anomalies/A-CAT-09/resolve'), session)
      .send({ resolvedValue: 'Again' })
      .expect(409);
    const reopened = await auth(agent.post('/api/admin/anomalies/A-CAT-09/reopen'), session)
      .send({ reason: 'Council appealed the resolution' })
      .expect(200);
    expect(reopened.body.data.status).toBe('open');
    await auth(agent.post('/api/admin/anomalies/A-CAT-09/reopen'), session)
      .send({ reason: 'Already open' })
      .expect(409);
    await auth(agent.patch('/api/admin/anomalies/A-CAT-XX/resolve'), session)
      .send({ resolvedValue: 'Invalid id' })
      .expect(400);
  });

  it('exposes the regulation rule index', async () => {
    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/regulation/rules'), session).expect(200);
    expect(list.body.pagination.total).toBe(25);
    const search = await auth(agent.get('/api/admin/regulation/rules?search=REG'), session).expect(200);
    expect(search.body.pagination.total).toBeGreaterThan(0);
    const first = list.body.data[0].rule_code;
    const detail = await auth(agent.get(`/api/admin/regulation/rules/${first}`), session).expect(200);
    expect(detail.body.data.rule_code).toBe(first);
    await auth(agent.get('/api/admin/regulation/rules/NOPE-999'), session).expect(404);
  });

  it('lists audit logs with filters', async () => {
    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/audit-logs?limit=5'), session).expect(200);
    expect(list.body.data.length).toBeLessThanOrEqual(5);
    expect(list.body.data[0]).toHaveProperty('action');
    const logins = await auth(agent.get('/api/admin/audit-logs?action=LOGIN_SUCCESS'), session).expect(200);
    expect(logins.body.data.every((row: { action: string }) => row.action === 'LOGIN_SUCCESS')).toBe(true);
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await auth(agent.get(`/api/admin/audit-logs?from=${encodeURIComponent(from)}`), session).expect(200);
    await auth(agent.get('/api/admin/audit-logs?from=not-a-date'), session).expect(400);
    await auth(agent.get('/api/admin/audit-logs?actorId=not-a-uuid'), session).expect(400);
  });

  it('lists escalations and assigns them to active staff only', async () => {
    const studentAgent = newAgent(app);
    const studentSession = await login(studentAgent, STUDENT1_EMAIL);
    const decision = await auth(studentAgent.get('/api/student/eligibility/INF4105'), studentSession).expect(
      200,
    );
    const escalationId = decision.body.data.escalation.id;

    const { agent, session } = await adminContext();
    const list = await auth(agent.get('/api/admin/escalations?status=open'), session).expect(200);
    expect(list.body.data.some((row: { id: string }) => row.id === escalationId)).toBe(true);

    const advisor = await advisorByEmail('advisor1@aidm.bua.edu.eg');
    const updated = await auth(agent.patch(`/api/admin/escalations/${escalationId}`), session)
      .send({ assignedTo: advisor!.user_id, priority: 'critical' })
      .expect(200);
    expect(updated.body.data.assigned_to).toBe(advisor!.user_id);
    const notification = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
        WHERE user_id = $1 AND type = 'escalation'`,
      [advisor!.user_id],
    );
    expect(Number(notification?.count)).toBeGreaterThan(0);

    await auth(agent.patch(`/api/admin/escalations/${escalationId}`), session)
      .send({ assignedTo: '00000000-0000-4000-8000-000000000000' })
      .expect(400);
    await auth(agent.patch('/api/admin/escalations/00000000-0000-4000-8000-000000000000'), session)
      .send({ status: 'resolved' })
      .expect(404);
  });

  it('returns analytics for the dashboard', async () => {
    const { agent, session } = await adminContext();
    const overview = await auth(agent.get('/api/admin/analytics/overview'), session).expect(200);
    expect(overview.body.data.students.count).toBeGreaterThanOrEqual(6);
    expect(overview.body.data.courses).toBeGreaterThanOrEqual(100);

    const bottlenecks = await auth(agent.get('/api/admin/analytics/bottlenecks?limit=5'), session).expect(
      200,
    );
    expect(bottlenecks.body.data.length).toBeLessThanOrEqual(5);
    await auth(agent.get('/api/admin/analytics/bottlenecks?limit=1000'), session).expect(400);

    await auth(agent.get('/api/admin/analytics/enrollments'), session).expect(200);
    await auth(agent.get('/api/admin/analytics/escalations'), session).expect(200);
    await auth(agent.get('/api/admin/analytics/plans'), session).expect(200);
  });

  it('imports students from CSV, reports row errors and records the job', async () => {
    const { agent, session } = await adminContext();
    const csv = [
      'email,full_name,student_code,program,level,cgpa,passed_credits',
      'test-import1@aidm.bua.edu.eg,Imported One,27000010,CS,1,2.8,12',
      'wrong@example.com,Imported Two,27000011,IT,2,2.2,20',
      'test-import1@aidm.bua.edu.eg,Duplicate,27000010,CS,1,2.8,12',
    ].join('\n');
    const response = await auth(agent.post('/api/admin/imports/students'), session)
      .attach('file', Buffer.from(csv), { filename: 'students.csv', contentType: 'text/csv' })
      .expect(202);
    expect(response.body.data).toMatchObject({
      status: 'completed',
      total_rows: 3,
      success_rows: 1,
      error_rows: 2,
    });

    const errors = await auth(
      agent.get(`/api/admin/imports/${response.body.data.id}/errors`),
      session,
    ).expect(200);
    expect(errors.body.data).toHaveLength(2);
    expect(errors.body.data[0].message).toContain('email must use');

    const jobs = await auth(agent.get('/api/admin/imports?type=students'), session).expect(200);
    expect(jobs.body.data.some((row: { id: string }) => row.id === response.body.data.id)).toBe(true);
    const job = await auth(agent.get(`/api/admin/imports/${response.body.data.id}`), session).expect(200);
    expect(job.body.data.type).toBe('students');

    await auth(agent.post('/api/admin/imports/students'), session)
      .attach('file', Buffer.from('email,full_name\nx@aidm.bua.edu.eg,X'), {
        filename: 'missing.csv',
        contentType: 'text/csv',
      })
      .expect(400);
    await auth(agent.post('/api/admin/imports/students'), session)
      .attach('file', Buffer.from('email,full_name\n'), {
        filename: 'students.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    await auth(agent.post('/api/admin/imports/students'), session)
      .attach('file', Buffer.from([0x65, 0x00, 0x66]), {
        filename: 'students.csv',
        contentType: 'text/csv',
      })
      .expect(400);
  });

  it('imports transcripts and recomputes official totals', async () => {
    const ctx = await adminContext();
    await createStudentViaApi(ctx, '5');
    const csv = [
      'student_code,course_code,academic_year,season,grade_letter',
      '27000005,CSB1101,2025-2026,fall,A',
      '27000005,NOTREAL,2025-2026,fall,A',
    ].join('\n');
    const response = await auth(ctx.agent.post('/api/admin/imports/transcripts'), ctx.session)
      .attach('file', Buffer.from(csv), { filename: 'transcripts.csv', contentType: 'text/csv' })
      .expect(202);
    expect(response.body.data).toMatchObject({ success_rows: 1, error_rows: 1 });

    const row = await one<{ grade_points: string; status: string }>(
      `SELECT e.grade_points, e.status FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
        WHERE s.student_code = '27000005' AND c.code = 'CSB1101'`,
    );
    expect(row?.status).toBe('passed');
    expect(Number(row?.grade_points)).toBeGreaterThan(0);

    const totals = await one<{ passed_credits: number; current_cgpa: string }>(
      `SELECT passed_credits, current_cgpa FROM students WHERE student_code = '27000005'`,
    );
    expect(totals?.passed_credits).toBeGreaterThanOrEqual(3);
    expect(Number(totals?.current_cgpa)).toBeGreaterThan(0);

    await auth(ctx.agent.get(`/api/admin/imports/${response.body.data.id}/errors`), ctx.session).expect(200);
    await auth(ctx.agent.get('/api/admin/imports/00000000-0000-4000-8000-000000000000'), ctx.session).expect(
      404,
    );
    await auth(
      ctx.agent.get('/api/admin/imports/00000000-0000-4000-8000-000000000000/errors'),
      ctx.session,
    ).expect(404);
  });

  it('rejects student and advisor tokens from the admin workspace', async () => {
    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT1_EMAIL);
    await auth(studentAgent.get('/api/admin/users'), student).expect(403);
    const advisorAgent = newAgent(app);
    const advisor = await login(advisorAgent, 'advisor1@aidm.bua.edu.eg');
    await auth(advisorAgent.get('/api/admin/analytics/overview'), advisor).expect(403);
  });
});

// Imported lazily to keep the helpers module free of test-only state.
import { fakeEngine } from './fakeEngine';

function fakeEngineCalls() {
  return fakeEngine.calls;
}
