# Research: Personal Finance Manager

**Feature**: `001-personal-finance-manager` | **Date**: 2026-09-20
**Inputs**: spec.md (approved 2026-09-19), constitution v1.0.0, plan directive of 2026-09-20.

Every decision below is closed and approved. Format per item:
decision, rationale, alternatives considered.

## R-001. Exact dependency versions

**Decision**: pin these exact versions in `package.json` (no ranges). All verified against the
npm registry on 2026-09-20.

| Package                                | Version        | Notes                                                                                         |
| -------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| Node                                   | 24 LTS (24.21) | `.nvmrc`, `engines`, Docker `node:24`                                                         |
| pnpm                                   | 12.5           | `packageManager` field                                                                        |
| typescript                             | 7.0.2          | native compiler; see R-002                                                                    |
| @nestjs/core, common, platform-express | 12.1.0         |                                                                                               |
| @nestjs/cli                            | 12.0.5         | dev                                                                                           |
| helmet                                 | 8.3.0          |                                                                                               |
| class-validator                        | 0.15.1         |                                                                                               |
| class-transformer                      | 0.5.1          | required by ValidationPipe `transform`                                                        |
| prisma / @prisma/client                | 7.10.0         | **npm `latest` tag points at 8.0.0-rc.15 — install `prisma@7.10.0` explicitly, never the RC** |
| PostgreSQL                             | 18             | `postgres:18` image                                                                           |
| react / react-dom                      | 19.3.0         |                                                                                               |
| vite                                   | 8.3.0          |                                                                                               |
| @vitejs/plugin-react                   | 6.1.1          | dev                                                                                           |
| react-router                           | 8.4.0          |                                                                                               |
| @tanstack/react-query                  | 5.103.2        |                                                                                               |
| react-hook-form                        | 7.88.0         | **v8 is still beta — do not use**                                                             |
| openapi-typescript                     | 7.13.0         | dev (codegen)                                                                                 |
| openapi-fetch                          | 0.17.0         |                                                                                               |
| swagger-ui-dist                        | 5.33.0         | static assets only, for `/docs`                                                               |
| ajv                                    | 8.20.0         | devDependency: e2e response validation against the yaml                                       |
| vitest                                 | 5.0.1          |                                                                                               |
| @testing-library/react                 | 16.3.3         |                                                                                               |
| @testing-library/user-event            | 14.6.7         |                                                                                               |
| @testing-library/jest-dom              | 7.0.1          |                                                                                               |
| jsdom                                  | 30.1.1         |                                                                                               |
| playwright                             | 1.63.0         |                                                                                               |
| supertest                              | 7.3.0          |                                                                                               |
| oxlint                                 | 1.85.0         |                                                                                               |
| oxlint-tsgolint                        | 7.0.2002       | type-aware lint (typescript-go, TS7-compatible)                                               |
| prettier                               | 3.9.9          |                                                                                               |

**Rationale**: latest stable of everything as of 2026-09-20; the constitution requires stated
reasons for runtime dependencies (see plan.md Constitution Check). `@nestjs/swagger` is
deliberately absent: documentation is served statically from the frozen contract (R-014).
**Alternatives**: version ranges (rejected: reproducibility for a reviewed challenge);
Prisma 8 RC (rejected: release candidate); RHF v8 beta (rejected: beta).

## R-002. TypeScript 7 toolchain compatibility

**Decision**: TS 7.0.2 is the single project compiler: `tsc` (TS7) for `typecheck` and for
build, per the plan directive. TS7 does not expose the TS6 JavaScript compiler API; lint no
longer needs it (oxlint-tsgolint is built on typescript-go). Compatibility matrix and resolution:

| Tool                          | Needs TS JS API?                         | Resolution                      |
| ----------------------------- | ---------------------------------------- | ------------------------------- |
| oxlint-tsgolint 7.0.2002      | no (typescript-go native)                | works with TS7 by design        |
| Vitest 5                      | no (esbuild transform)                   | fine                            |
| Vite 8 / @vitejs/plugin-react | no (esbuild/rollup)                      | fine                            |
| Prisma 7.10                   | no (generates its own client)            | fine                            |
| openapi-typescript 7.13       | **yes** (uses the TS API to print types) | verify in Setup; fallback below |
| @nestjs/cli 12                | tsc or SWC builder                       | tsc (TS7); SWC fallback below   |

Two verifications run as the first Setup task, before any business code:

1. **Decorator emit**: confirm TS7 `tsc` honours `experimentalDecorators` +
   `emitDecoratorMetadata` (Nest DI, class-validator and class-transformer need the metadata).
   If it does not, the api package builds with the SWC builder already shipped in
   `@nestjs/cli` (`.swcrc` with legacy decorators + metadata) while `tsc` (TS7) remains the
   typechecker (`--noEmit`). Recorded in Complexity Tracking if triggered.
2. **openapi-typescript**: run the codegen once. If it requires the TS6 API, install the alias
   `"typescript-api": "npm:typescript@6"` scoped to that tool only; TS7 stays the project
   compiler. Recorded in Complexity Tracking if triggered, with a comment naming the ceiling
   (drop the alias when openapi-typescript supports TS7) and the upgrade path.

**Rationale**: the contract (OpenAPI + Prisma schema) does not depend on either outcome, so
freezing now is safe; both failure modes have a pre-approved, recorded fallback.
**Alternatives**: staying on TS6 project-wide (rejected: directive fixes TS7; tsgolint needs it).

## R-003. Lint configuration (oxlint only)

**Decision**: oxlint is the only linter, one `.oxlintrc.json` at the repo root. No ESLint, no
typescript-eslint.

- Plugins: `typescript`, `react`, `react-hooks`, `jsx-a11y`, `import`, `vitest`.
- Category `correctness`: `error`.
- `import/no-cycle`: `error` (reinforces Principle VII; barrel files are banned so cycles are
  visible — see plan.md).
- `no-restricted-imports` with path patterns, both `error`:
  - `apps/api/src/modules/*/domain/**` may not import `@nestjs/*` or `@prisma/*`
    (pure-domain guarantee, Principle VI);
  - no module may import another module's `repositories/`, `dtos/`, `domain/` or Prisma
    models — only `services/` (Principle VII).
- Type-aware rules via `oxlint --type-aware` (oxlint-tsgolint): `no-floating-promises`,
  `no-misused-promises`, `await-thenable`, all `error`.

**Rationale**: one tool, one config, with the two constitutional boundaries (pure domain,
module isolation) mechanically enforced. **Alternatives**: ESLint + typescript-eslint
(rejected: second toolchain for the same rules, slower).

## R-004. CORS configuration

**Decision**: SPA and API are separate origins with no proxy. Dev: Vite `http://localhost:5173`,
api `http://localhost:3000`. Compose: nginx SPA `http://localhost:8080`, api `http://localhost:3000`.
`app.enableCors` in `main.ts` with:

- `origin`: read from the `CORS_ORIGINS` env var, a comma-separated allowlist defaulting to
  `http://localhost:5173,http://localhost:8080` (FR-035 as amended 2026-09-20; listed in
  `.env.example` with that default).
- `methods`: `GET, POST, PUT, PATCH, DELETE` (exactly what the contract uses) + `OPTIONS` preflight.
- `credentials`: `false` (no cookies, no auth).
- `exposedHeaders`: `['X-Correlation-Id']` (R-009; FR-033/SC-011 — the web must read it).
- `maxAge`: `3600` (cache preflight).

The openapi-fetch client `baseUrl` is the constant `http://localhost:3000` (same in dev and
compose, same ceiling comment). Covered by the security e2e: allowed origin → correct
`Access-Control-Allow-Origin`; foreign origin → no CORS headers; preflight OPTIONS answered.
**Alternatives**: Vite/nginx proxy (rejected by directive: no proxy, e2e exercises real CORS);
constants in `main.ts` (rejected 2026-09-20 by the user: origins are deployment
configuration, so FR-035 was amended to add `CORS_ORIGINS`).

## R-005. HTTP security headers (helmet) and CSP

**Decision**: `app.use(helmet(...))` registered in `main.ts` before any route, next to
`enableCors`. Dependency rationale (constitution requires one): standard, maintained security
headers (HSTS, `X-Content-Type-Options`, frameguard, `Referrer-Policy`, `Cross-Origin-*`)
beat hand-written ones. `X-Powered-By` disabled.

- **API CSP** (helmet), uniform for the whole API since it serves only JSON (no `/docs`):
  `default-src 'none'; frame-ancestors 'none'`.
- **SPA CSP** (nginx config, not helmet — helmet covers only the API):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self' http://localhost:3000; frame-ancestors 'none';
base-uri 'none'; form-action 'self'; object-src 'none'`.
  `style-src 'unsafe-inline'` and `img-src data:` exist only because Swagger UI injects inline
  styles and data-URI icons under `/docs`; the app itself needs neither. nginx also sets
  `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Verified by the security-headers e2e (supertest): key helmet headers plus the R-004 CORS contract.

## R-006. HSTS activation — **APPROVED 2026-09-20**

**Decision**: HSTS is derived from `NODE_ENV`: helmet's `hsts` option is enabled only when
`NODE_ENV === 'production'`, disabled otherwise. No new env var (`NODE_ENV` is a platform
convention, not a variable this feature introduces, so FR-035 stays untouched). A comment in
`main.ts` names the known caveat and the ceiling: Docker Compose runs the production build
over plain http, so the header is emitted there without effect — browsers ignore
`Strict-Transport-Security` received over http, which makes this harmless; once the app
deploys behind TLS the same production build activates HSTS with no code change. The
security-headers e2e asserts the header's presence/absence according to `NODE_ENV`.
**Alternatives**: keep HSTS off and let the TLS-terminating proxy own it (rejected by the
user: they prefer the app to carry its own production posture); a dedicated env var
(rejected: another FR-035 amendment for a header http clients ignore).

## R-007. Balance cache shape (spec Assumptions delegate this)

**Decision**: a **current-balance snapshot table only** — one `BIGINT` row per user account
(`balance_snapshots(account_id PK, balance)`), updated inside the same interactive Prisma
transaction as every entry write (create, edit regenerate, soft delete, rebuild). No month-end
snapshots. Balance-as-of-date reads compute directly from entries (FR-011 defines that sum as
the truth), using the `transactions(date, id)` and `entries(account_id)` indexes.

**Rationale**: at FR-032 scale (~5 000 transactions, ~10 000 entries) an as-of-date sum is a
sub-millisecond indexed aggregate — three orders of magnitude inside SC-008's one-second
budget — while month-end snapshots put real complexity on the write path (a backdated edit
must invalidate every later snapshot in the same transaction). The cache layer FR-012 mandates
ships as the current-balance table: it serves the hottest reads (account list, dashboard
total, projection start), is reconciled by FR-031 (`ledger:check`) and rebuilt by
`ledger:rebuild` from entries alone.
**Ceiling** (justified in plan.md Complexity Tracking): add month-end snapshots if as-of-date
p95 ever approaches the SC-008 budget; the reconciliation and rebuild scripts extend to them
unchanged.
**Alternatives**: month-end snapshots (rejected: write-path invalidation complexity, no
measured need); both (rejected: same); no cache (rejected: FR-012 mandates one).

## R-008. Stable secondary sort key (FR-009)

**Decision**: every table uses `BIGINT GENERATED ALWAYS AS IDENTITY` primary keys; transaction
lists order by `date DESC, id DESC`. The identity `id` is the stable tie-breaker and matches
insertion order, which is what the spec defines for same-date transactions.
**Alternatives**: UUIDv7 (rejected: new dependency/complexity for no gain single-user);
`created_at` timestamp (rejected: not guaranteed unique).

## R-009. Correlation id header name (FR-033)

**Decision**: `X-Correlation-Id`. Generated per request by the correlation-id middleware
(`crypto.randomUUID()`), attached to the request context, echoed in every response header,
carried in every `ErrorResponse.correlationId`, and logged exactly once per request. Inbound
values are ignored (FR-033 says generated per request). **Alternatives**: `X-Request-Id`
(equivalent; one had to be picked and frozen in the contract).

## R-010. Description normalisation for the similar-transaction report (FR-014)

**Decision**: `normalise(d)`:

1. trim surrounding whitespace;
2. lower-case (`toLowerCase`);
3. collapse every internal whitespace run to a single space (`/\s+/g → ' '`);
4. strip one trailing run of digits and the whitespace before it (`/\s*\d+$/ → ''`), then trim.

If the result is the empty string (e.g. a description that is only digits), the group key is
the **trimmed original text** instead (spec FR-014). The stored description is never rewritten.
Deterministic, dependency-free, pure function in `reports/domain/` with its spec covering:
`"Uber 1234"`, `"UBER  5678"`, `"uber"` → one group; `"Flat 4B"` keeps its letters-then-digit
tail stripped only at the very end (`"flat 4b"` → no strip: `b` is not a digit); `"12345"` →
grouped as `"12345"`. **Alternatives**: Levenshtein/embedding similarity (rejected: spec
demands deterministic, no external service).

## R-011. Error code catalogue (ErrorResponse.code enum, frozen in the yaml)

**Decision**:

| Code                    | HTTP | When                                                                                                                                                                                                         |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VALIDATION_FAILED`     | 400  | DTO validation: shape, pattern, money guard, per-intent sign (a non-positive amount on expense/income/transfer, a zero opening balance in an update), dates, limits                                          |
| `NOT_FOUND`             | 404  | route id does not exist (or is soft-deleted)                                                                                                                                                                 |
| `DUPLICATE_NAME`        | 409  | unique-name violation (accounts, categories, projects)                                                                                                                                                       |
| `DOMAIN_RULE_VIOLATION` | 422  | typed domain errors: archived account, category type mismatch, same-account transfer, closed project, project on non-expense, delete of a used project, opening-kind change, future date, range > 24 months… |
| `AI_NOT_CONFIGURED`     | 422  | `LLM_API_KEY` empty (FR-015)                                                                                                                                                                                 |
| `AI_PROVIDER_ERROR`     | 502  | provider returned an error                                                                                                                                                                                   |
| `AI_RATE_LIMITED`       | 503  | provider answered 429                                                                                                                                                                                        |
| `AI_TIMEOUT`            | 504  | `AbortSignal.timeout(LLM_TIMEOUT_MS)` fired                                                                                                                                                                  |
| `INTERNAL_ERROR`        | 500  | anything unmapped; logged with stack + correlation id                                                                                                                                                        |

`details` carries field-level entries `{ field, message }` when a field is nameable (FR-023);
the web maps them to `setError` per field. One global exception filter owns the whole mapping;
controllers never build error responses. **Alternatives**: HTTP-status-only codes (rejected:
FR-015 requires distinguishing three LLM failures plus not-configured).

## R-012. LLM provider call (FR-015)

**Decision**: Anthropic Messages API called with native `fetch` (no SDK) and
`AbortSignal.timeout(LLM_TIMEOUT_MS)`, no retries. `LLM_API_KEY` is the Anthropic key. Model
is the constant `claude-haiku-4-5-20251001` in the `ai` module (economical; a constant, not an
env var; comment names the ceiling: promote to configuration if model choice ever needs to
vary per environment). The assumed provider contract is pinned here, since no SDK absorbs
changes: `POST {LLM_BASE_URL}/v1/messages` with headers `x-api-key: {LLM_API_KEY}` and
`anthropic-version: 2023-06-01`; the narrative is read from `content[0].text` of the JSON
response; HTTP 429 → `AI_RATE_LIMITED`, any other non-2xx → `AI_PROVIDER_ERROR`. The base URL
comes from `LLM_BASE_URL` (FR-035 as amended 2026-09-21, default `https://api.anthropic.com`):
the API e2e suite points it at a local HTTP stub to exercise `AI_PROVIDER_ERROR`,
`AI_RATE_LIMITED` and `AI_TIMEOUT` end to end through the real global filter. Empty key →
`AI_NOT_CONFIGURED` without any network call; timeout/429/other map per R-011 via the global
filter. The deterministic FR-014 report is computed locally and never touched by any provider
failure.
**Alternatives**: `@anthropic-ai/sdk` (rejected: one bounded POST does not justify a runtime
dependency — constitution prefers the platform).

## R-013. SC-008 measurement method

**Decision**: `perf:measure` is a plain Node script (native `fetch`, no new dependency):
against the Docker Compose stack loaded with `db:generate-perf` (~5 000 transactions /
24 months), it warms each endpoint (20 requests), then measures 200 sequential requests per
endpoint — account list with balances, transaction list (default page of 50), balance as of a
date, monthly report, projection at 12 months — recording server-side duration and computing
p95 by sorting (`sorted[ceil(0.95·n)-1]`). Targets: 1 s for balances/lists, 2 s for monthly
report/projection. Run manually (not CI). quickstart.md documents how to run it.
**Alternatives**: autocannon/k6 (rejected: new dependency for arithmetic a loop does).

## R-014. `/docs` — static Swagger UI from the frozen contract

**Decision**: no `@nestjs/swagger`. `contracts/openapi.yaml` is both the frozen contract
(Principle IV) and the complete API documentation, and it is the **single source copy**:
codegen and the `/docs` build read it from `specs/001-personal-finance-manager/contracts/`
directly (no duplicate under `packages/contract`). The web build copies `swagger-ui-dist`
assets plus that yaml into `public/docs` as build output; served identically by Vite (dev)
and nginx (compose) at `/docs`, no CDN, API untouched. The one copy Prisma forces
(`apps/api/prisma/schema.prisma`) is byte-diffed against the frozen schema by
`contract:check`. The page documents the agreed contract,
not what the code happens to expose. Drift guards replace decorator-generated docs:

1. `contract:check` (CI): instantiates `AppModule` without listening, lists Nest's registered
   routes, diffs against the yaml's paths+methods; any extra or missing route fails.
2. Supertest e2e validates every response body against the yaml schema for that endpoint and
   status with ajv — an extra field, a missing field, a wrong type, or an amount arriving as a
   JSON number instead of a string breaks the test.
   **Alternatives**: `@nestjs/swagger` decorators (rejected: duplicates the contract in code and
   documents the implementation instead of the agreement).

## R-015. Module dependency direction (Principle VII)

**Decision**: `ledger` is the foundation module and imports no other module. It owns the
double-entry engine: `transactions`, `entries`, `system_accounts`, `balance_snapshots` tables,
`toEntries` and `balanceAt` in its domain, intent persistence, list queries, reconciliation
and rebuild. The **accounts module owns the user-facing transaction surface** (`/transactions`
endpoints) as well as `/accounts`: it validates account rules itself, delegates category and
project validation to those modules' services, then calls `LedgerService`. This is what makes
the graph acyclic — the two natural pulls (accounts → ledger for opening transactions, and
transaction-recording → accounts for archived-account checks) would otherwise form a cycle.

Graph (arrows = NestJS module imports, all downward, acyclic):

```
ai → reports → ledger
              ↘ categories → ledger
accounts → ledger, categories, projects
scheduled-items → accounts, categories
projects → ledger
```

`LedgerService` trusts callers for entity-state rules (archived, type match, project status) —
those belong to the owning modules — and itself enforces intent shape, the single translation
point, and sum-to-zero. Cross-module atomic flows (account + opening transaction; confirm =
transaction + item advance) pass the interactive Prisma transaction client through the public
service call. **Alternatives**: ledger imports accounts/categories for validation (rejected:
cycle with opening-balance flow); events between modules (rejected: machinery this size of app
does not need).

## R-016. Decisions already fixed by spec/directive, recorded for completeness

- **Money on the wire**: `type: string`, `pattern: '^-?[0-9]{1,16}$'`, described as integer
  cents; the ±10^15 guard is validated after `BigInt(value)` conversion at the edge (custom
  class-validator decorator), not by the pattern. `JSON.stringify` throwing on `bigint` makes
  an unconverted leak impossible.
- **Dates**: `DATE` columns, `'YYYY-MM-DD'` strings, `format: date`; "today" via `Intl` in
  `APP_TIMEZONE`; no date library.
- **Unique names**: raw-SQL unique index on `lower(trim(name))` per table, archived/closed
  rows included.
- **Sum-to-zero in the DB**: `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` on `entries`
  in a raw SQL migration (see data-model.md), checked at commit of the same interactive
  transaction that ran the domain check.
- **Logs**: Nest native `ConsoleLogger` in `json` mode; one line per request; never an amount
  or description in a log line.
- **Env vars** (`.env.example`, complete list per FR-035 as amended): `APP_TIMEZONE=UTC`,
  `LOG_LEVEL=info`, `LLM_API_KEY=`, `LLM_TIMEOUT_MS=10000`,
  `LLM_BASE_URL=https://api.anthropic.com`,
  `CORS_ORIGINS=http://localhost:5173,http://localhost:8080`, and
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance` (the dev-against-
  compose-postgres default; compose injects its own). `NODE_ENV` is a platform convention,
  not an FR-035 variable: compose sets `production` (R-006), dev leaves it unset.
- **Pagination**: `limit`/`offset`, default 50, max 200 (above → `VALIDATION_FAILED`), `total`
  in every list response.
