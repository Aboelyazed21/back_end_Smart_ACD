# Architecture and product decisions

This file records the decisions taken while implementing the Smart Academic
Advisor, the alternatives considered and the ambiguities that remain open.
Anything marked **open** needs confirmation from the college before the
regulation is treated as final.

## Scope and safety

| Decision | Rationale |
| --- | --- |
| The product is **advisory only**. Every generated plan is persisted as `DRAFT`. | Art. 26 makes recommended plans advisory and subject to advisor approval. A registration feature would create legal exposure. |
| There is **no registration endpoint** and no write path to the student's official registration. | The official registration system remains the source of truth. |
| The rule engine never overrides eligibility. It returns `ELIGIBLE`, `NOT_ELIGIBLE`, `UNKNOWN` or `REVIEW_REQUIRED` with `rule_code`, `article`, `page` and `anomaly_ids`. | Every decision must be explainable and traceable to the bylaw. |
| AI/RAG never answers numeric or policy questions from generated text. Numeric facts come from `regulation_rules.json`; prose answers are extractive from stored bylaw text. | Prevents hallucinated credit hours, deadlines and fees. |
| Blocking anomalies short-circuit to `REVIEW_REQUIRED` and create an escalation. | The bylaw contradicts itself or is missing data; guessing would be unsafe. |
| Warning anomalies are evaluated with the documented working value and flagged. | Keeps the product usable while surfacing the uncertainty to advisors and admins. |
| Informational anomalies are stored and displayed but never change a decision. | They are documentation issues (typos, duplicate codes). |

## Stack and topology

| Decision | Rationale |
| --- | --- |
| Node 20 + TypeScript + Express for the public API, Python 3.11 + FastAPI for the engine. | Approved stack. The split keeps deterministic academic rules independent from HTTP/session concerns. |
| PostgreSQL 16 with `pgvector`; `node-pg-migrate` for schema changes. | Approved stack; pgvector stores policy embeddings without a separate vector database. |
| The React frontend only talks to the Node API. Only the Node API talks to the engine. The engine is never published to the host. | Single trust boundary, no CORS surface around the engine, and the engine secret never reaches the browser. |
| Docker Compose starts `db`, then a one-shot `migrate` service, then `rule-engine` and `backend-api`. Mailhog provides local SMTP. | Migrations cannot race with either service's start-up. |
| The engine authenticates callers with a bearer service token **and** an HMAC-SHA256 signature over the request body plus timestamp. | Defense in depth if the internal network is compromised. |
| The Node API seeds reference data on start (`RUN_SEED=true`), demo data only when `SEED_DEMO=true` and never by default in production. | One-command local start without leaking demo accounts into production. |

## Database and data

| Decision | Rationale |
| --- | --- |
| UUID primary keys, UTC timestamps, `CHECK` constraints, foreign keys and indexes on every FK. | Operational safety and cheap joins. |
| Append-only `audit_logs`: the app role has no `UPDATE`/`DELETE`, and a trigger rejects mutation even if grants drift. | Audit evidence must survive application bugs. |
| The runtime uses the least-privilege role `smart_advisor_app`; migrations use the owner role through `MIGRATION_DATABASE_URL`. | Limits blast radius of SQL injection or a compromised process. |
| Seeds are idempotent (`ON CONFLICT` upserts, deterministic IDs where possible). | `RUN_SEED=true` on every boot must be safe. |
| Soft delete (`deleted_at` / `active`) for academic reference data rather than destructive deletes. | Existing plans and audits keep valid references. |
| Policy chunks are stored in `policy_chunks` with `article_no`, `clause_no`, `page_no`, source and checksum; embeddings are 384-dimensional. | Citations must point at the exact bylaw page. |
| Embeddings are deterministic lexical hashing of Arabic-normalised tokens, not a hosted model. | Offline, reproducible, no external data processing agreement. Retrieval is evaluated and confidence-gated. |

## Anomaly handling

| Decision | Rationale |
| --- | --- |
| An open anomaly is matched to a decision only through its affected course code or at least 5 shared normalized tokens with the rule topic. | Prevents unrelated open anomalies from blocking every decision. |
| Blocking anomaly → `REVIEW_REQUIRED` plus an automatic escalation (`type=ANOMALY`). | DoD requirement: every blocking anomaly produces an escalation. |
| Warning anomaly → evaluate with `working_value`, attach `anomaly_ids`, never auto-escalate. | Advisor sees the flag and can act. |
| Resolving an anomaly requires a value and an admin note; both are audit logged. | Resolution is a regulated decision, not a UI toggle. |
| After resolution the service re-evaluates escalations tied to the anomaly and auto-resolves those that are no longer `REVIEW_REQUIRED`. | Keeps escalation queues honest without manual cleanup. |
| A resolved anomaly keeps its history; reopening requires a reason and is audit logged. | Same evidence standard as resolution. |

## Authentication and sessions

| Decision | Rationale |
| --- | --- |
| Argon2id with 19 MiB, t=2, p=1; policy: 12–128 chars with upper, lower, digit and symbol. | Approved password hashing; stronger than bcrypt cost 12. |
| Access JWT ≤ 15 minutes, `iss`/`aud` checked, `jti` per token. | Short exposure window. |
| Refresh tokens are random 32-byte values, hashed with SHA-256 + pepper before storage, rotated on every use, and reuse revokes the whole family. | Rotating hashed tokens with reuse detection. |
| Refresh token lives in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. | Not readable by JavaScript. |
| CSRF uses double-submit: `GET /api/auth/csrf` sets a readable cookie plus returns a token that must be sent as `x-csrf-token` on state-changing requests. Login, refresh and the CSRF bootstrap are exempt. | Login/refresh have no ambient authenticated session to forge; refresh is additionally protected by the httpOnly cookie and rotation. |
| Passwords are never returned or logged; a central `toSafeUser` serializer strips `password_hash` and token columns. | Prevents accidental leakage through logs or admin endpoints. |
| Failed logins are rate-limited per IP and the response is identical for unknown users and wrong passwords. | Slows credential stuffing and prevents account enumeration. |

## API conventions

| Decision | Rationale |
| --- | --- |
| Success payloads are `{ "data": ... }`; lists are `{ "data": [...], "pagination": { page, limit, total, pages } }`. | Predictable client handling. |
| Errors are `{ "error": { "code", "message", "details?", "correlationId" } }`. | Stable machine-readable codes; no stack traces. |
| Engine-derived payloads keep `snake_case` (`rule_code`, `anomaly_ids`, `max_credits`). | Traceability to the engine contract; avoids a lossy translation layer. |
| Free-text fields are sanitized centrally (HTML tags and control characters removed) and Zod schemas are `.strict()`. | Rejects mass assignment and stored-XSS attempts. |
| All SQL uses parameters. Dynamic `ORDER BY` only accepts a whitelist; LIKE input escapes `%`, `_` and `\`. | No SQL injection surface. |
| CSV exports prefix formula-leading cells (`=`, `+`, `-`, `@`) with `'`. | Spreadsheet formula injection defence. |
| Rate limits: general, auth, chat, import and export buckets, all configurable and disabled in tests unless explicitly enabled. | Protects expensive endpoints without making tests flaky. |

## Terms, planning and grading

| Decision | Rationale |
| --- | --- |
| Canonical term is `YYYY-YYYY-season`, e.g. `2026-2027-fall`. The parser also accepts `fall 2026-2027`, `fall:2026-2027` and a season-only value. | Tolerates frontend input without storing inconsistent strings. |
| The academic year starts in September; January–May is spring, June–August is summer. | Matches the Egyptian academic calendar. |
| Draft plans are capped strictly at the resolved maximum load; the planner skips courses that would exceed it. | A plan that violates the cap is not useful. |
| Corequisite exception applies only when the failed prerequisite is in `student.current`; a historical `F` is `NOT_ELIGIBLE`. | Concurrent registration is the only case where the exception is defensible. |
| A failed course with a passing later attempt counts as passed, and the repeat cap (`R-REPEAT-CAP-16.11`) is enforced. | Matches the bylaw's best-attempt and repeat rules. |
| Graduation audit requires 136 credits, CGPA ≥ 2.00, six regular semesters, completed field training, project and elective pools. | Art. 17 and program tables. |
| Probation draft load is 12 credits. CGPA < 2.00 with 9–11 planned credits is `REVIEW_REQUIRED` (`A-REG-01`); 13–15 is `REVIEW_REQUIRED` (`A-REG-02`); exactly 12 is `ELIGIBLE` with the anomaly flag. | The bylaw contradicts itself on the probation minimum (9 vs 12); 12 is the only safe working value. |
| The planner has no LLM. It is a deterministic greedy scheduler over eligible courses. | Reproducible output is required for appeals. |
| RAG confidence below `RAG_MIN_CONFIDENCE` (default 0.32) or a question about an open anomaly escalates instead of answering. | "Cite or escalate" rule. |
| Prompt-injection defence strips instruction-like content and never lets retrieved text change system behaviour. | Retrieved bylaw text is untrusted input. |

## Environments and verification

| Decision | Rationale |
| --- | --- |
| Local verification used a standalone PostgreSQL 18 cluster on port 55432 with pgvector 0.8.6 because Docker was unavailable on the build machine. | Docker Compose is still the supported delivery path; CI builds both images. |
| Jest uses a deterministic fake engine on `127.0.0.1:4599` that validates the bearer token and HMAC. | Integration tests do not depend on Python being installed, but still exercise the real HTTP client. |
| Test suites truncate volatile tables, keep reference data and remove `test-%`/`import-%` users and `TST%` courses. | Fast, repeatable tests without reseeding on every file. |
| `scripts/validate-data.mjs` runs with no database and fails CI on broken counts, credits, references, anomalies, rules or PDF checksum. | Catches extraction regressions before migrations. |
| Coverage gate is 80% for statements, branches, functions and lines on services, middleware and utils. | Meets the DoD; engine gate is also 80%. |

## Open ambiguities (need college confirmation)

1. **Probation load** — Art. 8 says 9 credits minimum, Art. 16.5 says 12 for
   students on probation (`A-REG-01`, `A-REG-02`). The engine uses 12 as the
   working value and escalates 9–11 and 13–15.
2. **Field training credit weight** — the program tables list field training as
   a requirement without credit hours. It is stored as 0 credits and as a
   non-GPA graduation requirement.
3. **Elective pool mapping** — some courses appear in more than one pool
   (`A-REG-05`, `A-CAT-17`, `A-CAT-18`). The engine counts a passed course
   against the first satisfied pool and flags the ambiguity.
4. **Phantom course codes** — `MTH1108` is referenced by `DSC3102` but is not in
   the catalogue (`A-CAT-11`). The decision is `REVIEW_REQUIRED` because the
   correct prerequisite is unclear.
5. **Graduation project eligibility** — Art. 13.7 and the plan tables disagree
   on whether 96 or 90 passed credits are required (`A-REG-06`). The engine uses
   96 and flags the overlap.
6. **Remedial admission rule** — `R-ADM-REMEDIAL` is referenced by
   `A-REG-07` but was not extracted as a first-class rule. Decisions depending
   on it escalate.
7. **Elective selection for transfer students** — the bylaw caps transfer at
   40% of program credits but does not define how pools are recalculated. The
   engine reports `UNKNOWN` for unmapped pools.

## Rejected alternatives

- **LLM-generated answers** — rejected for numeric policy questions; the
  extractive RAG with citations is the only allowed path.
- **SQLite or MongoDB** — rejected; the DoD requires PostgreSQL + pgvector.
- **Server-side sessions in Redis** — rejected; refresh-token rotation with
  hashed tokens in PostgreSQL is simpler and satisfies the requirements.
- **Storing the refresh token in `localStorage`** — rejected; XSS would leak it.
- **Deriving eligibility in Node** — rejected; a second implementation would
  drift from the engine.
