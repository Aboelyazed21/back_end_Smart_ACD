import { query } from '../config/db';
import { logger } from '../config/logger';

export interface RateLimitInfo {
  totalHits: number;
  resetTime: Date | undefined;
}

/**
 * Database-backed counter store so every API instance shares one budget.
 *
 * The increment is a single atomic upsert: a window that already expired is
 * reset in place, otherwise the counter is bumped. The table is trimmed
 * opportunistically so it stays small without a scheduled job.
 */
export class PostgresRateLimitStore {
  private lastPrune = 0;

  constructor(
    readonly prefix: string,
    private windowSeconds = 60,
  ) {}

  init(): void {
    // Nothing to prepare; the table is created by the migration.
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const row = await query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limit_hits (key, count, reset_at)
       VALUES ($1, 1, now() + $2::interval)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.count + 1 END,
         reset_at = CASE WHEN rate_limit_hits.reset_at <= now()
                         THEN now() + $2::interval
                         ELSE rate_limit_hits.reset_at END
       RETURNING count, reset_at`,
      [`${this.prefix}:${key}`, `${this.windowSeconds} seconds`],
    );
    this.pruneOccasionally();
    const rowValue = row.rows[0];
    return {
      totalHits: Number(rowValue?.count ?? 1),
      resetTime: rowValue?.reset_at ? new Date(rowValue.reset_at) : undefined,
    };
  }

  async decrement(key: string): Promise<void> {
    await query('UPDATE rate_limit_hits SET count = GREATEST(count - 1, 0) WHERE key = $1', [
      `${this.prefix}:${key}`,
    ]);
  }

  async resetKey(key: string): Promise<void> {
    await query('DELETE FROM rate_limit_hits WHERE key = $1', [`${this.prefix}:${key}`]);
  }

  async resetAll(): Promise<void> {
    await query('DELETE FROM rate_limit_hits');
  }

  private pruneOccasionally(): void {
    const now = Date.now();
    if (now - this.lastPrune < 5 * 60_000) return;
    this.lastPrune = now;
    void query("DELETE FROM rate_limit_hits WHERE reset_at < now() - interval '1 day'").catch((error) => {
      logger.warn({ err: error }, 'failed to prune expired rate-limit counters');
    });
  }
}
