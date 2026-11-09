import { AppError } from '../../utils/errors';
import { many, one, withTransaction } from '../../config/db';
import { writeAudit } from '../../utils/audit';
import { generateTemporaryPassword, hashPassword } from '../../utils/password';
import { mailer } from '../../integrations/mailer';
import { toSafeUser, UserRow } from '../../utils/serializers';
import { isValidEmailDomain, sanitizeText } from '../../utils/sanitize';
import { env } from '../../config/env';

export async function listUsers(filters: {
  role?: string;
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}) {
  const where: string[] = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.role) {
    params.push(filters.role);
    where.push(`u.role = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`u.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = await one<{ count: string }>(`SELECT count(*)::text AS count FROM users u ${clause}`, params);
  params.push(filters.limit, filters.offset);
  const rows = await many<UserRow>(
    `SELECT u.id, u.email, u.role, u.status, u.full_name, u.phone, u.must_change_password,
            u.is_demo, u.created_at, u.updated_at
       FROM users u ${clause}
      ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: rows.map(toSafeUser), total: Number(total?.count ?? 0) };
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: 'student' | 'advisor' | 'admin';
  phone?: string;
  password?: string;
  isDemo?: boolean;
  student?: {
    studentCode: string;
    program: 'CS' | 'IT' | 'AI' | 'DS';
    level?: number;
    advisorId?: string | null;
    departmentId?: string | null;
    admissionTerm?: string | null;
    cgpa?: number;
    passedCredits?: number;
    transferCredits?: number;
  };
  advisor?: {
    departmentId?: string | null;
    officeLocation?: string | null;
    maxStudents?: number;
  };
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
  actorContext: { ip?: string | null; correlationId?: string },
) {
  const email = input.email.trim().toLowerCase();
  if (input.role === 'student' && !isValidEmailDomain(email, env.ALLOWED_EMAIL_DOMAIN)) {
    throw AppError.badRequest(
      'EMAIL_DOMAIN_NOT_ALLOWED',
      `Student email must use the @${env.ALLOWED_EMAIL_DOMAIN} domain`,
    );
  }
  if (input.role === 'student' && !input.student) {
    throw AppError.badRequest('STUDENT_PROFILE_REQUIRED', 'Student profile fields are required');
  }
  if (input.role === 'advisor' && !input.advisor) {
    throw AppError.badRequest('ADVISOR_PROFILE_REQUIRED', 'Advisor profile fields are required');
  }
  const temporaryPassword = input.password ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const result = await withTransaction(async (client) => {
    const user = (
      await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, role, full_name, phone, must_change_password, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          email,
          passwordHash,
          input.role,
          sanitizeText(input.fullName, 200),
          input.phone ? sanitizeText(input.phone, 30) : null,
          input.password ? false : true,
          input.isDemo ?? false,
        ],
      )
    ).rows[0]!;
    if (input.role === 'student' && input.student) {
      await client.query(
        `INSERT INTO students
           (user_id, student_code, program, level, advisor_id, department_id, admission_term,
            current_cgpa, passed_credits, transfer_credits)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          user.id,
          input.student.studentCode,
          input.student.program,
          input.student.level ?? 1,
          input.student.advisorId ?? null,
          input.student.departmentId ?? null,
          input.student.admissionTerm ?? null,
          input.student.cgpa ?? 0,
          input.student.passedCredits ?? 0,
          input.student.transferCredits ?? 0,
        ],
      );
    }
    if (input.role === 'advisor' && input.advisor) {
      await client.query(
        `INSERT INTO advisors (user_id, department_id, office_location, max_students)
         VALUES ($1,$2,$3,$4)`,
        [
          user.id,
          input.advisor.departmentId ?? null,
          input.advisor.officeLocation ? sanitizeText(input.advisor.officeLocation, 200) : null,
          input.advisor.maxStudents ?? 60,
        ],
      );
    }
    await writeAudit(
      {
        actorId,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: user.id,
        after: { role: user.role, email: user.email },
        ip: actorContext.ip ?? null,
        correlationId: actorContext.correlationId ?? null,
      },
      client,
    );
    return { user: toSafeUser(user) };
  });
  if (!input.password) {
    await mailer.sendWelcome(email, temporaryPassword);
  }
  return result;
}

export async function updateUser(
  userId: string,
  patch: { fullName?: string; phone?: string; status?: 'active' | 'inactive' | 'suspended' },
  actorId: string,
  context: { ip?: string | null; correlationId?: string },
) {
  const before = await one<UserRow>('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (!before) throw AppError.notFound('User not found');
  if (before.role === 'admin' && patch.status && patch.status !== 'active' && before.id === actorId) {
    throw AppError.badRequest('SELF_LOCKOUT', 'You cannot deactivate your own admin account');
  }
  const row = await one<UserRow>(
    `UPDATE users SET full_name = COALESCE($2, full_name), phone = COALESCE($3, phone),
       status = COALESCE($4, status) WHERE id = $1 RETURNING *`,
    [
      userId,
      patch.fullName ? sanitizeText(patch.fullName, 200) : null,
      patch.phone ? sanitizeText(patch.phone, 30) : null,
      patch.status ?? null,
    ],
  );
  if (patch.status && patch.status !== 'active') {
    await one('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
    ]);
  }
  await writeAudit({
    actorId,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: userId,
    before: { fullName: before.full_name, phone: before.phone, status: before.status },
    after: patch,
    ip: context.ip ?? null,
    correlationId: context.correlationId ?? null,
  });
  return row ? toSafeUser(row) : null;
}

export async function softDeleteUser(userId: string, actorId: string, context: { ip?: string | null }) {
  const before = await one<UserRow>('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (!before) throw AppError.notFound('User not found');
  if (before.id === actorId) throw AppError.badRequest('SELF_LOCKOUT', 'You cannot delete yourself');
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET deleted_at = now(), status = 'inactive',
         email = concat(email, '.deleted.', extract(epoch from now())::bigint)
       WHERE id = $1`,
      [userId],
    );
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    await writeAudit(
      {
        actorId,
        action: 'USER_DELETED',
        entityType: 'user',
        entityId: userId,
        before: { role: before.role },
        ip: context.ip ?? null,
      },
      client,
    );
  });
}

export async function resetUserPassword(userId: string, actorId: string, context: { ip?: string | null }) {
  const user = await one<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );
  if (!user) throw AppError.notFound('User not found');
  const temporary = generateTemporaryPassword();
  await one('UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1', [
    userId,
    await hashPassword(temporary),
  ]);
  await one('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
    userId,
  ]);
  await mailer.sendWelcome(user.email, temporary);
  await writeAudit({
    actorId,
    action: 'USER_PASSWORD_RESET_BY_ADMIN',
    entityType: 'user',
    entityId: userId,
    ip: context.ip ?? null,
  });
}

export async function listAdvisors() {
  return many(
    `SELECT a.id, a.user_id, a.department_id, a.office_location, a.max_students,
            u.full_name, u.email, u.status,
            (SELECT count(*)::int FROM students s WHERE s.advisor_id = a.id) AS student_count
       FROM advisors a JOIN users u ON u.id = a.user_id
      WHERE u.deleted_at IS NULL ORDER BY u.full_name`,
  );
}

export async function updateAdvisor(
  advisorId: string,
  patch: { departmentId?: string | null; officeLocation?: string; maxStudents?: number },
  actorId: string,
) {
  const row = await one(
    `UPDATE advisors SET department_id = COALESCE($2, department_id),
       office_location = COALESCE($3, office_location), max_students = COALESCE($4, max_students)
     WHERE id = $1 RETURNING *`,
    [advisorId, patch.departmentId ?? null, patch.officeLocation ?? null, patch.maxStudents ?? null],
  );
  if (!row) throw AppError.notFound('Advisor not found');
  await writeAudit({
    actorId,
    action: 'ADVISOR_UPDATED',
    entityType: 'advisor',
    entityId: advisorId,
    after: patch,
  });
  return row;
}
