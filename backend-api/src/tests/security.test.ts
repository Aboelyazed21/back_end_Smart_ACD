import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../app';
import { many, one, query } from '../config/db';
import { ADMIN_EMAIL, auth, login, newAgent, STUDENT1_EMAIL, STUDENT2_EMAIL, studentByCode } from './helpers';

const app = createApp();
const PASSWORD = 'ChangeMe!2026';

function appRoleUrl(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = 'smart_advisor_app';
  url.password = process.env.DB_APP_PASSWORD ?? 'dev_app_password_change_me';
  return url.toString();
}

async function studentSession(email: string) {
  const agent = newAgent(app);
  const session = await login(agent, email);
  const student = await one<{ id: string }>(
    'SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = $1',
    [email],
  );
  return { agent, session, studentId: student!.id };
}

async function advisorSession(email = 'advisor1@aidm.bua.edu.eg') {
  const agent = newAgent(app);
  const session = await login(agent, email);
  return { agent, session };
}

async function adminSession() {
  const agent = newAgent(app);
  const session = await login(agent, ADMIN_EMAIL);
  return { agent, session };
}

describe('security', () => {
  describe('RBAC matrix', () => {
    const protectedGets = [
      '/api/student/profile',
      '/api/advisor/dashboard',
      '/api/admin/users',
      '/api/chat/sessions',
      '/api/auth/me',
    ];

    it('rejects anonymous requests with 401', async () => {
      for (const path of protectedGets) {
        await request(app).get(path).expect(401);
      }
      // CSRF is checked before authentication, so an anonymous write is refused either way.
      await request(app).post('/api/student/plans').send({ term: '2026-2027-fall' }).expect(403);
    });

    it('prevents each role from crossing into another workspace', async () => {
      const student = await studentSession(STUDENT1_EMAIL);
      const advisor = await advisorSession();
      const admin = await adminSession();

      for (const path of ['/api/advisor/dashboard', '/api/admin/users', '/api/admin/audit-logs']) {
        await auth(student.agent.get(path), student.session).expect(403);
      }
      for (const path of ['/api/student/profile', '/api/admin/users']) {
        await auth(advisor.agent.get(path), advisor.session).expect(403);
      }
      for (const path of ['/api/student/profile', '/api/advisor/dashboard']) {
        await auth(admin.agent.get(path), admin.session).expect(403);
      }
      // Chat is intentionally shared by all roles (the floating assistant).
      await auth(advisor.agent.get('/api/chat/sessions'), advisor.session).expect(200);
      await auth(admin.agent.get('/api/chat/sessions'), admin.session).expect(200);
    });

    it('requires a Bearer scheme and rejects unknown users', async () => {
      const student = await studentSession(STUDENT1_EMAIL);
      await request(app)
        .get('/api/student/profile')
        .set('authorization', student.session.accessToken)
        .expect(401);

      const ghost = jwt.sign(
        { email: 'ghost@aidm.bua.edu.eg', role: 'student', mcp: false },
        process.env.JWT_ACCESS_SECRET!,
        {
          subject: '00000000-0000-4000-8000-000000000000',
          jwtid: 'ghost',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
          expiresIn: 600,
        },
      );
      await request(app).get('/api/student/profile').set('authorization', `Bearer ${ghost}`).expect(401);
    });
  });

  describe('object-level authorisation', () => {
    it('keeps study plans private to the owning student', async () => {
      const owner = await studentSession(STUDENT2_EMAIL);
      const intruder = await studentSession(STUDENT1_EMAIL);
      const created = await auth(
        owner.agent.post('/api/student/plans').send({ term: '2026-2027-fall', maxCredits: 12 }),
        owner.session,
      ).expect(201);
      const planId = created.body.data.id as string;

      await auth(intruder.agent.get(`/api/student/plans/${planId}`), intruder.session).expect(404);
      await auth(intruder.agent.post(`/api/student/plans/${planId}/submit`), intruder.session).expect(404);
      await auth(intruder.agent.get(`/api/student/plans/${planId}/export`), intruder.session).expect(404);
    });

    it('limits advisors to their assigned students', async () => {
      const advisor = await advisorSession();
      const mine = await studentByCode('26000001');
      const theirs = await studentByCode('26000002');

      const ok = await auth(advisor.agent.get(`/api/advisor/students/${mine!.id}`), advisor.session).expect(
        200,
      );
      expect(ok.body.data.profile.student.studentCode).toBe('26000001');

      await auth(advisor.agent.get(`/api/advisor/students/${theirs!.id}`), advisor.session).expect(403);
      await auth(
        advisor.agent.post(`/api/advisor/students/${theirs!.id}/notes`).send({ note: 'Hello' }),
        advisor.session,
      ).expect(403);
      await auth(advisor.agent.get('/api/advisor/students?search=26000002'), advisor.session).expect(200);
    });

    it("prevents reviewing another advisor's plan", async () => {
      const owner = await studentSession(STUDENT2_EMAIL);
      const created = await auth(
        owner.agent.post('/api/student/plans').send({ term: '2026-2027-fall', maxCredits: 12 }),
        owner.session,
      ).expect(201);
      const planId = created.body.data.id as string;
      await auth(owner.agent.post(`/api/student/plans/${planId}/submit`), owner.session).expect(200);

      const otherAdvisor = await advisorSession();
      await auth(
        otherAdvisor.agent
          .patch(`/api/advisor/plans/${planId}/review`)
          .send({ decision: 'APPROVED', feedback: 'Looks good' }),
        otherAdvisor.session,
      ).expect(403);
      const ownAdvisor = await advisorSession('advisor2@aidm.bua.edu.eg');
      await auth(
        ownAdvisor.agent
          .patch(`/api/advisor/plans/${planId}/review`)
          .send({ decision: 'APPROVED', feedback: 'Looks good' }),
        ownAdvisor.session,
      ).expect(200);
    });

    it('does not expose refresh sessions belonging to other users', async () => {
      const admin = await adminSession();
      await login(newAgent(app), STUDENT1_EMAIL);
      const foreign = await one<{ id: string }>(
        `SELECT r.id FROM refresh_tokens r JOIN users u ON u.id = r.user_id
          WHERE u.email = $1 ORDER BY r.created_at DESC LIMIT 1`,
        [STUDENT1_EMAIL],
      );
      await auth(admin.agent.delete(`/api/auth/sessions/${foreign!.id}`), admin.session).expect(404);
    });
  });

  describe('CSRF protection', () => {
    it('rejects state-changing requests without a matching double-submit token', async () => {
      const agent = newAgent(app);
      const session = await login(agent, STUDENT1_EMAIL);

      await agent
        .post('/api/student/plans')
        .set('authorization', `Bearer ${session.accessToken}`)
        .send({ term: '2026-2027-fall' })
        .expect(403);

      await agent
        .post('/api/student/plans')
        .set('authorization', `Bearer ${session.accessToken}`)
        .set('x-csrf-token', 'x'.repeat(64))
        .send({ term: '2026-2027-fall' })
        .expect(403);

      await request(app)
        .post('/api/student/plans')
        .set('authorization', `Bearer ${session.accessToken}`)
        .set('x-csrf-token', session.csrfToken)
        .send({ term: '2026-2027-fall' })
        .expect(403);

      await auth(
        agent.post('/api/student/plans').send({ term: '2026-2027-fall', maxCredits: 12 }),
        session,
      ).expect(201);
    });

    it('keeps safe reads and credentialed login available', async () => {
      const agent = newAgent(app);
      const session = await login(agent, STUDENT1_EMAIL);
      await auth(agent.get('/api/student/dashboard'), session).expect(200);
      await request(app)
        .post('/api/auth/login')
        .send({ email: STUDENT1_EMAIL, password: PASSWORD })
        .expect(200);
    });
  });

  describe('JWT handling', () => {
    it('rejects unsigned, wrongly signed, and expired tokens', async () => {
      const student = await studentByCode('26000001');
      const claims = {
        email: STUDENT1_EMAIL,
        role: 'student',
        mcp: false,
        sub: student!.user_id,
        jti: 'test-jti',
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      };
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
      await request(app).get('/api/student/profile').set('authorization', `Bearer ${unsigned}`).expect(401);

      const wrongSecret = jwt.sign({ email: STUDENT1_EMAIL, role: 'student', mcp: false }, 'x'.repeat(40), {
        subject: student!.user_id,
        jwtid: 'test-jti',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: 600,
      });
      await request(app)
        .get('/api/student/profile')
        .set('authorization', `Bearer ${wrongSecret}`)
        .expect(401);

      const expired = jwt.sign(
        { email: STUDENT1_EMAIL, role: 'student', mcp: false },
        process.env.JWT_ACCESS_SECRET!,
        {
          subject: student!.user_id,
          jwtid: 'test-jti',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
          expiresIn: -10,
        },
      );
      await request(app).get('/api/student/profile').set('authorization', `Bearer ${expired}`).expect(401);
    });

    it('revokes access when an account is suspended', async () => {
      const agent = newAgent(app);
      const session = await login(agent, STUDENT1_EMAIL);
      await query(`UPDATE users SET status = 'suspended' WHERE email = $1`, [STUDENT1_EMAIL]);
      try {
        await auth(agent.get('/api/student/profile'), session).expect(401);
      } finally {
        await query(`UPDATE users SET status = 'active' WHERE email = $1`, [STUDENT1_EMAIL]);
      }
    });
  });

  describe('input handling', () => {
    it('neutralises SQL injection attempts in filters', async () => {
      const admin = await adminSession();
      const injected = await auth(
        admin.agent.get('/api/admin/users').query({ search: "' OR 1=1 --" }),
        admin.session,
      ).expect(200);
      expect(injected.body.data).toEqual([]);

      const audit = await auth(
        admin.agent.get('/api/admin/audit-logs').query({ action: "' OR 1=1 --" }),
        admin.session,
      ).expect(200);
      expect(audit.body.data).toEqual([]);

      const advisor = await advisorSession();
      const students = await auth(
        advisor.agent.get('/api/advisor/students').query({ search: "%' OR '1'='1" }),
        advisor.session,
      ).expect(200);
      expect(students.body.data).toEqual([]);

      const student = await studentSession(STUDENT1_EMAIL);
      await auth(
        student.agent.get("/api/student/eligibility/UNI1204'%20OR%20'1'='1"),
        student.session,
      ).expect(400);
    });

    it('rejects unknown fields and malformed payloads', async () => {
      const student = await studentSession(STUDENT1_EMAIL);
      await auth(
        student.agent.post('/api/student/gpa/simulate').send({ simulated: [], injected: true }),
        student.session,
      ).expect(400);
      await auth(
        student.agent.post('/api/student/whatif/major-switch').send({ targetProgram: 'XX' }),
        student.session,
      ).expect(400);

      const admin = await adminSession();
      await auth(
        admin.agent.post('/api/admin/departments').send({ code: 'ZZA', nameAr: 'xx', nameEn: 'yy', x: 1 }),
        admin.session,
      ).expect(400);
      await auth(admin.agent.get('/api/admin/users/not-a-uuid'), admin.session).expect(404);
    });

    it('returns structured errors without stack traces or internals', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('content-type', 'application/json')
        .send('{"email":');
      expect([400, 500]).toContain(response.status);
      expect(response.body.error).toBeDefined();
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/at\s+\w+\s+\(/);
      expect(serialized).not.toContain('node_modules');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('strips markup from free-text fields', async () => {
      const advisor = await advisorSession();
      const mine = await studentByCode('26000001');
      const note = await auth(
        advisor.agent
          .post(`/api/advisor/students/${mine!.id}/notes`)
          .send({ note: '<img src=x onerror=alert(1)>Needs review', visibility: 'student' }),
        advisor.session,
      ).expect(201);
      expect(note.body.data.note).toBe('Needs review');
      expect(note.body.data.note).not.toContain('<');

      const admin = await adminSession();
      const department = await auth(
        admin.agent.post('/api/admin/departments').send({
          code: 'ZZB',
          nameAr: '<script>alert(1)</script>قسم',
          nameEn: '<b>Department</b>',
        }),
        admin.session,
      ).expect(201);
      expect(department.body.data.name_en).toBe('Department');
      expect(department.body.data.name_ar).not.toContain('<');
    });

    it('hardens CSV uploads against bad types and binary content', async () => {
      const admin = await adminSession();
      const header = 'email,full_name,student_code,program,level,cgpa,passed_credits\n';

      await auth(
        admin.agent.post('/api/admin/imports/students').attach('file', Buffer.from(header), {
          filename: 'students.txt',
          contentType: 'text/csv',
        }),
        admin.session,
      ).expect(400);

      await auth(
        admin.agent
          .post('/api/admin/imports/students')
          .attach('file', Buffer.from(`${header}26000999,null\u0000byte,26000999,CS,1,0,0\n`), {
            filename: 'students.csv',
            contentType: 'text/csv',
          }),
        admin.session,
      ).expect(400);

      await auth(
        admin.agent.post('/api/admin/imports/students').attach('file', Buffer.from(''), {
          filename: 'students.csv',
          contentType: 'text/csv',
        }),
        admin.session,
      ).expect(400);
    });
  });

  describe('audit trail', () => {
    it('is append-only even for the database owner', async () => {
      await login(newAgent(app), STUDENT1_EMAIL);
      const row = await one<{ id: string }>('SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1');
      await expect(
        query('UPDATE audit_logs SET action = $2 WHERE id = $1', [row!.id, 'TAMPERED']),
      ).rejects.toThrow(/append-only/i);
      await expect(query('DELETE FROM audit_logs WHERE id = $1', [row!.id])).rejects.toThrow(/append-only/i);
    });

    it('denies update and delete to the least-privilege application role', async () => {
      const pool = new Pool({ connectionString: appRoleUrl(), max: 1 });
      try {
        const admin = await adminSession();
        expect(admin.session.role).toBe('admin');
        await expect(pool.query("UPDATE audit_logs SET action = 'TAMPERED'")).rejects.toThrow(
          /permission denied/i,
        );
        await expect(pool.query('DELETE FROM audit_logs')).rejects.toThrow(/permission denied/i);
        const readable = await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM audit_logs',
        );
        expect(Number(readable.rows[0]!.count)).toBeGreaterThan(0);
      } finally {
        await pool.end();
      }
    });
  });

  describe('secret leakage and headers', () => {
    it('never returns password hashes, token hashes or refresh tokens', async () => {
      const admin = await adminSession();
      const student = await studentSession(STUDENT1_EMAIL);
      const advisor = await advisorSession();

      const responses = await Promise.all([
        admin.agent.get('/api/admin/users').set('authorization', `Bearer ${admin.session.accessToken}`),
        auth(admin.agent.get('/api/admin/audit-logs'), admin.session),
        auth(student.agent.get('/api/auth/me'), student.session),
        auth(student.agent.get('/api/student/profile'), student.session),
        auth(advisor.agent.get('/api/advisor/students'), advisor.session),
      ]);

      const storedHash = await one<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE email = $1',
        [ADMIN_EMAIL],
      );
      const payload = JSON.stringify(responses.map((response) => response.body));
      expect(payload).not.toContain(storedHash!.password_hash);
      expect(payload).not.toMatch(/password_hash|passwordHash|token_hash|refresh_token/i);
      expect(payload).not.toMatch(/\$argon2|\$2[aby]\$/);
      expect(payload).not.toContain(student.session.accessToken);
    });

    it('sets hardened security headers', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('records security-sensitive actions in the audit trail', async () => {
      const admin = await adminSession();
      const before = await one<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [
        admin.session.userId,
      ]);
      try {
        const users = await auth(
          admin.agent.patch(`/api/admin/users/${admin.session.userId}`).send({ fullName: 'Audit Admin' }),
          admin.session,
        ).expect(200);
        expect(users.body.data.fullName).toBe('Audit Admin');
        const audit = await many<{ action: string }>(
          `SELECT action FROM audit_logs WHERE action = 'USER_UPDATED' ORDER BY created_at DESC LIMIT 1`,
        );
        expect(audit).toHaveLength(1);
      } finally {
        await query('UPDATE users SET full_name = $2 WHERE id = $1', [
          admin.session.userId,
          before!.full_name,
        ]);
      }
    });
  });
});
