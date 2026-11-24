/* eslint-disable */
/**
 * Operational additions:
 *  - notifications.created_by: attributes admin announcements to their author.
 *  - rate_limit_hits: shared, database-backed rate-limit counters so a
 *    multi-instance deployment enforces one budget (RATE_LIMIT_STORE=postgres).
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS notifications_created_by_idx ON notifications(created_by)
      WHERE created_by IS NOT NULL;

    CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(type, created_at DESC);

    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key text PRIMARY KEY,
      count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
      reset_at timestamptz NOT NULL
    );

    CREATE INDEX IF NOT EXISTS rate_limit_hits_reset_idx ON rate_limit_hits(reset_at);

    -- Lets the rule engine re-embed policy chunks when the Arabic
    -- normalisation/embedding changes, without a manual re-ingest step.
    CREATE TABLE IF NOT EXISTS engine_metadata (
      key text PRIMARY KEY,
      value text NOT NULL
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS rate_limit_hits;
    DROP TABLE IF EXISTS engine_metadata;
    DROP INDEX IF EXISTS notifications_type_idx;
    DROP INDEX IF EXISTS notifications_created_by_idx;
    ALTER TABLE notifications DROP COLUMN IF EXISTS created_by;
  `);
};
