import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query) as any;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error: any) {
      if (error?.issues) {
        next(
          AppError.badRequest(
            'VALIDATION_ERROR',
            'Request validation failed',
            error.issues.map((issue: any) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          ),
        );
        return;
      }
      next(error);
    }
  };
}
