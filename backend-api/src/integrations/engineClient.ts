import { env } from '../config/env';
import { logger } from '../config/logger';
import { hmacSignature, safeEqual } from '../utils/crypto';
import { AppError } from '../utils/errors';

export type EngineRequest =
  | { path: '/engine/eligibility'; body: Record<string, unknown> }
  | { path: '/engine/eligibility/bulk'; body: Record<string, unknown> }
  | { path: '/engine/plan'; body: Record<string, unknown> }
  | { path: '/engine/gpa/simulate'; body: Record<string, unknown> }
  | { path: '/engine/standing'; body: Record<string, unknown> }
  | { path: '/engine/graduation-audit'; body: Record<string, unknown> }
  | { path: '/engine/whatif'; body: Record<string, unknown> }
  | { path: '/engine/early-warning'; body: Record<string, unknown> }
  | { path: '/engine/rag/ask'; body: Record<string, unknown> };

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;
const MAX_RETRIES = 2;

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const circuit: CircuitState = { failures: 0, openedAt: null };

function circuitOpen(): boolean {
  if (circuit.openedAt === null) return false;
  if (Date.now() - circuit.openedAt >= CIRCUIT_RESET_MS) {
    circuit.openedAt = null;
    circuit.failures = 0;
    return false;
  }
  return true;
}

function recordFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.openedAt = Date.now();
    logger.error('rule engine circuit opened');
  }
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.openedAt = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const payload = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${env.ENGINE_SERVICE_TOKEN}`,
    'x-engine-timestamp': timestamp,
    'x-correlation-id': crypto.randomUUID(),
  };
  if (env.ENGINE_HMAC_SECRET) {
    headers['x-engine-signature'] = hmacSignature(env.ENGINE_HMAC_SECRET, `${timestamp}.${payload}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ENGINE_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.ENGINE_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      // Never forward engine internals to the client.
      logger.warn({ status: response.status, path }, 'rule engine returned an error');
      throw new Error(`engine_http_${response.status}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('engine_invalid_json');
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function enginePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (circuitOpen()) {
    throw AppError.serviceUnavailable(
      'ENGINE_UNAVAILABLE',
      'The academic rules engine is temporarily unavailable. Please try again shortly.',
    );
  }
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await postOnce<T>(path, body);
      recordSuccess();
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(150 * 2 ** attempt);
      }
    }
  }
  recordFailure();
  logger.error({ err: lastError, path }, 'rule engine request failed');
  throw AppError.serviceUnavailable(
    'ENGINE_UNAVAILABLE',
    'The academic rules engine is unavailable. Please try again shortly.',
  );
}

export interface EngineHealth {
  status: string;
  engine_version: string;
  regulation_loaded: boolean;
  policy_chunks: number;
  database: boolean;
}

export async function engineHealth(): Promise<EngineHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${env.ENGINE_URL.replace(/\/$/, '')}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as EngineHealth;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const engineClient = {
  eligibility: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/eligibility', body),
  bulkEligibility: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/eligibility/bulk', body),
  plan: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/plan', body),
  gpaSimulate: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/gpa/simulate', body),
  standing: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/standing', body),
  graduationAudit: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/graduation-audit', body),
  whatIf: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/whatif', body),
  earlyWarning: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/early-warning', body),
  ask: <T>(body: Record<string, unknown>) => enginePost<T>('/engine/rag/ask', body),
  health: engineHealth,
  _internal: { circuit, recordFailure, recordSuccess, safeEqual },
};
