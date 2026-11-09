#!/usr/bin/env node
/**
 * Verifies the least-privilege application role cannot rewrite history.
 *
 * Migration 1700000000000 revokes UPDATE/DELETE on audit_logs and installs a
 * trigger that rejects mutation even if grants are later widened. CI runs this
 * against the freshly migrated test database so a regression fails the build.
 *
 * Usage: DATABASE_URL=postgres://smart_advisor_app:...@host/db node scripts/check-audit-append-only.mjs
 */
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

function isDenied(error) {
  return (
    error?.code === '42501' ||
    /permission denied|audit logs are append-only/i.test(String(error?.message ?? ''))
  );
}

async function expectDenied(sql, label) {
  try {
    await client.query(sql);
  } catch (error) {
    if (isDenied(error)) {
      console.log(`ok: ${label} was refused (${error.code ?? 'trigger'})`);
      return;
    }
    throw error;
  }
  throw new Error(`${label} unexpectedly succeeded for the application role`);
}

try {
  await client.connect();
  await expectDenied('DELETE FROM audit_logs', 'DELETE audit_logs');
  await expectDenied('UPDATE audit_logs SET action = action', 'UPDATE audit_logs');
  console.log('audit log is append-only for the application role');
} catch (error) {
  console.error(`audit append-only check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
