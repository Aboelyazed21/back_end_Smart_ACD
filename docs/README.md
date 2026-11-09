# Documentation index

| Document | Contents |
| --- | --- |
| [`openapi.yaml`](./openapi.yaml) | OpenAPI 3.1 contract for every REST endpoint, schemas, auth and error envelope (Swagger-compatible). |
| [`postman_collection.json`](./postman_collection.json) | 102 ready-to-run requests in 6 folders; set `baseUrl`, run `Auth / CSRF`, then `Auth / Login`. |
| [`ERD.md`](./ERD.md) | Entity-relationship diagrams by domain plus a catalog of all 36 tables, constraints and indexes. |
| [`erd.mmd`](./erd.mmd) | Full database ERD as a single Mermaid diagram. |
| [`SECURITY.md`](./SECURITY.md) | Threat model, authentication, authorization, token rotation, CSRF, rate limits, data protection and deployment hardening. |
| [`data-anomalies.md`](./data-anomalies.md) | The 27 regulation-data anomalies, severity, working values, engine behaviour and open questions. |
| [`DECISIONS.md`](./DECISIONS.md) | Design and regulation interpretation decisions, including ambiguity handling. |
| [`SELF-REVIEW.md`](./SELF-REVIEW.md) | Requirement-by-requirement self-review and verification evidence. |

## Verifying the API against the frontend

```bash
# API + engine + seeded database must be running
node scripts/verify-frontend.mjs   # 52 endpoint contract checks
node scripts/smoke.mjs             # 18 end-to-end checks
```

Both scripts accept `API_URL`, `DEMO_PASSWORD` and (for the contract check)
`VERIFY_TERM`.
