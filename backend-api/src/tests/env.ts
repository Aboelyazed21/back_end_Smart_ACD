/**
 * Runs before the test framework and before any application module is loaded.
 * dotenv never overwrites variables that already exist, so these values win
 * over `.env` while keeping a single code path for configuration loading.
 */
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/smart_advisor_test';
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX ?? '10';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_PEPPER =
  process.env.JWT_REFRESH_PEPPER ?? 'test-refresh-pepper-0123456789abcdef0123456789abcdef';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';

process.env.ENGINE_URL = process.env.ENGINE_URL ?? 'http://127.0.0.1:4599';
process.env.ENGINE_SERVICE_TOKEN = process.env.ENGINE_SERVICE_TOKEN ?? 'test-engine-token-0123456789';
process.env.ENGINE_HMAC_SECRET = process.env.ENGINE_HMAC_SECRET ?? 'test-engine-hmac-secret-0123456789abcdef';
process.env.ENGINE_TIMEOUT_MS = '5000';

process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.CHAT_RATE_LIMIT_MAX = '1000';
process.env.IMPORT_RATE_LIMIT_MAX = '1000';
process.env.EXPORT_RATE_LIMIT_MAX = '1000';
process.env.DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'ChangeMe!2026';
process.env.REGULATION_DATA_DIR =
  process.env.REGULATION_DATA_DIR ?? path.resolve(__dirname, '../../../regulation-data');
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET ?? 'test-qr-secret-0123456789abcdef';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.ALLOWED_EMAIL_DOMAIN = 'aidm.bua.edu.eg';
// Keep the real limiters exercised only when explicitly requested.
process.env.TEST_RATE_LIMIT = process.env.TEST_RATE_LIMIT ?? 'false';

export {};
