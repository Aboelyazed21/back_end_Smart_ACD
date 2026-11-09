import pino from 'pino';
import { env } from './env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["x-service-token"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'email',
  'phone',
  'studentCode',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  base: { service: 'backend-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export const httpLogger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  serializers: {
    req(req: any) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
        remoteAddress: req.remoteAddress,
      };
    },
    res(res: any) {
      return { statusCode: res.statusCode };
    },
  },
});
