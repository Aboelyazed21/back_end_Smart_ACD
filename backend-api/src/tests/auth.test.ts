import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app';
import { one, query } from '../config/db';
import { sha256 } from '../utils/crypto';
import { hashPassword } from '../utils/password';
import {
  ADMIN_EMAIL,
  auth,
  login,
  newAgent,
  rawRefreshCookie,
  refreshTokenValue,
  STUDENT1_EMAIL,
  userByEmail,
} from './helpers';

const app = createApp();
const PASSWORD = 'ChangeMe!2026';
const NEW_PASSWORD = 'EvenStronger!2026';

async function createTestUser(email: string, password = PASSWORD, role = 'advisor') {
  const hash = await hashPassword(password);
  const row = await one<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, full_name, must_change_password)
     VALUES ($1,$2,$3,$4,false) RETURNING id`,
    [email, hash, role, 'Test Account'],
  );
  return row!.id;
}

describe('authentication', () => {
  it('issues a CSRF token and a readable double-submit cookie', async () => {
    const response = await request(app).get('/api/auth/csrf').expect(200);
    expect(response.body.csrfToken).toEqual(expect.any(String));
    expect(response.body.csrfToken.length).toBeGreaterThanOrEqual(32);
    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('csrf_token='),
    );
    expect(cookie).toBeDefined();
    expect(cookie).not.toContain('HttpOnly');
  });

  it('rejects malformed and incomplete login payloads', async () => {
    await request(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@aidm.bua.edu.eg', password: 'x' })
      .expect(401);
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('does not reveal whether an account exists', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'does-not-exist@aidm.bua.edu.eg', password: PASSWORD })
      .expect(401);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: STUDENT1_EMAIL, password: 'WrongPassword!1' })
      .expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('logs in and returns only safe user fields plus a short-lived access token', async () => {
    const agent = newAgent(app);
    const response = await agent
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD })
      .expect(200);
    expect(response.body.user).toMatchObject({ email: ADMIN_EMAIL, role: 'admin' });
    expect(response.body.user.password_hash).toBeUndefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.expiresIn).toBeLessThanOrEqual(900);
    const decoded = jwt.decode(response.body.accessToken) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(900);

    const refresh = rawRefreshCookie(response);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toContain('Path=/api/auth');
  });

  it('never stores refresh tokens in clear text', async () => {
    const agent = newAgent(app);
    const response = await agent
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD })
      .expect(200);
    const token = refreshTokenValue(response)!;
    const stored = await one<{ count: string }>(
      'SELECT count(*)::text AS count FROM refresh_tokens WHERE token_hash = $1',
      [token],
    );
    expect(Number(stored?.count)).toBe(0);
    const hashed = await one<{ count: string }>(
      'SELECT count(*)::text AS count FROM refresh_tokens WHERE token_hash = $1',
      [sha256(`${token}.${process.env.JWT_REFRESH_PEPPER}`)],
    );
    expect(Number(hashed?.count)).toBe(1);
  });

  it('returns the linked student profile from /me', async () => {
    const agent = newAgent(app);
    const session = await login(agent, STUDENT1_EMAIL);
    const response = await auth(agent.get('/api/auth/me'), session).expect(200);
    expect(response.body.user.email).toBe(STUDENT1_EMAIL);
    expect(response.body.student.student_code).toBe('26000001');
    expect(response.body.student.program).toBe('CS');
  });

  it('rejects missing, malformed and role-tampered access tokens', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('authorization', 'Bearer nonsense').expect(401);

    const student = await userByEmail(STUDENT1_EMAIL);
    const tampered = jwt.sign(
      { email: STUDENT1_EMAIL, role: 'admin', mcp: false },
      process.env.JWT_ACCESS_SECRET!,
      {
        subject: student!.id,
        jwtid: 'test',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn: 600,
      },
    );
    await request(app).get('/api/auth/me').set('authorization', `Bearer ${tampered}`).expect(401);
  });

  it('rotates refresh tokens and detects reuse of a revoked token', async () => {
    const agent = newAgent(app);
    const first = await agent
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD })
      .expect(200);
    const original = refreshTokenValue(first)!;

    const rotated = await agent.post('/api/auth/refresh').expect(200);
    const replacement = refreshTokenValue(rotated)!;
    expect(replacement).toBeDefined();
    expect(replacement).not.toBe(original);

    const oldRow = await one<{ revoked_at: Date | null; replaced_by: string | null }>(
      'SELECT revoked_at, replaced_by FROM refresh_tokens WHERE token_hash = $1',
      [sha256(`${original}.${process.env.JWT_REFRESH_PEPPER}`)],
    );
    expect(oldRow?.revoked_at).not.toBeNull();
    expect(oldRow?.replaced_by).toEqual(expect.any(String));

    await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${original}`).expect(401);

    // Reuse revokes the whole family, so the rotated token is no longer valid.
    await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${replacement}`).expect(401);
    const audit = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'REFRESH_REUSE_DETECTED'`,
    );
    expect(Number(audit?.count)).toBeGreaterThanOrEqual(1);
  });

  it('rejects refresh without a cookie and logout revokes the session', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
    const agent = newAgent(app);
    const session = await login(agent, ADMIN_EMAIL);
    await auth(agent.post('/api/auth/logout'), session).expect(204);
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('logs out of every session', async () => {
    const agent = newAgent(app);
    const session = await login(agent, ADMIN_EMAIL);
    const second = newAgent(app);
    await login(second, ADMIN_EMAIL);
    await auth(agent.post('/api/auth/logout-all'), session).expect(204);
    await second.post('/api/auth/refresh').expect(401);
  });

  it('lists and revokes individual sessions with object ownership', async () => {
    const agent = newAgent(app);
    const session = await login(agent, ADMIN_EMAIL);
    await login(agent, ADMIN_EMAIL);
    const list = await auth(agent.get('/api/auth/sessions'), session).expect(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    const target = list.body.items[0];
    await auth(agent.delete(`/api/auth/sessions/${target.id}`), session).expect(204);

    const other = await one<{ id: string }>(
      `SELECT r.id FROM refresh_tokens r JOIN users u ON u.id = r.user_id
        WHERE u.email = $1 ORDER BY r.created_at DESC LIMIT 1`,
      [STUDENT1_EMAIL],
    );
    await auth(agent.delete(`/api/auth/sessions/${other!.id}`), session).expect(404);
    await auth(agent.delete('/api/auth/sessions/not-a-uuid'), session).expect(400);
  });

  it('enforces password policy, correctness and non-reuse on change', async () => {
    const email = 'test-change@aidm.bua.edu.eg';
    await createTestUser(email);
    const agent = newAgent(app);
    const session = await login(agent, email);

    await auth(agent.post('/api/auth/change-password'), session)
      .send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD })
      .expect(400);
    await auth(agent.post('/api/auth/change-password'), session)
      .send({ currentPassword: PASSWORD, newPassword: 'weak' })
      .expect(400);
    await auth(agent.post('/api/auth/change-password'), session)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(400);
    await auth(agent.post('/api/auth/change-password'), session)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(401);
    await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD }).expect(200);
  });

  it('has a uniform forgot-password response and only stores hashed reset tokens', async () => {
    const agent = newAgent(app);
    const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
    const known = await agent
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', csrf)
      .send({ email: STUDENT1_EMAIL })
      .expect(200);
    const unknown = await agent
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', csrf)
      .send({ email: 'ghost@aidm.bua.edu.eg' })
      .expect(200);
    expect(known.body).toEqual(unknown.body);

    const reset = await one<{ token_hash: string; user_id: string }>(
      `SELECT token_hash, user_id FROM password_resets
        ORDER BY created_at DESC LIMIT 1`,
    );
    expect(reset?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resets a password exactly once with a valid token', async () => {
    const email = 'test-reset@aidm.bua.edu.eg';
    const userId = await createTestUser(email);
    const token = 'reset-token-value-0123456789abcdef';
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + interval '10 minutes')`,
      [userId, sha256(token)],
    );
    const agent = newAgent(app);
    const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
    await agent
      .post('/api/auth/reset-password')
      .set('x-csrf-token', csrf)
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(204);
    await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD }).expect(200);
    await agent
      .post('/api/auth/reset-password')
      .set('x-csrf-token', csrf)
      .send({ token, newPassword: 'AnotherStrong!2026' })
      .expect(400);

    await agent
      .post('/api/auth/reset-password')
      .set('x-csrf-token', csrf)
      .send({ token: 'x'.repeat(20), newPassword: NEW_PASSWORD })
      .expect(400);
  });

  it('locks an account after five failed attempts', async () => {
    const email = 'test-lock@aidm.bua.edu.eg';
    await createTestUser(email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword!1' }).expect(401);
    }
    await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(401);
    const row = await one<{ locked_until: Date | null; failed_login_attempts: number }>(
      'SELECT locked_until, failed_login_attempts FROM users WHERE email = $1',
      [email],
    );
    expect(row?.failed_login_attempts).toBe(5);
    expect(row?.locked_until?.getTime()).toBeGreaterThan(Date.now());
  });

  it('records authentication audit events without secrets', async () => {
    const logs = await query<{ action: string; after: Record<string, unknown> | null }>(
      'SELECT action, after FROM audit_logs ORDER BY created_at',
    );
    const actions = logs.rows.map((row) => row.action);
    expect(actions).toContain('LOGIN_SUCCESS');
    expect(actions).toContain('LOGIN_FAILED');
    const serialized = JSON.stringify(logs.rows);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain('accessToken');
  });
});
