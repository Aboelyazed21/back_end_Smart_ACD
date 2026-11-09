import { one, query } from '../config/db';

const VOLATILE_TABLES = [
  'refresh_tokens',
  'password_resets',
  'audit_logs',
  'escalation_events',
  'escalations',
  'study_plan_items',
  'study_plans',
  'eligibility_checks',
  'notifications',
  'office_hour_requests',
  'advising_notes',
  'chat_messages',
  'chat_sessions',
  'import_row_errors',
  'import_jobs',
];

/**
 * Restores the database to the state produced by `npm run seed` while keeping
 * the expensive reference data (courses, programs, rules) in place. Each test
 * file starts from this baseline, which keeps suites independent without
 * re-hashing the demo accounts on every run.
 */
export async function resetDatabase(): Promise<void> {
  const seeded = await one<{ courses: string }>('SELECT count(*)::text AS courses FROM courses');
  if (Number(seeded?.courses ?? 0) < 50) {
    throw new Error(
      'The test database is not seeded. Run migrations and `SEED_DEMO=true npm run seed` ' +
        'against TEST_DATABASE_URL before running the Jest suite.',
    );
  }
  await query(`TRUNCATE TABLE ${VOLATILE_TABLES.join(', ')} CASCADE`);
  await query(`DELETE FROM office_hour_slots WHERE location LIKE 'Test%'`);
  await query(`DELETE FROM users WHERE email LIKE 'test-%' OR email LIKE 'import-%'`);
  await query(`DELETE FROM courses WHERE code LIKE 'TST%'`);
  await query(`DELETE FROM departments WHERE code LIKE 'ZZ%'`);
  await query(
    `UPDATE data_anomalies
        SET status = 'open', resolved_value = NULL, resolved_by = NULL, resolved_at = NULL
      WHERE status <> 'open'`,
  );
}
