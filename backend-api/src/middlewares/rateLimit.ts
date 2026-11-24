import rateLimit, { Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { AppError } from '../utils/errors';
import { PostgresRateLimitStore } from './pgRateLimitStore';

function base({
  windowMs = 60_000,
  limit = env.RATE_LIMIT_MAX,
  ...rest
}: Partial<Options>): Partial<Options> {
  const identifier = typeof rest.identifier === 'string' ? rest.identifier : 'general';
  return {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    message: 'Too many requests',
    statusCode: 429,
    identifier,
    legacyHeaders: false,
    // Shared counters when RATE_LIMIT_STORE=postgres, so every instance
    // enforces the same budget instead of ten independent ones.
    ...(env.RATE_LIMIT_STORE === 'postgres'
      ? {
          store: new PostgresRateLimitStore(identifier, Math.max(1, Math.ceil(windowMs / 1000))),
        }
      : {}),
    // Tests run many requests from one address; keep the limiter enabled but
    // generous enough not to create flakiness.
    skip: () => isTest && process.env.TEST_RATE_LIMIT !== 'true',
    handler: (_req, _res, next) => next(AppError.tooMany()),
    ...rest,
  };
}

export const generalLimiter = rateLimit(
  base({ windowMs: 60_000, limit: env.RATE_LIMIT_MAX, identifier: 'general' }),
);

export const authLimiter = rateLimit(
  base({ windowMs: 15 * 60_000, limit: env.AUTH_RATE_LIMIT_MAX, identifier: 'auth' }),
);

export const chatLimiter = rateLimit(
  base({ windowMs: 60_000, limit: env.CHAT_RATE_LIMIT_MAX, identifier: 'chat' }),
);

export const importLimiter = rateLimit(
  base({ windowMs: 60 * 60_000, limit: env.IMPORT_RATE_LIMIT_MAX, identifier: 'import' }),
);

export const exportLimiter = rateLimit(
  base({ windowMs: 60_000, limit: env.EXPORT_RATE_LIMIT_MAX, identifier: 'export' }),
);
