import { NextFunction, Request, Response } from 'express';
import { env, isProduction } from '../config/env';
import { randomToken, safeEqual } from '../utils/crypto';
import { AppError } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Endpoints that establish a session and therefore cannot present a CSRF token
 * yet. Login is credential-protected; refresh is additionally protected by a
 * SameSite=strict cookie and token rotation with reuse detection.
 */
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/csrf']);

export function issueCsrfToken(res: Response): string {
  const existing = (res.req as Request | undefined)?.cookies?.[env.CSRF_COOKIE_NAME];
  const token = typeof existing === 'string' && existing.length >= 32 ? existing : randomToken(32);
  res.cookie(env.CSRF_COOKIE_NAME, token, {
    httpOnly: false, // the browser client must echo it in X-CSRF-Token
    sameSite: 'strict',
    secure: isProduction || env.COOKIE_SECURE,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
  return token;
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[env.CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    next(AppError.forbidden('CSRF token missing'));
    return;
  }
  if (!safeEqual(cookieToken, headerToken)) {
    next(AppError.forbidden('CSRF token mismatch'));
    return;
  }
  next();
}

export const _internal = { SAFE_METHODS, EXEMPT_PATHS };
