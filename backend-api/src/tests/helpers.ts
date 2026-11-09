import request, { Test } from 'supertest';
import { Express } from 'express';
import { one } from '../config/db';

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'ChangeMe!2026';
export const ADMIN_EMAIL = 'admin@bua.edu.eg';
export const ADVISOR1_EMAIL = 'advisor1@aidm.bua.edu.eg';
export const ADVISOR2_EMAIL = 'advisor2@aidm.bua.edu.eg';
export const STUDENT1_EMAIL = 'student1@aidm.bua.edu.eg';
export const STUDENT2_EMAIL = 'student2@aidm.bua.edu.eg';
export const STUDENT3_EMAIL = 'student3@aidm.bua.edu.eg';
export const STUDENT5_EMAIL = 'student5@aidm.bua.edu.eg';

export interface Session {
  accessToken: string;
  csrfToken: string;
  userId: string;
  role: 'student' | 'advisor' | 'admin';
  email: string;
}

export type Agent = ReturnType<typeof request.agent>;

export function newAgent(app: Express): Agent {
  return request.agent(app);
}

export async function login(agent: Agent, email: string, password = DEMO_PASSWORD): Promise<Session> {
  const response = await agent.post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    accessToken: response.body.accessToken,
    csrfToken: response.body.csrfToken,
    userId: response.body.user.id,
    role: response.body.user.role,
    email: response.body.user.email,
  };
}

export function auth(req: Test, session: Session): Test {
  return req.set('authorization', `Bearer ${session.accessToken}`).set('x-csrf-token', session.csrfToken);
}

export function rawRefreshCookie(response: request.Response): string | undefined {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith('refresh_token='));
}

export function refreshTokenValue(response: request.Response): string | undefined {
  const cookie = rawRefreshCookie(response);
  return cookie?.split(';')[0]?.split('=')[1];
}

export async function studentByCode(code: string) {
  return one<{ id: string; user_id: string; student_code: string; program: string; level: number }>(
    'SELECT id, user_id, student_code, program, level FROM students WHERE student_code = $1',
    [code],
  );
}

export async function userByEmail(email: string) {
  return one<{ id: string; email: string; role: string; status: string }>(
    'SELECT id, email, role, status FROM users WHERE email = $1',
    [email],
  );
}

export async function advisorByEmail(email: string) {
  return one<{ id: string; user_id: string; department_id: string | null }>(
    `SELECT a.id, a.user_id, a.department_id FROM advisors a
       JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
    [email],
  );
}

export async function departmentByCode(code: string) {
  return one<{ id: string; code: string }>('SELECT id, code FROM departments WHERE code = $1', [code]);
}

export async function courseByCode(code: string) {
  return one<{ id: string; code: string; credits: number }>(
    'SELECT id, code, credits FROM courses WHERE code = $1',
    [code],
  );
}
