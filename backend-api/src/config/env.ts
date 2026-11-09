import 'dotenv/config';
import { z } from 'zod';

const booleanLike = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_PEPPER: z.string().min(32),
  JWT_ISSUER: z.string().default('bua-aidm-advisor'),
  JWT_AUDIENCE: z.string().default('bua-aidm-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  ENGINE_URL: z.string().url().default('http://rule-engine:8000'),
  ENGINE_SERVICE_TOKEN: z.string().min(16),
  ENGINE_HMAC_SECRET: z.string().optional().default(''),
  ENGINE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
  ALLOWED_EMAIL_DOMAIN: z.string().min(3).default('aidm.bua.edu.eg'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: booleanLike,
  CSRF_COOKIE_NAME: z.string().default('csrf_token'),
  REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
  TRUST_PROXY: z.string().default('loopback'),
  BODY_LIMIT: z.string().default('100kb'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(20_000_000).default(5_000_000),
  SMTP_HOST: z.string().default('mailhog'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().default('no-reply@aidm.bua.edu.eg'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  QR_SIGNING_SECRET: z.string().min(16).default('dev-qr-secret-change-me-0123456789'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  IMPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  EXPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  DEMO_PASSWORD: z.string().default('ChangeMe!2026'),
  LOG_LEVEL: z.string().default('info'),
  REGULATION_DATA_DIR: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Do not print values; only field names.
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const weak = new Set(['change-me', 'changeme', 'secret', 'dev-qr-secret-change-me-0123456789']);
    if (weak.has(env.JWT_ACCESS_SECRET) || weak.has(env.JWT_REFRESH_PEPPER)) {
      throw new Error('Production secrets must not use development defaults');
    }
    if (env.ENGINE_HMAC_SECRET && env.ENGINE_HMAC_SECRET.length < 32) {
      throw new Error('ENGINE_HMAC_SECRET must be at least 32 characters');
    }
    if (process.env.SEED_DEMO === 'true' && env.DEMO_PASSWORD === 'ChangeMe!2026') {
      throw new Error('DEMO_PASSWORD must not use the development default when SEED_DEMO=true in production');
    }
  }
  return env;
}

export const env: Env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
