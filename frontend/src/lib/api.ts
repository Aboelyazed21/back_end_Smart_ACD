import i18n from '../i18n';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  correlationId: string | null;
  retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = {},
    correlationId: string | null = null,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
    this.retryAfter = retryAfter;
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function clearSessionTokens(): void {
  accessToken = null;
  csrfToken = null;
}

function cookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function currentCsrfToken(): string | null {
  return csrfToken ?? cookieValue('csrf_token');
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the automatic refresh-and-retry on 401 (used by auth bootstrap). */
  skipRefresh?: boolean;
  /** Raw body (FormData / Blob) instead of JSON. */
  rawBody?: BodyInit | null;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  if (type.includes('application/pdf') || type.includes('octet-stream')) return res.blob();
  return res.text();
}

async function toApiError(res: Response): Promise<ApiError> {
  let payload: any = null;
  try {
    payload = await parseBody(res);
  } catch {
    payload = null;
  }
  const error = payload && typeof payload === 'object' ? payload.error : null;
  const retryAfter = Number(res.headers.get('retry-after') ?? '');
  return new ApiError(
    res.status,
    error?.code ?? `HTTP_${res.status}`,
    error?.message ?? res.statusText ?? 'Request failed',
    error?.details ?? {},
    error?.correlationId ?? res.headers.get('x-correlation-id'),
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  );
}

async function ensureCsrf(): Promise<string> {
  const existing = currentCsrfToken();
  if (existing) {
    csrfToken = existing;
    return existing;
  }
  const res = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw await toApiError(res);
  const payload = (await parseBody(res)) as { csrfToken?: string };
  if (!payload?.csrfToken) {
    throw new ApiError(500, 'CSRF_BOOTSTRAP_FAILED', 'Could not establish a CSRF token');
  }
  csrfToken = payload.csrfToken;
  return csrfToken;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          clearSessionTokens();
          return false;
        }
        const payload = (await res.json()) as { accessToken?: string; csrfToken?: string };
        if (!payload.accessToken) {
          clearSessionTokens();
          return false;
        }
        accessToken = payload.accessToken;
        csrfToken = payload.csrfToken ?? currentCsrfToken();
        return true;
      } catch {
        clearSessionTokens();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Exposed so the auth provider can bootstrap the session on first paint. */
export const refreshAccessToken = refreshSession;

async function execute(path: string, options: RequestOptions, retried = false): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(options.headers);
  headers.set('accept', options.rawBody ? '*/*' : 'application/json');

  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (isMutation) headers.set('x-csrf-token', await ensureCsrf());
  if (options.body !== undefined && !options.rawBody) headers.set('content-type', JSON_HEADERS['content-type']);

  const res = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  if (res.status === 401 && !retried && !options.skipRefresh && accessToken) {
    const refreshed = await refreshSession();
    if (refreshed) return execute(path, options, true);
  }
  if (res.status === 403 && isMutation && !retried) {
    // A stale CSRF cookie (e.g. after a server restart) can be retried once.
    csrfToken = null;
    if (!retried && accessToken) return execute(path, options, true);
  }
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await execute(path, options);
  if (!res.ok) throw await toApiError(res);
  return (await parseBody(res)) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await execute(path, { headers: { accept: 'application/pdf' } });
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED') {
      return i18n.t('طلبات كثيرة جدًا. حاول بعد {{count}} ثانية.', { count: error.retryAfter ?? 60 });
    }
    if (Array.isArray(error.details) && error.details.length > 0) {
      const first = error.details[0] as { path?: string; message?: string };
      return first?.message ? `${error.message} (${first.path ?? ''}: ${first.message})` : error.message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return i18n.t('حدث خطأ غير متوقع.');
}
