import { Router } from 'express';
import { one } from '../config/db';
import { engineHealth } from '../integrations/engineClient';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/live', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? '1.0.0',
  });
});

healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  let databaseOk = false;
  try {
    const row = await one<{ ok: number }>('SELECT 1 AS ok');
    databaseOk = row?.ok === 1;
    checks.database = { ok: databaseOk };
  } catch {
    checks.database = { ok: false, detail: 'unreachable' };
  }

  let engineOk = false;
  try {
    const health = await engineHealth();
    engineOk = Boolean(health && health.status === 'ok' && health.regulation_loaded);
    checks.engine = {
      ok: engineOk,
      detail: health ? `chunks=${health.policy_chunks}` : 'unreachable',
    };
  } catch {
    checks.engine = { ok: false, detail: 'unreachable' };
  }

  // The API can serve cached/read-only data if the engine is briefly down, so
  // readiness only strictly requires the database. Engine state is reported so
  // orchestration can surface degraded mode.
  const ready = databaseOk;
  res.status(ready ? 200 : 503).json({
    status: ready ? (engineOk ? 'ok' : 'degraded') : 'unavailable',
    checks,
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'bua-aidm-backend-api' });
});
