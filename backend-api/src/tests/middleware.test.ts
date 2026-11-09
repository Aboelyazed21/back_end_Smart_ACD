import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { errorHandler, notFoundHandler } from '../middlewares/errorHandler';
import { attachContext, requestTimeout } from '../middlewares/context';
import { validate } from '../middlewares/validate';
import { denyAll, requireRole } from '../middlewares/rbac';
import { optionalAuth, requireAuth, requirePasswordChanged } from '../middlewares/auth';
import { signAccessToken } from '../middlewares/auth';
import { createApp } from '../app';
import request from 'supertest';

function mockResponse(): Response & {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  timeoutCallback?: () => void;
} {
  const res = {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    headersSent: false,
    timeoutCallback: undefined as (() => void) | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    setTimeout(_ms: number, callback: () => void) {
      this.timeoutCallback = callback;
      return this;
    },
  };
  return res as any;
}

function runError(error: unknown, headersSent = false): { status: number; body: any } {
  const res = mockResponse();
  res.headersSent = headersSent;
  const next = jest.fn() as unknown as NextFunction;
  errorHandler(error, { method: 'GET', path: '/x', correlationId: 'cid' } as Request, res, next);
  return { status: res.statusCode, body: res.body };
}

describe('error handling middleware', () => {
  it('passes AppErrors through unchanged', () => {
    const result = runError(new AppError(418, 'TEAPOT', 'short and stout'));
    expect(result.status).toBe(418);
    expect(result.body.error).toMatchObject({ code: 'TEAPOT', message: 'short and stout' });
  });

  it('translates Zod validation errors with field details', () => {
    const schema = z.object({ email: z.string().email() }).strict();
    const parsed = schema.safeParse({ email: 'nope', extra: true });
    expect(parsed.success).toBe(false);
    const result = runError(parsed.error);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
    expect(result.body.error.details.length).toBeGreaterThan(0);
    expect(result.body.error.details[0]).toHaveProperty('path');
  });

  it('translates multer size and generic upload errors', () => {
    expect(runError(new multer.MulterError('LIMIT_FILE_SIZE')).body.error.code).toBe('FILE_TOO_LARGE');
    expect(runError(new multer.MulterError('LIMIT_UNEXPECTED_FILE')).body.error.code).toBe('UPLOAD_ERROR');
  });

  it('translates PostgreSQL constraint and syntax errors', () => {
    expect(runError({ code: '23505' }).body.error.code).toBe('DUPLICATE_RESOURCE');
    expect(runError({ code: '23503' }).body.error.code).toBe('INVALID_REFERENCE');
    expect(runError({ code: '23514' }).body.error.code).toBe('INVALID_VALUE');
    expect(runError({ code: '22P02' }).body.error.code).toBe('INVALID_VALUE');
  });

  it('translates body parser failures', () => {
    expect(runError({ type: 'entity.parse.failed' }).body.error.code).toBe('INVALID_JSON');
    expect(runError({ type: 'entity.too.large' }).body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides unexpected internal errors', () => {
    const result = runError(new Error('database password is hunter2'));
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(result.body)).not.toContain('hunter2');
  });

  it('does not write a response when headers were already sent', () => {
    const res = mockResponse();
    res.headersSent = true;
    errorHandler(new AppError(400, 'X', 'bad'), {} as Request, res, jest.fn());
    expect(res.body).toBeNull();
  });

  it('builds a 404 error for unknown routes', () => {
    const next = jest.fn();
    notFoundHandler({ method: 'GET', path: '/missing' } as Request, mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
  });

  it('returns a structured 404 through the real app', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('validation middleware', () => {
  it('parses params, query and body and calls next', () => {
    const req = {
      params: { id: '1' },
      query: { page: '2' },
      body: { name: 'x' },
    } as unknown as Request;
    const next = jest.fn();
    validate({
      params: z.object({ id: z.string() }).strict(),
      query: z.object({ page: z.coerce.number() }).strict(),
      body: z.object({ name: z.string() }).strict(),
    })(req, mockResponse(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 2 });
  });

  it('forwards Zod issues as a safe validation error', () => {
    const next = jest.fn();
    validate({ body: z.object({ name: z.string() }).strict() })(
      { params: {}, query: {}, body: { name: 1 } } as unknown as Request,
      mockResponse(),
      next,
    );
    const error = next.mock.calls[0]![0] as AppError;
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('forwards non-Zod parser failures untouched', () => {
    const boom = new Error('boom');
    const next = jest.fn();
    validate({
      body: {
        parse: () => {
          throw boom;
        },
      } as never,
    })({ params: {}, query: {}, body: {} } as unknown as Request, mockResponse(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('authorisation middleware', () => {
  it('enforces role membership', () => {
    const next = jest.fn();
    requireRole('admin')({} as Request, mockResponse(), next);
    expect((next.mock.calls[0]![0] as AppError).status).toBe(401);

    const forbidden = jest.fn();
    requireRole('admin')({ user: { role: 'student' } } as Request, mockResponse(), forbidden);
    expect((forbidden.mock.calls[0]![0] as AppError).status).toBe(403);

    const allowed = jest.fn();
    requireRole('student')({ user: { role: 'student' } } as Request, mockResponse(), allowed);
    expect(allowed).toHaveBeenCalledWith();
  });

  it('denies everything for denyAll', () => {
    const next = jest.fn();
    denyAll({} as Request, mockResponse(), next);
    expect((next.mock.calls[0]![0] as AppError).status).toBe(403);
  });

  it('requires a changed password before protected work', () => {
    const blocked = jest.fn();
    requirePasswordChanged({ user: { mustChangePassword: true } } as Request, mockResponse(), blocked);
    expect((blocked.mock.calls[0]![0] as AppError).status).toBe(403);

    const allowed = jest.fn();
    requirePasswordChanged({ user: { mustChangePassword: false } } as Request, mockResponse(), allowed);
    expect(allowed).toHaveBeenCalledWith();
  });

  it('rejects malformed Authorization headers before touching the database', async () => {
    for (const header of [undefined, 'Basic abc', 'Bearer ', 'Bearer not-a-token']) {
      const next = jest.fn();
      await requireAuth(
        { headers: header === undefined ? {} : { authorization: header } } as Request,
        mockResponse(),
        next,
      );
      const error = next.mock.calls[0]?.[0] as AppError;
      expect(error.status).toBe(401);
    }
  });

  it('allows optional auth to continue anonymously', () => {
    const next = jest.fn();
    optionalAuth({ headers: {} } as Request, mockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('signs short-lived access tokens with the configured claims', () => {
    const signed = signAccessToken({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'student@aidm.bua.edu.eg',
      role: 'student',
      mustChangePassword: true,
    });
    expect(signed.expiresIn).toBeLessThanOrEqual(900);
    expect(signed.jti).toBeTruthy();
    expect(signed.token.split('.')).toHaveLength(3);
  });
});

describe('request context and timeout middleware', () => {
  it('attaches a correlation id and start time', () => {
    const req = { id: 'existing-correlation-id' } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn();
    attachContext(req, res, next);
    expect(req.correlationId).toBe('existing-correlation-id');
    expect(req.requestStartedAt).toBeLessThanOrEqual(Date.now());
    expect(res.headers['x-correlation-id']).toBe('existing-correlation-id');
    expect(next).toHaveBeenCalledWith();

    const fresh = {} as Request;
    attachContext(fresh, mockResponse(), jest.fn());
    expect(fresh.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 503 when a request times out before headers are sent', () => {
    const res = mockResponse();
    const next = jest.fn();
    requestTimeout(50)({} as Request, res, next);
    expect(next).toHaveBeenCalledWith();
    res.timeoutCallback!();
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('REQUEST_TIMEOUT');
  });

  it('does not overwrite a response that already started', () => {
    const res = mockResponse();
    res.headersSent = true;
    requestTimeout(50)({} as Request, res, jest.fn());
    res.timeoutCallback!();
    expect(res.body).toBeNull();
  });
});
