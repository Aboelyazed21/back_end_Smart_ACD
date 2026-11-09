import { z } from 'zod';
import {
  hashRefreshToken,
  hmacSignature,
  randomToken,
  safeEqual,
  sha256,
  signQrToken,
  verifyQrToken,
} from '../utils/crypto';
import {
  escapeCsvFormula,
  escapeLike,
  hasHtmlTags,
  isPlainText,
  isValidEmailDomain,
  normalizeEmail,
  sanitizeText,
} from '../utils/sanitize';
import { paginated, parsePage, parseSort } from '../utils/pagination';
import { toSafeUser, toStudentProfile, UserRow } from '../utils/serializers';
import { AppError, isZodError } from '../utils/errors';
import {
  generateTemporaryPassword,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../utils/password';
import { assertCsvUpload, assertNoNullBytes, mapCsvRows, parseCsvBuffer } from '../utils/csv';
import { asyncHandler } from '../utils/async';
import { buildTerm, defaultTerm, parseTerm, termToEngine } from '../services/term';

describe('crypto utilities', () => {
  it('creates unpredictable tokens and stable hashes', () => {
    const first = randomToken(24);
    const second = randomToken(24);
    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64url')).toHaveLength(24);
    expect(sha256('value')).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256('value')).toBe(sha256('value'));
    expect(hashRefreshToken('token')).not.toBe(sha256('token'));
    expect(hmacSignature('secret', 'payload')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('compares strings without leaking length information', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('signs and verifies QR tokens, rejecting tampering and expiry', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signQrToken({
      planId: '11111111-1111-4111-8111-111111111111',
      studentCode: '26000001',
      issuedAt: now,
      expiresAt: now + 60,
      v: 1,
    });
    const verified = verifyQrToken(token);
    expect(verified).toMatchObject({ studentCode: '26000001', v: 1 });

    const [body, signature] = token.split('.');
    expect(verifyQrToken(`${body}.${signature!.slice(0, -2)}xx`)).toBeNull();
    expect(verifyQrToken('not-a-token')).toBeNull();
    expect(verifyQrToken(`${Buffer.from('{bad json').toString('base64url')}.abc`)).toBeNull();

    const expired = signQrToken({
      planId: '11111111-1111-4111-8111-111111111111',
      studentCode: '26000001',
      issuedAt: now - 120,
      expiresAt: now - 60,
      v: 1,
    });
    expect(verifyQrToken(expired)).toBeNull();
  });
});

describe('sanitisation utilities', () => {
  it('strips tags and control characters and collapses whitespace', () => {
    expect(sanitizeText('  <b>Hello</b>\u0000  world  ')).toBe('Hello world');
    expect(sanitizeText('abcdef', 3)).toBe('abc');
    expect(hasHtmlTags('<i>x</i>')).toBe(true);
    expect(hasHtmlTags('plain')).toBe(false);
    expect(isPlainText('plain')).toBe(true);
    expect(isPlainText('bad\u0000value')).toBe(false);
  });

  it('neutralises spreadsheet formulas and LIKE wildcards', () => {
    expect(escapeCsvFormula('=1+1')).toBe("'=1+1");
    expect(escapeCsvFormula('+cmd')).toBe("'+cmd");
    expect(escapeCsvFormula('-2')).toBe("'-2");
    expect(escapeCsvFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvFormula(' safe')).toBe(' safe');
    expect(escapeLike('100%_done\\')).toBe('100\\%\\_done\\\\');
  });

  it('normalises and validates email addresses', () => {
    expect(normalizeEmail('  Student@AIDM.BUA.EDU.EG ')).toBe('student@aidm.bua.edu.eg');
    expect(isValidEmailDomain('student@aidm.bua.edu.eg', 'aidm.bua.edu.eg')).toBe(true);
    expect(isValidEmailDomain('student@evil.example', 'aidm.bua.edu.eg')).toBe(false);
    expect(isValidEmailDomain('not-an-email', 'aidm.bua.edu.eg')).toBe(false);
  });
});

describe('pagination utilities', () => {
  it('parses pages with defaults and rejects invalid values', () => {
    expect(parsePage({})).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePage({ page: '3', limit: '10' }, 50)).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
    expect(() => parsePage({ page: '0' })).toThrow(AppError);
    expect(() => parsePage({ page: '1.5' })).toThrow(AppError);
    expect(() => parsePage({ limit: '101' })).toThrow(AppError);
    expect(() => parsePage({ limit: '0' })).toThrow(AppError);
  });

  it('only allows whitelisted sort columns', () => {
    const whitelist = { created: 'u.created_at', name: 'u.full_name' };
    expect(parseSort(undefined, whitelist, 'u.created_at')).toEqual({
      column: 'u.created_at',
      direction: 'DESC',
    });
    expect(parseSort('name:asc', whitelist, 'u.created_at')).toEqual({
      column: 'u.full_name',
      direction: 'ASC',
    });
    expect(parseSort('created:sideways', whitelist, 'u.created_at')).toEqual({
      column: 'u.created_at',
      direction: 'DESC',
    });
    expect(() => parseSort('id; DROP TABLE users', whitelist, 'u.created_at')).toThrow(AppError);
  });

  it('builds pagination metadata', () => {
    expect(paginated([1, 2], 42, { page: 2, limit: 10, offset: 10 })).toEqual({
      data: [1, 2],
      pagination: { page: 2, limit: 10, total: 42, pages: 5 },
    });
    expect(paginated([], 0, { page: 1, limit: 10, offset: 0 }).pagination.pages).toBe(0);
  });
});

describe('serializers', () => {
  const row: UserRow & { password_hash: string; refresh_token: string } = {
    id: 'u1',
    email: 'student@aidm.bua.edu.eg',
    role: 'student',
    status: 'active',
    full_name: 'Student One',
    phone: null,
    must_change_password: false,
    is_demo: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    password_hash: '$argon2id$secret',
    refresh_token: 'secret-token',
  };

  it('never exposes password hashes or tokens', () => {
    const safe = toSafeUser(row);
    expect(safe).toEqual({
      id: 'u1',
      email: 'student@aidm.bua.edu.eg',
      role: 'student',
      status: 'active',
      fullName: 'Student One',
      phone: null,
      mustChangePassword: false,
      isDemo: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('password_hash');
    expect(serialized).not.toContain('secret');
  });

  it('maps student profiles including the nested safe user', () => {
    const profile = toStudentProfile({
      id: 's1',
      student_code: '26000001',
      program: 'CS',
      level: 1,
      admission_term: '2026-2027-fall',
      current_cgpa: '3.25',
      passed_credits: 12,
      transfer_credits: 0,
      regular_semesters_completed: 1,
      advisor_id: null,
      advisor_name: null,
      user_id: 'u1',
      email: 'student@aidm.bua.edu.eg',
      user_status: 'active',
      full_name: 'Student One',
      phone: '000',
      must_change_password: false,
      is_demo: false,
      user_created_at: row.created_at,
      user_updated_at: row.updated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    expect(profile.cgpa).toBe(3.25);
    expect(profile.user?.email).toBe('student@aidm.bua.edu.eg');
    expect(toStudentProfile({ id: 's2' }).user).toBeNull();
  });
});

describe('errors', () => {
  it('exposes stable status codes and flags', () => {
    expect(AppError.badRequest('X', 'bad').status).toBe(400);
    expect(AppError.unauthorized().code).toBe('UNAUTHORIZED');
    expect(AppError.forbidden().status).toBe(403);
    expect(AppError.notFound().status).toBe(404);
    expect(AppError.conflict('C', 'conflict').status).toBe(409);
    expect(AppError.unprocessable('U', 'invalid').status).toBe(422);
    expect(AppError.tooMany().status).toBe(429);
    const unavailable = AppError.serviceUnavailable('E', 'down');
    expect(unavailable.status).toBe(503);
    expect(unavailable.expose).toBe(false);
    expect(isZodError(new z.ZodError([]))).toBe(true);
    expect(isZodError(new Error('nope'))).toBe(false);
  });
});

describe('password utilities', () => {
  it('enforces the password policy', () => {
    expect(() => validatePasswordPolicy('StrongPass!2026')).not.toThrow();
    for (const weak of ['short!A1', 'alllowercase!1', 'ALLUPPERCASE!1', 'NoDigits!!!!!', 'NoSymbol12345']) {
      expect(() => validatePasswordPolicy(weak)).toThrow(AppError);
    }
  });

  it('hashes with argon2id and verifies without leaking failures', async () => {
    const hash = await hashPassword('StrongPass!2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'StrongPass!2026')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPass!2026')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'StrongPass!2026')).toBe(false);
  });

  it('generates temporary passwords that satisfy the policy', () => {
    const generated = generateTemporaryPassword();
    expect(generated).toHaveLength(16);
    expect(() => validatePasswordPolicy(generated)).not.toThrow();
    expect(generateTemporaryPassword()).not.toBe(generated);
  });
});

describe('CSV utilities', () => {
  const file = (overrides: Partial<Express.Multer.File>): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'data.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 10,
    buffer: Buffer.from('a,b\n1,2\n'),
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  });

  it('validates upload names, MIME types and sizes', () => {
    expect(() => assertCsvUpload(file({}))).not.toThrow();
    expect(() => assertCsvUpload(undefined)).toThrow(/CSV file is required/);
    expect(() => assertCsvUpload(file({ originalname: 'data.txt' }))).toThrow(/Only .csv/);
    expect(() => assertCsvUpload(file({ mimetype: 'image/png' }))).toThrow(/content type/);
    expect(() => assertCsvUpload(file({ size: 6_000_000 }))).toThrow(/5 MB/);
  });

  it('rejects null bytes and non-CSV paths', () => {
    expect(() => assertNoNullBytes('data.csv', Buffer.from('a,b\n1,2'))).not.toThrow();
    expect(() => assertNoNullBytes('data.csv', Buffer.from([0x61, 0x00]))).toThrow(/binary/);
    expect(() => assertNoNullBytes('data.txt', Buffer.from('a,b'))).toThrow(/Only .csv/);
  });

  it('parses quoted fields, CRLF, BOMs and blank lines', () => {
    const rows = parseCsvBuffer(
      Buffer.from('\uFEFFname,note\r\n"Ada","hello, ""world"""\r\n\r\nBob,plain\n'),
    );
    expect(rows).toEqual([
      ['name', 'note'],
      ['Ada', 'hello, "world"'],
      ['Bob', 'plain'],
    ]);
    expect(parseCsvBuffer(Buffer.from('a,b\n\n'))).toEqual([['a', 'b']]);
  });

  it('rejects oversized files and bad headers', () => {
    const header = 'a,b\n';
    const huge = header + `${'x'.repeat(10)},${'y'.repeat(10)}\n`.repeat(5001);
    expect(() => parseCsvBuffer(Buffer.from(huge))).toThrow(/5000/);
    expect(() => mapCsvRows([])).toThrow(/CSV is empty/);
    expect(() =>
      mapCsvRows([
        ['a', 'a'],
        ['1', '2'],
      ]),
    ).toThrow(/duplicate/);
    expect(
      mapCsvRows([
        [' A ', 'B'],
        [' 1 ', '2'],
      ]),
    ).toEqual([{ a: '1', b: '2' }]);
    expect(mapCsvRows([['a', 'b'], ['1']])).toEqual([{ a: '1', b: '' }]);
  });
});

describe('async handler', () => {
  it('forwards resolved handlers and captures rejections', async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => 'ok');
    handler({} as never, {} as never, next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();

    const failing = asyncHandler(async () => {
      throw new Error('boom');
    });
    failing({} as never, {} as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});

describe('academic term parsing', () => {
  it('builds canonical terms and validates inputs', () => {
    expect(buildTerm('fall', '2026-2027')).toMatchObject({
      term: '2026-2027-fall',
      week: 1,
      isFirstSemester: false,
    });
    expect(() => buildTerm('fall', '2026-2028')).toThrow(/consecutive/);
    expect(() => buildTerm('fall', '2026/2027')).toThrow(/2026-2027/);
    expect(() => buildTerm('fall', '2026-2027', -1)).toThrow(/week/);
    expect(() => buildTerm('fall', '2026-2027', 31)).toThrow(/week/);
  });

  it('picks a sensible default term from the calendar', () => {
    expect(defaultTerm(new Date('2026-10-01T00:00:00Z'))).toMatchObject({
      season: 'fall',
      academicYear: '2026-2027',
    });
    expect(defaultTerm(new Date('2027-02-01T00:00:00Z'))).toMatchObject({
      season: 'spring',
      academicYear: '2026-2027',
    });
    expect(defaultTerm(new Date('2027-07-01T00:00:00Z'))).toMatchObject({
      season: 'summer',
      academicYear: '2026-2027',
    });
  });

  it('accepts every documented format and rejects garbage', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    for (const value of ['2026-2027-fall', 'fall 2026-2027', 'fall:2026-2027', 'FALL 2026-2027']) {
      expect(parseTerm(value, now).term).toBe('2026-2027-fall');
    }
    expect(parseTerm(undefined, now).term).toBe('2026-2027-fall');
    expect(parseTerm('', now).term).toBe('2026-2027-fall');
    expect(parseTerm('spring', now)).toMatchObject({
      season: 'spring',
      academicYear: '2026-2027',
    });
    expect(() => parseTerm(2026, now)).toThrow(/string/);
    expect(() => parseTerm('winter 2026-2027', now)).toThrow(/2026-2027-fall/);
    expect(() => parseTerm('2026-2027-winter', now)).toThrow(/2026-2027-fall/);
  });

  it('converts to the engine contract', () => {
    expect(termToEngine(buildTerm('spring', '2026-2027', 4, true))).toEqual({
      season: 'spring',
      academic_year: '2026-2027',
      week: 4,
      is_first_semester: true,
    });
  });
});
