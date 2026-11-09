import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { corsOrigins, env, isProduction } from './config/env';
import { logger } from './config/logger';
import { csrfProtection } from './middlewares/csrf';
import { attachContext, correlationMiddleware, requestTimeout } from './middlewares/context';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { generalLimiter } from './middlewares/rateLimit';
import { adminRouter } from './modules/admin/routes';
import { advisorRouter } from './modules/advisor/routes';
import { authRouter } from './modules/auth/routes';
import { chatRouter } from './modules/chat/routes';
import { studentRouter } from './modules/student/routes';
import { healthRouter } from './routes/health';

function originAllowed(origin: string | undefined): boolean {
  // Same-origin / non-browser clients (curl, server-to-server) send no Origin.
  if (!origin) return true;
  if (corsOrigins.includes('*')) return true;
  return corsOrigins.includes(origin);
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('etag', false);

  app.use(correlationMiddleware);
  app.use(attachContext);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (originAllowed(origin)) {
          callback(null, true);
          return;
        }
        logger.warn({ origin }, 'blocked cross-origin request');
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'content-type',
        'authorization',
        'x-csrf-token',
        'x-correlation-id',
        'x-requested-with',
      ],
      exposedHeaders: ['x-correlation-id', 'retry-after', 'rate-limit', 'rate-limit-policy'],
      maxAge: 600,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: env.BODY_LIMIT, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }));

  app.use(requestTimeout(20_000));
  app.use(generalLimiter);
  app.use(csrfProtection);

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/advisor', advisorRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/chat', chatRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
