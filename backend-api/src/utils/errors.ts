import { z } from 'zod';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;
  public readonly expose: boolean;

  constructor(status: number, code: string, message: string, details: unknown = {}, expose = true) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }

  static badRequest(code: string, message: string, details: unknown = {}): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You are not allowed to perform this action'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  static unprocessable(code: string, message: string, details: unknown = {}): AppError {
    return new AppError(422, code, message, details);
  }

  static tooMany(message = 'Too many requests'): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static serviceUnavailable(code: string, message: string): AppError {
    return new AppError(503, code, message, {}, false);
  }
}

export function isZodError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
