import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { one } from '../config/db';
import { AppError } from '../utils/errors';

export interface AccessClaims {
  sub: string;
  email: string;
  role: 'student' | 'advisor' | 'admin';
  mcp: boolean;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export function signAccessToken(user: {
  id: string;
  email: string;
  role: 'student' | 'advisor' | 'admin';
  mustChangePassword: boolean;
}): { token: string; expiresIn: number; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { email: user.email, role: user.role, mcp: user.mustChangePassword },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      jwtid: jti,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
    },
  );
  return { token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, jti };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ['HS256'],
    }) as AccessClaims;
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized();
    }
    const token = header.slice(7).trim();
    if (!token) throw AppError.unauthorized();
    const claims = verifyAccessToken(token);
    const row = await one<{
      id: string;
      email: string;
      role: string;
      status: string;
      must_change_password: boolean;
      deleted_at: Date | null;
    }>('SELECT id, email, role, status, must_change_password, deleted_at FROM users WHERE id = $1', [
      claims.sub,
    ]);
    if (!row || row.deleted_at || row.status !== 'active' || row.role !== claims.role) {
      throw AppError.unauthorized('Account is not active');
    }
    req.user = {
      id: row.id,
      email: row.email,
      role: row.role as 'student' | 'advisor' | 'admin',
      mustChangePassword: row.must_change_password,
      tokenId: claims.jti,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    next(AppError.forbidden('You must change your password before using this resource'));
    return;
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  requireAuth(req, _res, next).catch(next);
}
