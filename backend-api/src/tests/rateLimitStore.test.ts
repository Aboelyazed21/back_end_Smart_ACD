/* eslint-disable @typescript-eslint/no-require-imports -- isolateModules must re-import with fresh env */
import express from 'express';
import request from 'supertest';

import * as db from '../config/db';
import { logger } from '../config/logger';
import { PostgresRateLimitStore } from '../middlewares/pgRateLimitStore';

const ENV_KEYS = ['RATE_LIMIT_STORE', 'RATE_LIMIT_MAX', 'TEST_RATE_LIMIT'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>;

let querySpy: jest.SpyInstance;

describe('shared rate-limit store', () => {
  beforeEach(() => {
    querySpy = jest.spyOn(db, 'query');
    querySpy.mockResolvedValue({ rows: [] } as never);
  });

  afterEach(() => {
    querySpy.mockRestore();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  describe('PostgresRateLimitStore', () => {
    it('maps the upserted counter and the reset time', async () => {
      const resetAt = new Date('2026-12-01T10:00:00.000Z');
      querySpy.mockResolvedValue({ rows: [{ count: 4, reset_at: resetAt }] } as never);

      const info = await new PostgresRateLimitStore('auth', 900).increment('1.2.3.4');

      expect(info).toEqual({ totalHits: 4, resetTime: resetAt });
      expect(querySpy.mock.calls[0][0]).toContain('INSERT INTO rate_limit_hits');
      expect(querySpy.mock.calls[0][1]).toEqual(['auth:1.2.3.4', '900 seconds']);
      expect(querySpy.mock.calls[1][0]).toContain('DELETE FROM rate_limit_hits WHERE reset_at');
    });

    it('counts one hit when the upsert returns no row', async () => {
      const info = await new PostgresRateLimitStore('auth', 60).increment('new-key');

      expect(info).toEqual({ totalHits: 1, resetTime: undefined });
    });

    it('prunes at most once every five minutes', async () => {
      const store = new PostgresRateLimitStore('auth', 60);

      await store.increment('first');
      const callsAfterFirst = querySpy.mock.calls.length;
      await store.increment('second');

      expect(querySpy.mock.calls.length).toBe(callsAfterFirst + 1);
      expect(querySpy.mock.calls[callsAfterFirst][0]).toContain('INSERT INTO rate_limit_hits');
    });

    it('logs instead of failing when the opportunistic prune fails', async () => {
      querySpy.mockImplementation((sql: string) =>
        sql.includes('DELETE FROM rate_limit_hits WHERE reset_at')
          ? Promise.reject(new Error('prune failed'))
          : Promise.resolve({ rows: [{ count: 1, reset_at: new Date() }] }),
      );
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

      await new PostgresRateLimitStore('auth', 60).increment('key');
      await new Promise((resolve) => setImmediate(resolve));

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('decrements without going below zero', async () => {
      await new PostgresRateLimitStore('auth', 60).decrement('key');

      expect(querySpy.mock.calls[0][0]).toContain('GREATEST(count - 1, 0)');
      expect(querySpy.mock.calls[0][1]).toEqual(['auth:key']);
    });

    it('resets one key with its prefix and all keys without one', async () => {
      const store = new PostgresRateLimitStore('auth', 60);

      await store.resetKey('key');
      expect(querySpy.mock.calls[0][0]).toContain('DELETE FROM rate_limit_hits WHERE key = $1');
      expect(querySpy.mock.calls[0][1]).toEqual(['auth:key']);

      await store.resetAll();
      expect(querySpy.mock.calls[1][0]).toBe('DELETE FROM rate_limit_hits');
    });

    it('initialises without touching the database', () => {
      expect(() => new PostgresRateLimitStore('auth').init()).not.toThrow();
      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  describe('limiter configuration', () => {
    it('uses the shared Postgres counter when RATE_LIMIT_STORE=postgres', async () => {
      process.env.RATE_LIMIT_STORE = 'postgres';
      process.env.RATE_LIMIT_MAX = '5';
      process.env.TEST_RATE_LIMIT = 'true';

      let limiter: express.RequestHandler = () => undefined;
      let sharedQuery: jest.SpyInstance | undefined;
      jest.isolateModules(() => {
        // Spy on the database module inside the isolated registry the store uses.
        const freshDb = require('../config/db');
        sharedQuery = jest
          .spyOn(freshDb, 'query')
          .mockResolvedValue({ rows: [{ count: 1, reset_at: new Date() }] });
        ({ generalLimiter: limiter } = require('../middlewares/rateLimit'));
      });

      const app = express();
      app.use(limiter);
      app.get('/probe', (_req, res) => res.json({ ok: true }));
      const res = await request(app).get('/probe');

      expect(res.status).toBe(200);
      expect(sharedQuery).toHaveBeenCalled();
      expect(sharedQuery?.mock.calls[0][0]).toContain('INSERT INTO rate_limit_hits');
    });

    it('rejects with 429 once the local budget is exhausted', async () => {
      process.env.RATE_LIMIT_STORE = 'memory';
      process.env.RATE_LIMIT_MAX = '2';
      process.env.TEST_RATE_LIMIT = 'true';

      let app!: express.Express;
      jest.isolateModules(() => {
        // Load the error handler in the same registry so AppError instanceof works.
        const { attachContext: attach } = require('../middlewares/context');
        const { errorHandler: handleError } = require('../middlewares/errorHandler');
        const { generalLimiter } = require('../middlewares/rateLimit');
        app = express();
        app.use(attach);
        app.use(generalLimiter);
        app.get('/probe', (_req: express.Request, res: express.Response) => res.json({ ok: true }));
        app.use(handleError);
      });

      expect((await request(app).get('/probe')).status).toBe(200);
      expect((await request(app).get('/probe')).status).toBe(200);
      const blocked = await request(app).get('/probe');

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(querySpy).not.toHaveBeenCalled();
    });
  });
});
