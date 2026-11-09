import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { httpLogger } from '../config/logger';

export const correlationMiddleware = pinoHttp({
  logger: httpLogger,
  genReqId: (req) => {
    const header = req.headers['x-correlation-id'];
    if (typeof header === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(header)) return header;
    return randomUUID();
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});

export function attachContext(req: Request, res: Response, next: NextFunction): void {
  req.correlationId = String((req as any).id ?? randomUUID());
  req.requestStartedAt = Date.now();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}

export function requestTimeout(ms = 15_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(503).json({
          error: { code: 'REQUEST_TIMEOUT', message: 'Request timed out', details: {} },
        });
      }
    });
    next();
  };
}
