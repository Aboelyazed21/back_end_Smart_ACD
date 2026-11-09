import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { env, isProduction } from '../../config/env';
import { many, one, query } from '../../config/db';
import { signAccessToken } from '../../middlewares/auth';
import { AppError } from '../../utils/errors';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../utils/password';
import { hashRefreshToken, randomToken, sha256 } from '../../utils/crypto';
import { toSafeUser, UserRow } from '../../utils/serializers';
import { writeAudit } from '../../utils/audit';
import { issueCsrfToken } from '../../middlewares/csrf';
import { sendPasswordReset } from '../../services/notifications';
import { logger } from '../../config/logger';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

interface UserWithHash extends UserRow {
  password_hash: string;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProduction || env.COOKIE_SECURE,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

async function issueSession(
  user: UserRow,
  req: Request,
  res: Response,
  familyId?: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
  const access = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.must_change_password,
  });
  const refreshToken = randomToken(48);
  const family = familyId ?? randomUUID();
  const row = await one<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip)
     VALUES ($1,$2,$3, now() + ($4 || ' days')::interval, $5, $6) RETURNING id`,
    [
      user.id,
      hashRefreshToken(refreshToken),
      family,
      String(env.REFRESH_TOKEN_TTL_DAYS),
      (req.headers['user-agent'] ?? '').slice(0, 500) || null,
      req.ip ?? null,
    ],
  );
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.locals.csrfToken = issueCsrfToken(res);
  // Keep the row id available to callers that need to link a rotation chain.
  res.locals.refreshTokenId = row?.id;
  return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken };
}

async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId],
  );
  logger.warn({ familyId, reason }, 'refresh token family revoked');
}

export async function login(email: string, password: string, req: Request, res: Response) {
  const normalized = email.trim().toLowerCase();
  const user = await one<UserWithHash>(`SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [
    normalized,
  ]);
  const generic = AppError.unauthorized('Invalid email or password');
  if (!user) {
    await writeAudit({
      actorId: null,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      correlationId: req.correlationId,
      after: { emailDomain: normalized.split('@')[1] ?? 'unknown' },
    });
    throw generic;
  }
  if (user.status !== 'active') throw generic;
  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    throw generic;
  }
  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    await query(
      `UPDATE users SET failed_login_attempts = $2,
         locked_until = CASE WHEN $2 >= $3::int
           THEN now() + ($4::text || ' minutes')::interval ELSE locked_until END
       WHERE id = $1`,
      [user.id, attempts, MAX_FAILED_ATTEMPTS, String(LOCK_MINUTES)],
    );
    await writeAudit({
      actorId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      entityId: user.id,
      ip: req.ip ?? null,
      correlationId: req.correlationId,
      after: { attempts },
    });
    throw generic;
  }
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
      WHERE id = $1`,
    [user.id],
  );
  const session = await issueSession(user, req, res);
  await writeAudit({
    actorId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'auth',
    entityId: user.id,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
  return {
    user: toSafeUser(user),
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    csrfToken: res.locals.csrfToken,
  };
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (typeof token !== 'string' || token.length < 20) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  const row = await one<{
    id: string;
    user_id: string;
    family_id: string;
    revoked_at: Date | null;
    expires_at: Date;
  }>('SELECT id, user_id, family_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1', [
    hashRefreshToken(token),
  ]);
  if (!row) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  if (row.revoked_at) {
    // Reuse of a rotated token: assume theft and revoke the whole family.
    await revokeFamily(row.family_id, 'refresh_token_reuse');
    await writeAudit({
      actorId: row.user_id,
      action: 'REFRESH_REUSE_DETECTED',
      entityType: 'auth',
      entityId: row.user_id,
      ip: req.ip ?? null,
      correlationId: req.correlationId,
    });
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  if (row.expires_at.getTime() <= Date.now()) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  const user = await one<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [row.user_id, 'active'],
  );
  if (!user) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  const session = await issueSession(user, req, res, row.family_id);
  const replacementId = res.locals.refreshTokenId as string | undefined;
  await query(`UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [
    row.id,
    replacementId ?? null,
  ]);
  return {
    user: toSafeUser(user),
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    csrfToken: res.locals.csrfToken,
  };
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (typeof token === 'string') {
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
      hashRefreshToken(token),
    ]);
  }
  clearRefreshCookie(res);
  if (req.user) {
    await writeAudit({
      actorId: req.user.id,
      action: 'LOGOUT',
      entityType: 'auth',
      entityId: req.user.id,
      ip: req.ip ?? null,
      correlationId: req.correlationId,
    });
  }
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  if (!req.user) throw AppError.unauthorized();
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    req.user.id,
  ]);
  clearRefreshCookie(res);
  await writeAudit({
    actorId: req.user.id,
    action: 'LOGOUT_ALL',
    entityType: 'auth',
    entityId: req.user.id,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
}

export async function me(userId: string) {
  const user = await one<UserRow>(
    'SELECT id, email, password_hash, role, status, full_name, phone, must_change_password, is_demo, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );
  if (!user) throw AppError.notFound('User not found');
  const student = await one<Record<string, unknown>>(
    `SELECT s.id, s.student_code, s.program, s.level, s.advisor_id, s.current_cgpa, s.passed_credits
       FROM students s WHERE s.user_id = $1`,
    [userId],
  );
  const advisor = await one<Record<string, unknown>>(
    `SELECT a.id, a.department_id, a.office_location, a.max_students
       FROM advisors a WHERE a.user_id = $1`,
    [userId],
  );
  return { user: toSafeUser(user), student, advisor };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req: Request,
): Promise<void> {
  const user = await one<{ id: string; password_hash: string; role: string }>(
    'SELECT id, password_hash, role FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );
  if (!user) throw AppError.unauthorized();
  const valid = await verifyPassword(user.password_hash, currentPassword);
  if (!valid) throw AppError.badRequest('INVALID_PASSWORD', 'Current password is incorrect');
  if (await verifyPassword(user.password_hash, newPassword)) {
    throw AppError.badRequest('PASSWORD_REUSED', 'New password must be different');
  }
  validatePasswordPolicy(newPassword);
  const hash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $2, must_change_password = false, failed_login_attempts = 0
      WHERE id = $1`,
    [userId, hash],
  );
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
  await writeAudit({
    actorId: userId,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: userId,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
}

export async function forgotPassword(email: string, req: Request): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await one<{ id: string; email: string; status: string }>(
    'SELECT id, email, status FROM users WHERE email = $1 AND deleted_at IS NULL',
    [normalized],
  );
  if (!user || user.status !== 'active') {
    // Uniform response; do not reveal account existence.
    return;
  }
  const token = randomToken(32);
  await query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [user.id, sha256(token), String(env.RESET_TOKEN_TTL_MINUTES)],
  );
  await sendPasswordReset(user.email, token);
  await writeAudit({
    actorId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
}

export async function resetPassword(token: string, newPassword: string, req: Request): Promise<void> {
  const row = await one<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_resets
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [sha256(token)],
  );
  if (!row) throw AppError.badRequest('INVALID_RESET_TOKEN', 'Reset link is invalid or expired');
  validatePasswordPolicy(newPassword);
  const hash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, [
    row.user_id,
    hash,
  ]);
  await query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [row.id]);
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    row.user_id,
  ]);
  await writeAudit({
    actorId: row.user_id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: row.user_id,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
}

export async function listSessions(userId: string) {
  return many(
    `SELECT id, user_agent, ip, created_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
}

export async function revokeSession(userId: string, sessionId: string, req: Request) {
  const row = await one<{ id: string }>(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
    [sessionId, userId],
  );
  if (!row) throw AppError.notFound('Session not found');
  await writeAudit({
    actorId: userId,
    action: 'SESSION_REVOKED',
    entityType: 'auth',
    entityId: sessionId,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
}

export async function issueCsrf(res: Response): Promise<{ csrfToken: string }> {
  return { csrfToken: issueCsrfToken(res) };
}
