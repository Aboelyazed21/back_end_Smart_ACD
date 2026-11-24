import { createApp } from '../app';
import { one } from '../config/db';
import { ADMIN_EMAIL, auth, login, newAgent, STUDENT1_EMAIL } from './helpers';

const app = createApp();

async function adminContext() {
  const agent = newAgent(app);
  const session = await login(agent, ADMIN_EMAIL);
  return { agent, session };
}

describe('advisor provisioning by email', () => {
  it('creates a regular advisor account and its advisor profile', async () => {
    const ctx = await adminContext();
    const response = await auth(ctx.agent.post('/api/admin/advisors'), ctx.session)
      .send({
        email: 'test-advisor-new@bua.edu.eg',
        fullName: 'Test Advisor New',
        officeLocation: 'Test Office 1',
      })
      .expect(201);

    expect(response.body.data.user.role).toBe('advisor');
    expect(response.body.data.advisor.email).toBe('test-advisor-new@bua.edu.eg');
    expect(response.body.data.advisor.office_location).toBe('Test Office 1');

    const row = await one<{ role: string; must_change_password: boolean }>(
      'SELECT role, must_change_password FROM users WHERE email = $1',
      ['test-advisor-new@bua.edu.eg'],
    );
    expect(row?.role).toBe('advisor');
    expect(row?.must_change_password).toBe(true);

    await auth(ctx.agent.post('/api/admin/advisors'), ctx.session)
      .send({ email: 'test-advisor-new@bua.edu.eg' })
      .expect(409);
  });

  it('rejects a malformed email and a student token', async () => {
    const ctx = await adminContext();
    await auth(ctx.agent.post('/api/admin/advisors'), ctx.session)
      .send({ email: 'not-an-email' })
      .expect(400);

    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT1_EMAIL);
    await auth(studentAgent.post('/api/admin/advisors'), student)
      .send({ email: 'test-nope@bua.edu.eg' })
      .expect(403);
  });
});

describe('admin announcements', () => {
  it('delivers an in-app announcement to the audience and logs it', async () => {
    const ctx = await adminContext();
    const response = await auth(ctx.agent.post('/api/admin/notifications/broadcast'), ctx.session)
      .send({
        audience: 'students',
        title: 'Test announcement',
        body: 'Registration for the next term opens soon.',
      })
      .expect(201);

    expect(response.body.data.recipients).toBeGreaterThan(0);

    const studentAgent = newAgent(app);
    const student = await login(studentAgent, STUDENT1_EMAIL);
    const list = await auth(studentAgent.get('/api/student/notifications'), student).expect(200);
    expect(
      list.body.data.some(
        (notification: { type: string; title: string }) =>
          notification.type === 'announcement' && notification.title === 'Test announcement',
      ),
    ).toBe(true);

    const history = await auth(ctx.agent.get('/api/admin/notifications/broadcasts'), ctx.session).expect(200);
    expect(history.body.data[0].recipients).toBeGreaterThan(0);

    const audit = await one<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action = 'ANNOUNCEMENT_SENT' LIMIT 1`,
    );
    expect(audit?.action).toBe('ANNOUNCEMENT_SENT');
  });

  it('validates the audience', async () => {
    const ctx = await adminContext();
    await auth(ctx.agent.post('/api/admin/notifications/broadcast'), ctx.session)
      .send({ audience: 'everyone', title: 'Hi', body: 'Body' })
      .expect(400);
  });
});

describe('audit log export', () => {
  it('exports CSV that starts with a UTF-8 BOM and the header row', async () => {
    const ctx = await adminContext();
    const response = await auth(
      ctx.agent.get('/api/admin/audit-logs/export?action=LOGIN_SUCCESS'),
      ctx.session,
    ).expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.text.startsWith('\uFEFFcreated_at,')).toBe(true);
  });

  it('rejects an invalid date filter', async () => {
    const ctx = await adminContext();
    await auth(ctx.agent.get('/api/admin/audit-logs/export?from=not-a-date'), ctx.session).expect(400);
  });
});

describe('student self-service', () => {
  it('updates contact details and records the change', async () => {
    const agent = newAgent(app);
    const session = await login(agent, STUDENT1_EMAIL);
    const response = await auth(agent.patch('/api/student/profile'), session)
      .send({ fullName: 'Student One Updated', phone: '01000000000' })
      .expect(200);

    expect(response.body.data.student.fullName).toBe('Student One Updated');
    expect(response.body.data.student.phone).toBe('01000000000');

    const audit = await one<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action = 'PROFILE_UPDATED' LIMIT 1`,
    );
    expect(audit?.action).toBe('PROFILE_UPDATED');

    // Restore the seeded name so later suites still see the demo data.
    await auth(agent.patch('/api/student/profile'), session)
      .send({ fullName: 'Student One', phone: null })
      .expect(200);
  });

  it('cannot change identity fields through the profile endpoint', async () => {
    const agent = newAgent(app);
    const session = await login(agent, STUDENT1_EMAIL);
    await auth(agent.patch('/api/student/profile'), session)
      .send({ email: 'someone-else@aidm.bua.edu.eg' })
      .expect(400);
  });

  it('cancels a pending office-hour request exactly once', async () => {
    const agent = newAgent(app);
    const session = await login(agent, STUDENT1_EMAIL);
    const slot = await one<{ id: string }>(
      `SELECT s.id FROM office_hour_slots s
         JOIN students st ON st.advisor_id = s.advisor_id
         JOIN users u ON u.id = st.user_id
        WHERE u.email = $1 AND s.active
        ORDER BY s.weekday, s.start_time LIMIT 1`,
      [STUDENT1_EMAIL],
    );
    expect(slot).toBeTruthy();

    const created = await auth(agent.post('/api/student/office-hours/requests'), session)
      .send({ slotId: slot!.id, reason: 'Test request' })
      .expect(201);

    await auth(
      agent.patch(`/api/student/office-hours/requests/${created.body.data.id}/cancel`),
      session,
    ).expect(200);
    await auth(
      agent.patch(`/api/student/office-hours/requests/${created.body.data.id}/cancel`),
      session,
    ).expect(404);
  });
});
