import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function translate(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return AppError.badRequest(
      'VALIDATION_ERROR',
      'Request validation failed',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
  if (error instanceof multer.MulterError) {
    return AppError.badRequest(
      error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
      'Upload rejected',
    );
  }
  const pg = error as PgError;
  if (pg?.code === '23505') {
    return AppError.conflict('DUPLICATE_RESOURCE', 'The resource already exists');
  }
  if (pg?.code === '23503') {
    return AppError.badRequest('INVALID_REFERENCE', 'Referenced resource does not exist');
  }
  if (pg?.code === '23514' || pg?.code === '22P02') {
    return AppError.badRequest('INVALID_VALUE', 'A submitted value is not allowed');
  }
  if ((error as { type?: string })?.type === 'entity.parse.failed') {
    return AppError.badRequest('INVALID_JSON', 'Request body is not valid JSON');
  }
  if ((error as { type?: string })?.type === 'entity.too.large') {
    return AppError.badRequest('PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred', {}, false);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = translate(error);
  if (appError.status >= 500) {
    logger.error(
      { err: error, correlationId: req.correlationId, route: `${req.method} ${req.path}` },
      'request failed',
    );
  }
  if (res.headersSent) return;
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : 'An unexpected error occurred',
      details: appError.details ?? {},
      correlationId: req.correlationId ?? null,
    },
  });
}
