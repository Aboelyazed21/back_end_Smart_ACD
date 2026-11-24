/* eslint-disable */
/**
 * Chat sessions are owned by an authenticated user (student, advisor or admin),
 * not only by a student record. The chat service already reads and writes
 * chat_sessions.user_id, but the initial schema only created student_id, so a
 * freshly migrated database could not create or list any chat session.
 *
 * Keep this additive and idempotent: databases that already carry the column
 * are untouched, and existing sessions are backfilled from their student id.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE chat_sessions ALTER COLUMN student_id DROP NOT NULL;

    ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS user_id uuid;
    UPDATE chat_sessions SET user_id = student_id WHERE user_id IS NULL;
    ALTER TABLE chat_sessions ALTER COLUMN user_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions(user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS chat_sessions_user_idx;
    ALTER TABLE chat_sessions DROP COLUMN IF EXISTS user_id;
    ALTER TABLE chat_sessions ALTER COLUMN student_id SET NOT NULL;
  `);
};
