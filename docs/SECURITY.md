# Security design

This document describes the security controls implemented in the Smart
Academic Advisor, the trust boundaries, and the residual risks.

## Trust boundaries

```
Browser (React)  --HTTPS + JWT + CSRF-->  Node API  --HMAC + service token-->  Rule engine
                                              |                                     |
                                              +------------- PostgreSQL <-----------+
                                                         (pgvector)
```

- The browser has no route to the rule engine. The engine container is only on
  the private Compose network (`expose`, never `ports`).
- Only the Node API holds `ENGINE_SERVICE_TOKEN` and `ENGINE_HMAC_SECRET`.
- The engine validates the bearer token **and** the HMAC signature
  `HMAC-SHA256(secret, timestamp + "." + rawBody)` on every request, and rejects
  timestamps outside a small clock window.
- The frontend receives no database credentials and no service secrets.

## Authentication

### Passwords

- Argon2id, memory 19 MiB, time cost 2, parallelism 1.
- Policy: 12–128 characters with lower case, upper case, digit and symbol.
- Identical error text and timing shape for unknown accounts and wrong
  passwords.
- Passwords, hashes and reset tokens never appear in responses, audit records
  or logs.
- Temporary passwords for imported/admin-created users are generated randomly,
  stored only as a hash and delivered out of band; the account is flagged
  `must_change_password`.

### Access tokens

- JWT HS256, lifetime ≤ 15 minutes (`ACCESS_TOKEN_TTL_SECONDS`, 60–900 s).
- `iss` and `aud` are verified; the algorithm is pinned to HS256.
- Every token carries a `jti`.
- The middleware re-reads the user on every request and rejects deleted,
  inactive, suspended or role-changed accounts immediately.
- Tokens are never accepted from query strings or cookies.

### Refresh tokens and sessions

- 32 random bytes, base64url, stored only as `SHA-256(token + pepper)`.
- Delivered in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`.
- Rotated on every refresh; the old token is marked used.
- **Reuse detection**: presenting an already-used token revokes the entire
  token family and forces re-authentication.
- Sessions are listed with device/IP metadata and can be revoked individually.
- `POST /api/auth/logout-all` revokes every session for the user.
- Expired/revoked sessions are pruned by the auth service.

### Password reset

- Reset tokens are random, hashed in storage, single-use, expire after 30
  minutes by default and are bound to one user.
- `POST /api/auth/forgot-password` always returns the same message, whether or
  not the account exists.
- A successful reset revokes all refresh sessions and requires a new login.

## CSRF

Double-submit cookie:

1. The client calls `GET /api/auth/csrf`; the API sets a readable
   `csrf_token` cookie (SameSite=Strict) and returns the token.
2. Every state-changing request must send the same value in `x-csrf-token`.
3. The middleware compares cookie and header with a timing-safe comparison.

Exemptions: `POST /api/auth/login`, `POST /api/auth/refresh` and
`GET /api/auth/csrf`. Login is credential-protected and refresh is protected by
the httpOnly SameSite=Strict cookie plus rotation/reuse detection. All other
mutating routes, including logout, password reset and forgot-password, require
CSRF.

## Authorisation

- Roles: `student`, `advisor`, `admin`.
- RBAC middleware (`requireRole`) guards each router.
- Object-level authorization is enforced in services, not just routes:
  - students can only read, submit and export their own plans (foreign plan IDs
    return 404, not 403, to avoid existence leaks);
  - advisors can only read plans/students assigned to them;
  - office-hour requests must match the student's assigned advisor;
  - admins cannot use student/advisor endpoints.
- No endpoint accepts a `student_id`, `user_id` or `advisor_id` from the body
  to decide "who am I"; identity always comes from the access token.

## Input handling

- Every request body, query and route param is parsed by a `.strict()` Zod
  schema. Unknown keys are rejected (mass-assignment guard).
- All SQL uses parameter placeholders. Dynamic `ORDER BY` is limited to a
  whitelist; dynamic `LIKE` patterns escape `%`, `_` and `\`.
- Free-text fields (notes, escalation text, office-hour location, names) are
  sanitized to strip HTML tags and control characters.
- JSON bodies are limited to 100 kB; CSV uploads are limited to 5 MB, one file,
  `.csv` extension and a text/csv MIME type, and null bytes are rejected.
- CSV imports cap at 5,000 rows, validate headers, and record per-row errors
  without aborting the whole file.
- CSV exports escape formula-leading cells (`=`, `+`, `-`, `@`) to prevent
  spreadsheet formula injection.
- PDFs are generated server-side from stored data; the download filename is
  derived from a UUID, never from user input.

## Output handling

- Responses are JSON; there is no server-side HTML rendering.
- A single serializer strips `password_hash`, refresh-token hashes and reset
  tokens from user objects.
- Errors return `{ error: { code, message, correlationId } }`; unexpected errors
  become a generic 500 and never include stack traces or SQL.
- Logs redact email addresses, phone numbers, student codes and token-like
  values via the pino redaction configuration.
- Helmet sets CSP (`default-src 'none'`), `frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS
  with preload in production.

## Rate limiting and abuse control

| Bucket | Window | Default limit |
| --- | --- | --- |
| General | 1 min | 300 |
| Auth | 15 min | 10 |
| Chat | 1 min | 20 |
| Import | 1 hour | 5 |
| Export | 1 min | 10 |

Limits use draft-7 `RateLimit` headers and return 429 with a stable error code.
In tests the limiters are skipped unless `TEST_RATE_LIMIT=true`.

## Audit logging

- `audit_logs` is append-only.
- The application role has `SELECT`/`INSERT` only; `UPDATE` and `DELETE` are
  revoked.
- A trigger rejects `UPDATE`/`DELETE` even for roles that later receive the
  grant, so history cannot be rewritten from the application.
- Audited actions include login/logout, password change/reset, session
  revocation, user/role changes, imports, plan generation/submission/review,
  escalation changes, anomaly resolution/reopen, and plan exports.
- Admin actions record actor, target, IP and correlation ID.

## Secrets and configuration

- Environment is validated at boot with Zod; missing or too-short secrets fail
  fast.
- `.env` is git-ignored; only `.env.example` is committed.
- Production rejects known development secrets and requires the engine HMAC
  secret to be at least 32 characters.
- No secret is baked into a Docker image; Compose passes them at runtime.
- Rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_PEPPER`, `ENGINE_SERVICE_TOKEN`,
  `ENGINE_HMAC_SECRET`, `QR_SIGNING_SECRET` and `DB_APP_PASSWORD` on a schedule
  and immediately after any suspected exposure.

## Database

- Runtime uses `smart_advisor_app`, a login role with DML only on application
  tables, no `SUPERUSER`, no `CREATEDB`, no `CREATEROLE`, and no DDL.
- Migrations run as a separate owner role via `MIGRATION_DATABASE_URL`.
- `pgcrypto` is available for `gen_random_uuid()`; `citext` for email.
- UUID primary keys prevent enumeration. All FKs are indexed.
- Connection pool is bounded (`DB_POOL_MAX`, max 50).
- Backups and the pgvector extension are infrastructure concerns; see README.

## Rule engine boundary

- Service token comparison is timing-safe.
- HMAC covers the raw request body and a timestamp; replayed requests outside
  the window are rejected.
- The engine has its own request timeout and returns structured errors without
  internal details.
- The engine does not accept user-supplied SQL, file paths or template strings.
- RAG retrieval is read-only over stored bylaw chunks; retrieved text never
  becomes an instruction.

## Frontend integration contract

- Access token is held in memory; refresh uses the httpOnly cookie.
- The client must fetch `/api/auth/csrf` and echo `x-csrf-token` on mutating
  calls.
- The client must never call the engine directly and must treat all plan output
  as `DRAFT`/advisory.
- On 401 the client should attempt one refresh, then send the user to login.

## Verification

- Integration tests cover RBAC, object-level authorization, CSRF, JWT tampering,
  suspension, SQL injection attempts, XSS sanitization, formula injection and
  token leakage.
- `backend-api/scripts/check-audit-append-only.mjs` asserts that the app role
  cannot `UPDATE`/`DELETE` audit rows; CI runs it after migrations.
- `scripts/validate-data.mjs` verifies that the shipped PDF matches the stored
  policy checksum, so citations cannot silently drift.

## Residual risks and follow-ups

1. Argon2 parameters should be reviewed on the production host; the current
   values are the OWASP minimum for interactive login.
2. Email delivery is Mailhog locally; production must use an authenticated SMTP
   relay with TLS.
3. TLS termination is assumed at a reverse proxy. Set `COOKIE_SECURE=true` and
   do not expose port 4000 directly.
4. The in-memory rate-limit store is per instance; a multi-instance deployment
   should use a shared store (Redis) for auth and import buckets.
5. RAG confidence thresholds need tuning against real student questions before
   relying on the escalation rate.
6. The bylaw extraction is OCR-based; the data anomalies listed in
   `docs/data-anomalies.md` remain open until the college confirms them.
7. Backup encryption, key management and SIEM shipping are deployment
   responsibilities outside this repository.
