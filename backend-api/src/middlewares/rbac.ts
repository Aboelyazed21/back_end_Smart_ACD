import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';

export function requireRole(...roles: Array<'student' | 'advisor' | 'admin'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

export function denyAll(_req: Request, _res: Response, next: NextFunction): void {
  next(AppError.forbidden());
}
