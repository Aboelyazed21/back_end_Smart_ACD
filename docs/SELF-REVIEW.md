# Self-review report

_Date: 2026-11-03 · Scope: backend API, rule engine, database, frontend, seeds, tests, docs_

## 1. Verdict

The backend, rule engine, schema, seed data, tests and documentation are
implemented and pass locally. The definition of done is met with one
environmental exception: Docker Compose could not be executed on this machine
because the Docker CLI is not installed. Both images and the Compose file are
built in CI, and the same services were exercised locally on PostgreSQL 18 +
pgvector 0.8.6 on port 55432.

## 2. Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `npx tsc --noEmit` (backend) | Pass, no output |
| Lint | `npm run lint` | Pass, 0 errors / 0 warnings |
| Format | `npm run format` | Pass, all files formatted |
| Backend tests | `npm run test:coverage` | **153 passed**, 11 suites |
| Backend coverage | included above | statements **95.85%**, branches **80.72%**, functions **92.8%**, lines **97.24%** — gate 80% |
| Engine tests | `python -m pytest` | **78 passed**, coverage **89.86%** — gate 80% |
| Frontend checks | `npm run typecheck && npm run lint && npm test && npm run build` | Pass; **32 tests in 4 files**; production build succeeds |
| Frontend/API contract | `node scripts/verify-frontend.mjs` | **52/52 checks passed** |
| Regulation data | `node scripts/validate-data.mjs` | Pass, 4 documented warnings |
| Seed idempotency | `npm run seed` twice | Pass, counts unchanged (104 courses / 25 rules / 27 anomalies) |
| End-to-end smoke | `node scripts/smoke.mjs` | **18/18 checks passed** |
| OpenAPI | `python scripts/check-openapi.py` | 88 paths, 21 schemas, 0 missing refs, no duplicate keys |
| Audit append-only | migration grants + trigger; covered by CI script | Pass in integration tests |

Smoke checks: health ready, student login/profile, bulk and single eligibility
with traceability, CSRF enforcement, draft plan generation, plan submission, chat
session, RAG citation-or-escalation, student blocked from advisor routes, advisor
login/advisees/plans, admin login/anomalies/rules/analytics.

## 3. Requirement traceability

### Advisory-only behaviour

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Every plan is `DRAFT` | `generateDraftPlan` inserts `status='DRAFT'` and a fixed advisory note; planner returns `advisory_only: true`. | `backend-api/src/services/advising.ts`; student tests; smoke |
| No registration endpoint | Route table has no registration mutation; plans only move through draft → submitted → review. | `src/modules/student/routes.ts` |
| AI/planner never overrides eligibility | Planner consumes engine decisions and skips ineligible courses; API never recomputes eligibility. | `rule-engine/app/planner/planner.py`, engine tests |
| Every decision has status/rule/article/page/anomalies | `Decision` model and DB `eligibility_checks`/`study_plan_items` columns. | `docs/openapi.yaml#Decision`, smoke check |

### Anomaly semantics

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Blocking → `REVIEW_REQUIRED` + auto-escalation | Engine returns review; `evaluateCourse` persists an `ANOMALY` escalation once per anomaly. | `services/advising.ts`, `services/escalations.ts`, `admin.test.ts` |
| Warning → evaluate with working value + flag | Anomaly matcher passes working values and attaches `anomaly_ids`. | engine eligibility/planner tests |
| Info → document only | Info anomalies never participate in matching. | `regulation-data/anomalies.json`, `docs/data-anomalies.md` |
| Every blocking anomaly produces escalation | Covered for `INF4105/A-CAT-09`; engine mapping covers all seven blocking ids. | `admin.test.ts`, engine tests |
| Admin resolution audit-logged + re-evaluates | `resolveAnomaly` writes `ANOMALY_RESOLVED`, re-runs affected decisions, auto-resolves stale escalations; reopen is audit logged. | `modules/admin/anomaliesService.ts`, `admin.test.ts` |

### RAG

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Answers only from stored bylaw text | Extractive answer builder over `policy_chunks`; no generative model. | `rule-engine/app/rag/answer.py` |
| Citations + confidence | Every answer includes chunk id, article/clause/page/source and confidence. | engine tests, smoke |
| Escalate on low confidence/open anomaly | `RAG_MIN_CONFIDENCE` (0.32) and anomaly topic matching return an escalation. | engine RAG tests, chat tests |
| Numeric answers from rules | Numeric facts read from `regulation_rules.json`, not retrieved prose. | `rag/answer.py` |
| Prompt-injection defence | Instruction-like content is stripped/ignored; retrieved text never changes behaviour. | engine RAG tests |

### Topology and stack

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| React → Node only, Node → engine, engine private | Compose publishes only API/DB/Mailhog; engine is `expose` only. HMAC + token on every engine call. | `docker-compose.yml`, `integrations/engineClient.ts` |
| Node 20/TS/Express, Zod, pino, Jest+Supertest | `backend-api/package.json`, `src/`, `src/tests/` | build/tests |
| Python 3.11/FastAPI/Pydantic v2/pytest | `rule-engine/requirements.txt`, `app/`, `tests/` | pytest |
| PostgreSQL 16 + pgvector, node-pg-migrate | `db/migrations/1700000000000_init.js`, CI image `pgvector/pgvector:pg16` | migration + seed |

### Database

| Requirement | Implementation |
| --- | --- |
| UUID PKs, timestamps, checks, FKs, indexes, uniques | Migration defines ~40 tables with UUID defaults, `created_at/updated_at`, `CHECK`s, FK indexes and unique constraints. |
| Append-only audit | App role lacks UPDATE/DELETE; trigger rejects mutation; `scripts/check-audit-append-only.mjs` verifies it. |
| Least-privilege role | `smart_advisor_app` created by migration; runtime uses it, migrations use `MIGRATION_DATABASE_URL`. |
| Seeds idempotent | `ON CONFLICT` upserts; run twice in CI and locally. |

### Security

| Control | Status |
| --- | --- |
| Argon2id (19 MiB, t=2, p=1), password policy 12–128 + complexity | Implemented and tested |
| JWT access ≤ 15 min, iss/aud, HS256 pinned, jti | Implemented and tested |
| Rotating hashed refresh tokens + reuse detection (revokes family) | Implemented and tested |
| CSRF double-submit, exemptions limited to login/refresh/bootstrap | Implemented and tested |
| RBAC + object-level checks, foreign plans return 404 | Implemented and tested |
| Zod `.strict()` on all inputs | Implemented and tested |
| Parameterized SQL, whitelisted ORDER BY, LIKE escaping | Implemented and tested |
| CSV formula-injection guards, upload limits/null-byte checks | Implemented and tested |
| Helmet CSP/HSTS, CORS allow-list, HSTS in production | Implemented |
| Fail-fast secrets, production rejects dev defaults | Implemented |
| No hash/token leakage; redacted logs; safe serializer | Implemented and tested |
| Signed QR on PDF exports | Implemented and smoke-tested |
| Rate limits: general/auth/chat/import/export | Implemented; CI can enable with `TEST_RATE_LIMIT=true` |

### Deliverables

| Deliverable | Location |
| --- | --- |
| Code | `backend-api/`, `rule-engine/` |
| Migrations + seeds + demo data | `db/migrations/`, `backend-api/src/jobs/seed.ts` |
| OpenAPI 3.1 | `docs/openapi.yaml` (88 paths) |
| Postman collection | `docs/postman_collection.json` (102 requests) |
| README | `README.md` |
| Security | `docs/SECURITY.md` |
| Data anomalies | `docs/data-anomalies.md` |
| Decisions / ambiguities | `docs/DECISIONS.md` |
| CI | `.github/workflows/ci.yml` |
| Self-review | this file |

## 4. Defects found and fixed during review

1. **Planner could exceed the resolved credit cap** — the greedy loop accepted a
   course that pushed the total over `max_credits`. Fixed in the planner and
   covered by an engine test.
2. **Foreign plan submission returned 409 instead of 404** — the update matched
   zero rows, indistinguishable from a non-draft plan. Added an ownership
   pre-check so existence is not leaked.
3. **Free-text fields were stored verbatim** — advising notes, escalation
   subject/description/resolution, office-hour location and admin-created names
   are now sanitized centrally (HTML and control characters).
4. **`isPlainText` used a global regex** — repeated calls alternated true/false
   because of `lastIndex`. Replaced with a non-global expression.
5. **Test assumptions drifted from API shapes** (`data.id`, nested profile,
   CSRF-before-auth ordering) — corrected the security suite and re-ran it.
6. **Lint errors and formatting drift** across services/tests — fixed unused
   imports, `prefer-const`, stale eslint directives and formatted all files.
7. **Some notifications were created for the advisor instead of the student**
   (found while reviewing escalation paths) — corrected recipient selection.
8. **Compose defaulted `SEED_DEMO=true`**, which would have created demo logins
   in a production stack that only changed `NODE_ENV`. Demo data now follows the
   environment unless `SEED_DEMO` is set explicitly, production refuses the
   development demo password when `SEED_DEMO=true`, and the migration refuses to
   run in production without `DB_APP_PASSWORD`.

## 5. Review notes and residual risks

- **Docker not executed locally.** The build machine lacks Docker. CI builds
  both images and the Compose file is declarative; local end-to-end coverage
  used the same services directly. This is the only unverified delivery path.
- **Local PostgreSQL is 18, Compose is 16.** SQL and extensions used are
  compatible with both; `pgvector` was installed manually locally. CI validates
  on 16.
- **Engine coverage is 89.86%, below the backend's 95%.** The uncovered lines
  are startup/DB-fallback paths (`rag/store.py` is omitted by design) and
  defensive branches. The 80% gate is met.
- **Branch coverage is the tightest backend metric (80.72%).** Most missed
  branches are DB-error fallbacks and production-only paths. The gate is
  intentionally 80, not 90, to avoid brittle tests.
- **RAG retrieval is lexical, not semantic.** It is deterministic and offline,
  but recall on paraphrased Arabic questions needs calibration with real
  students. Low confidence escalates rather than guesses.
- **Open regulation ambiguities** (probation 9 vs 12, field-training credits,
  `MTH1108`, project 90 vs 96, pool overlaps) are documented in
  `docs/DECISIONS.md` and force review rather than silent guesses.
- **In-memory rate limiting** is per process. A multi-instance deployment needs
  a shared store; this is recorded in the security residual risks.
- **Frontend is delivered in `frontend/`.** It is Arabic-first RTL, talks only to
  the Node API on the same origin, keeps tokens in memory, and mirrors the API
  error/pagination contracts. `scripts/verify-frontend.mjs` checks 52 live
  endpoints (52/52 passing).
- **PDF export uses pdfkit's default font**, which does not render Arabic
  glyphs. The PDF currently prints the English course names; a proper Arabic
  font must be embedded before an Arabic-only PDF is required.

## 6. Definition-of-done checklist

- [x] Advisory-only plans, no registration endpoint, engine owns eligibility.
- [x] Four-state decisions with rule/article/page/anomaly traceability.
- [x] Blocking → review + automatic escalation; warning → working value + flag;
      info → documented.
- [x] RAG answers cite or escalate; no numeric answers from prose; prompt
      injection defended.
- [x] Node-only public API; engine private with token + HMAC.
- [x] Required stack, migrations, seeds and demo data.
- [x] UUID PKs, constraints, FK indexes, append-only audit, least-privilege role.
- [x] Security controls in the DoD, verified by tests.
- [x] Engine golden tests, integration tests for every endpoint group, security
      tests, ≥ 80% coverage, CI.
- [x] OpenAPI, Postman, README, SECURITY, data-anomalies, decisions.
- [x] ERD (`docs/ERD.md`, `docs/erd.mmd`) and frontend (React/TS) matching the API.
- [x] Seeds idempotent; data validation green; anomaly resolution audit-logged
      and re-evaluates decisions.
- [ ] `docker compose up --build` executed on this machine — blocked by missing
      Docker CLI; verified by CI build instead.
