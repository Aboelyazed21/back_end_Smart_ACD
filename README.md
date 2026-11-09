# Smart Academic Advisor — AIDM, Badr University in Assiut

An advisory academic-planning platform built on the 2023 AIDM bylaw. It answers
eligibility, load, standing, graduation, what-if and policy questions with a
deterministic Python rule engine, cites the bylaw page for every decision, and
escalates anything the regulation does not answer unambiguously.

> **Advisory only.** Every generated plan is stored as `DRAFT` and is never a
> registration. The platform does not register students and cannot override the
> rule engine's eligibility result.

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Quick start with Docker](#quick-start-with-docker)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Demo accounts](#demo-accounts)
- [Database, migrations and seed](#database-migrations-and-seed)
- [Rule engine and RAG](#rule-engine-and-rag)
- [API](#api)
- [Testing and validation](#testing-and-validation)
- [Security](#security)
- [Regulation data and anomalies](#regulation-data-and-anomalies)
- [Project structure](#project-structure)
- [Operations](#operations)
- [Production deployment](#production-deployment)
- [Known limitations](#known-limitations)

## What it does

| Area | Capability |
| --- | --- |
| Eligibility | Per-course and bulk decisions with `ELIGIBLE`, `NOT_ELIGIBLE`, `UNKNOWN` or `REVIEW_REQUIRED`, plus `rule_code`, article, page and anomaly ids. |
| Study plans | Deterministic draft generation within the resolved credit cap, submission, advisor review and a signed PDF export with a QR code. |
| Load and probation | Min/max load, graduation-possible exception, probation working value and blocking-anomaly escalation. |
| Standing | GPA/SGPA, warnings, probation, dismissal risk, final chance and early warning. |
| Graduation | 136-credit audit, CGPA, six regular semesters, project, field training and elective pools. |
| What-if | GPA simulation, target CGPA, major-switch credit transfer estimate. |
| Policy Q&A | Extractive RAG over 539 stored bylaw chunks with citations and confidence; low confidence or open-anomaly topics escalate instead of guessing. |
| Advisor tools | Assigned-student roster, notes, plan review, office hours, requests, at-risk list and escalations. |
| Admin tools | Users, advisors, students, departments, courses, prerequisites, offerings, regulation rules, anomalies, audit logs, analytics and CSV imports. |

## Architecture

```
React 18 + TypeScript + Vite frontend (Arabic-first, RTL)
        │  same-origin /api, Bearer JWT in memory, x-csrf-token
        ▼
backend-api  (Node 20, TypeScript, Express)
        │  service token + HMAC-SHA256
        ▼
rule-engine  (Python 3.11, FastAPI, Pydantic v2)
        │
        ▼
PostgreSQL 16 + pgvector
```

- The frontend and API are served from the same origin (Vite proxy in
  development, nginx proxy in production) so the httpOnly refresh cookie works.
- Only the frontend (80/443) and the API are published. The engine is reachable
  only on the Docker Compose network.
- The engine owns all academic decisions. The API owns sessions, authorization,
  persistence, notifications and exports.
- Policy answers are retrieved from `policy_chunks`; numeric answers come from
  `regulation_rules.json` loaded by the engine.
- The engine owns all academic decisions. The API owns sessions, authorization,
  persistence, notifications and exports.
- Policy answers are retrieved from `policy_chunks`; numeric answers come from
  `regulation_rules.json` loaded by the engine.

## Quick start with Docker

Requirements: Docker Desktop with Compose v2.

```bash
cp backend-api/.env.example backend-api/.env   # optional; Compose has defaults
docker compose up --build
```

What starts:

| Service | URL | Notes |
| --- | --- | --- |
| `frontend` | http://localhost:5173 | React SPA; nginx proxies `/api` and `/health` to the API. |
| `backend-api` | http://localhost:4000 | API; runs the idempotent seed on start. |
| `rule-engine` | not published | Internal only, `http://rule-engine:8000` on the Compose network. |
| `db` | `localhost:55433` | PostgreSQL 16 + pgvector; data in the `db-data` volume. |
| `mailhog` | http://localhost:8025 | Captures password-reset and notification email. |

The `migrate` one-shot service runs before the engine and API start. Set
`RUN_SEED=false` to skip seeding, `SEED_DEMO=false` to load reference data
without demo accounts, or `POSTGRES_PORT`/`API_PORT`/`FRONTEND_PORT` to change
host ports.

Open http://localhost:5173 and sign in with a demo account. Smoke checks:

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

## Local development

Requirements: Node 20+, Python 3.11+, PostgreSQL 16+ with pgvector, and npm.

### 1. Database

Create two databases (runtime and tests) and enable pgvector:

```sql
CREATE DATABASE smart_advisor;
CREATE DATABASE smart_advisor_test;
\c smart_advisor
CREATE EXTENSION IF NOT EXISTS vector;
\c smart_advisor_test
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Rule engine

```bash
cd rule-engine
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The engine loads `regulation-data/` and ingests policy chunks into pgvector on
start-up when `DATABASE_URL` is set. Health: `curl http://127.0.0.1:8001/health`.

### 3. Backend API

```bash
cd backend-api
cp .env.example .env      # edit DATABASE_URL / MIGRATION_DATABASE_URL and secrets
npm ci
npm run build
npm run migrate:up        # owner role from MIGRATION_DATABASE_URL
npm run seed              # idempotent; safe to run again
npm run dev               # http://localhost:4000
```

The runtime uses the least-privilege `smart_advisor_app` role created by the
migration with the password from `DB_APP_PASSWORD`. Migrations must use an owner
role through `MIGRATION_DATABASE_URL`.

### 4. Frontend

```bash
cd frontend
npm ci
npm run dev              # http://localhost:5173
```

The dev server proxies `/api` and `/health` to `http://localhost:4000`, keeping
the same-origin contract required by the refresh cookie and CSRF token. The
access token lives in memory only; a page reload bootstraps the session with
`POST /api/auth/refresh` followed by `GET /api/auth/me`.

Production build:

```bash
npm run build            # tsc --noEmit && vite build -> frontend/dist
```

The `frontend/Dockerfile` builds the SPA and serves it through nginx, which also
proxies `/api` and `/health` and applies SPA fallback plus security/cache
headers.

## Environment variables

Copy `backend-api/.env.example`. Required values have no production defaults.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime connection string for `smart_advisor_app`. |
| `MIGRATION_DATABASE_URL` | Owner connection string, used only by migrations. |
| `DB_APP_PASSWORD` | Password assigned to the app role by the migration. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_PEPPER` | ≥ 32 characters each; fail-fast in production. |
| `ACCESS_TOKEN_TTL_SECONDS` | 60–900; default 900 (15 min). |
| `REFRESH_TOKEN_TTL_DAYS` | 1–30; default 7. |
| `ENGINE_URL`, `ENGINE_SERVICE_TOKEN`, `ENGINE_HMAC_SECRET` | Engine endpoint and shared secrets. |
| `ALLOWED_EMAIL_DOMAIN` | Restricts institutional email addresses. |
| `CORS_ORIGINS` | Comma-separated frontend origins. |
| `COOKIE_SECURE` | Must be `true` behind HTTPS in production. |
| `QR_SIGNING_SECRET` | Signs exported-plan QR tokens. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Mail delivery (Mailhog locally). |
| `RUN_MIGRATIONS`, `RUN_SEED`, `SEED_DEMO` | Container bootstrap behaviour. |
| `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `CHAT_RATE_LIMIT_MAX`, `IMPORT_RATE_LIMIT_MAX`, `EXPORT_RATE_LIMIT_MAX` | Per-bucket limits. |
| `REGULATION_DATA_DIR` | Overrides the regulation data directory. |

The engine reads `APP_ENV`, `ENGINE_SERVICE_TOKEN`, `ENGINE_HMAC_SECRET`,
`DATABASE_URL`, `REGULATION_DATA_DIR`, `POLICY_INGEST_ON_START`,
`RAG_MIN_CONFIDENCE`, `RAG_TOP_K`, `EMBEDDING_DIM` and `LOG_LEVEL`.

## Demo accounts

Local seeds create these accounts with password **`ChangeMe!2026`**:

| Email | Role |
| --- | --- |
| `admin@bua.edu.eg` | admin |
| `advisor1@aidm.bua.edu.eg`, `advisor2@aidm.bua.edu.eg` | advisor |
| `student1@aidm.bua.edu.eg` … `student6@aidm.bua.edu.eg` | student |

The students cover different programs and edge cases (failed prerequisites,
probation, graduation-eligible). Demo data is skipped in production unless
`SEED_DEMO=true` is set explicitly.

## Database, migrations and seed

- Migration: `db/migrations/1700000000000_init.js` creates 36 tables, checks,
  triggers, indexes, the append-only audit log and the app role.
- ERD: [`docs/ERD.md`](docs/ERD.md) has five domain diagrams plus a 36-table
  catalog; [`docs/erd.mmd`](docs/erd.mmd) is the full single Mermaid diagram.
- The migration creates `pgvector` when available and fails in production if the
  extension cannot be installed.
- The seed loads 104 courses, 4 programs, 25 regulation rules, 27 anomalies,
  recommended plans, elective pools, engine offerings, 6 students and 2
  advisors. It is idempotent:

```bash
npm run seed
npm run seed   # must leave counts unchanged
```

- To reset a local database, drop and recreate it, then run `npm run migrate:up`
  and `npm run seed`.

## Rule engine and RAG

- Rules and reference data live in `regulation-data/`.
- `POST /engine/eligibility`, `/eligibility/bulk`, `/plan`, `/gpa/simulate`,
  `/standing`, `/graduation-audit`, `/whatif`, `/early-warning` and
  `/rag/ask` are internal and require the service token + HMAC.
- RAG is **extractive**: 384-dimensional lexical-hashing embeddings over
  Arabic-normalised text, cosine search in pgvector, and an in-memory fallback
  for tests. Answers always include citations (`chunk_id`, article, clause, page,
  source) and a confidence score.
- Below `RAG_MIN_CONFIDENCE` (default 0.32), or when the question touches an open
  anomaly, the engine returns an escalation instead of an answer.
- Policy chunks are built from article/clause/table boundaries with
  `scripts/ingest_policy.py`; the stored checksum must match the shipped PDF.

## API

- Base path: `/api`; health at `/health/live` and `/health/ready`.
- OpenAPI 3.1 (Swagger-compatible): [`docs/openapi.yaml`](docs/openapi.yaml) —
  open it in Swagger Editor/UI or import it into Postman.
- Postman collection: [`docs/postman_collection.json`](docs/postman_collection.json)
  (set `baseUrl`, run `Auth / CSRF`, then `Auth / Login`).
- Successful payloads are `{ "data": ... }`; lists add pagination.
- Errors are `{ "error": { "code", "message", "details?", "correlationId" } }`.
- Send `x-csrf-token` on every state-changing request except login/refresh.

| Group | Highlights |
| --- | --- |
| Auth | CSRF, login, refresh, logout, logout-all, me, change/forgot/reset password, sessions. |
| Student | profile, dashboard, enrollments, recommended plan, eligibility, standing, early warning, graduation audit, GPA simulation, what-if, plans + submit + PDF export, advisor, office hours, notifications. |
| Advisor | dashboard, assigned students, standing/eligibility/graduation/early warning, notes, plans + review, office hours + requests, escalations. |
| Admin | users, advisors, students, departments, courses, prerequisites, offerings, anomalies + resolve/reopen, rules, audit logs, escalations, analytics, CSV imports. |
| Chat | RAG sessions and messages with citations and escalation. |

## Testing and validation

```bash
# Regulation data (no database required)
node scripts/validate-data.mjs

# OpenAPI contract and Postman collection
python scripts/check-openapi.py     # refs resolve, no duplicate keys
python scripts/gen-postman.py       # regenerate docs/postman_collection.json

# Backend type-check, lint, format
cd backend-api
npx tsc --noEmit
npm run lint
npm run format

# Backend integration tests (needs migrated + seeded smart_advisor_test)
npm test
npm run test:coverage

# Engine
cd ../rule-engine
pytest
ruff check app tests

# Frontend
cd ../frontend
npm run typecheck
npm run lint
npm test
npm run build

# Live frontend/API contract (API + engine + database running)
cd ..
node scripts/verify-frontend.mjs

# End-to-end smoke test (API + engine + database running)
node scripts/smoke.mjs
```

- Backend coverage gate: 80% for statements, branches, functions and lines.
- Engine coverage gate: 80%.
- `scripts/verify-frontend.mjs` logs in as student, advisor and admin and checks
  all 52 read endpoints the UI calls, including payload envelopes and RBAC.
- Jest uses a fake engine that validates the bearer token and HMAC, so the
  backend suite runs without Python.
- CI (`.github/workflows/ci.yml`) runs data validation, engine lint/tests,
  backend type-check/lint/format/build, migrations, seed twice for idempotency,
  the audit append-only check, backend coverage, frontend
  type-check/lint/tests/build, and builds all three Docker images.

## Security

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full design. Summary:

- Argon2id passwords; 12–128 char policy; no hash/token leakage.
- 15-minute JWT access tokens; rotating hashed refresh tokens with reuse
  detection; httpOnly SameSite=Strict cookie.
- CSRF double-submit on all mutating routes except login/refresh/CSRF bootstrap.
- RBAC plus object-level authorization; foreign plan IDs return 404.
- Zod `.strict()` everywhere; parameterized SQL; whitelisted `ORDER BY`;
  LIKE escaping; CSV formula-injection guards; HTML/control-character
  sanitization.
- Helmet CSP/HSTS, CORS allow-list, per-bucket rate limits, request timeouts.
- Least-privilege DB role; append-only audit log enforced by grants and a
  trigger.
- Signed QR tokens on plan PDF exports.

## Regulation data and anomalies

The extraction is OCR-based. Twenty-seven anomalies are treated as data, not
silently corrected. Blocking anomalies force `REVIEW_REQUIRED` and an automatic
escalation; warnings are evaluated with a working value and flagged. See
[`docs/data-anomalies.md`](docs/data-anomalies.md) and the open questions in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

Regenerate the anomaly register after editing the JSON:

```bash
node scripts/gen-anomaly-doc.mjs
```

## Project structure

```
frontend/               React 18 + TypeScript + Vite SPA (Arabic-first, RTL)
backend-api/            Node API (src/app.ts, modules, services, tests)
db/migrations/          node-pg-migrate schema
rule-engine/            FastAPI app, rules, RAG, pytest suite
regulation-data/        Courses, programs, rules, anomalies, chunks, PDF
scripts/                data validation, OpenAPI/Postman, ERD helpers, smoke, contract checks
docs/                   OpenAPI, Postman, ERD, security, decisions, anomalies, review
docker-compose.yml      db + mailhog + migrate + engine + API + frontend
.github/workflows/      CI
```

## Operations

- **Health:** `/health/live` (process) and `/health/ready` (database + engine).
- **Logs:** pino JSON with correlation ids; sensitive values redacted.
- **Backups:** back up PostgreSQL including the `vector` extension. Restore with
  the same major version and pgvector build.
- **Scaling:** the API is stateless apart from the database. Use a shared rate
  limit store if you run more than one instance. Keep the engine internal.
- **Migrations:** run the `migrate` service or `npm run migrate:up` before
  rolling out a new API image. Never point `MIGRATION_DATABASE_URL` at the app
  role.
- **Secrets:** rotate JWT, engine, QR and DB passwords after any exposure;
  production rejects known development defaults.

## Production deployment

Recommended topology: one Linux server running the Compose stack behind HTTPS.

1. Copy the repository and create `.env` from the production template; set
   `NODE_ENV=production`, `COOKIE_SECURE=true`, `SEED_DEMO=false`, real
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_PEPPER`, `ENGINE_SERVICE_TOKEN`,
   `ENGINE_HMAC_SECRET`, `QR_SIGNING_SECRET`, `DB_APP_PASSWORD` and SMTP
   settings.
2. Run `docker compose up -d --build`. Only `frontend` (80/443) should be
   reachable from outside; `db` and `rule-engine` stay on the internal network.
3. Put a TLS-terminating reverse proxy (or the platform load balancer) in front
   of the frontend and forward `X-Forwarded-*`; set `TRUST_PROXY=true` on the
   API.
4. Run the one-shot `migrate` service before rolling out a new API image and
   back up PostgreSQL (including pgvector) on a schedule.
5. Verify `/health/live`, `/health/ready` and `node scripts/verify-frontend.mjs`.

The API is stateless apart from PostgreSQL, so multiple replicas work if rate
limiting moves to a shared store. The engine stays internal and is never
published directly.

## Known limitations

- OCR data needs college confirmation; the open ambiguities are listed in
  `docs/DECISIONS.md`.
- Docker Compose could not be executed on the original build machine (no Docker
  CLI); images and the Compose file are built/validated in CI instead.
- The RAG confidence threshold needs calibration against real questions.
- Email uses Mailhog locally; production needs an authenticated SMTP relay.
- Rate limiting is in-memory per instance; use a shared store for horizontal
  scaling.
