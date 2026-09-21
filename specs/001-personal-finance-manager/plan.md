# Implementation Plan: Personal Finance Manager

**Branch**: `001-personal-finance-manager` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-personal-finance-manager/spec.md`
(approved 2026-09-19), constitution v1.0.0, planning directive of 2026-09-20.

## Summary

A single-user personal finance manager over a double-entry ledger: accounts and transactions
(P1), real-time and as-of-date balances (P2), monthly expense report (P3), scheduled items
and budget projection (P4), projects (P5), similar-transaction report with optional AI
narrative (P6). pnpm monorepo — NestJS 12 + Prisma 7 + PostgreSQL 18 API, React 19 + Vite 8
SPA on a separate origin with strict CORS, contract-first against a frozen OpenAPI document
that doubles as the served documentation. Money is integer cents: `BIGINT` in the database,
JSON strings on the wire, `bigint` arithmetic, dollars only in the UI presentation layer.
**The contract is frozen with this plan**: [`contracts/openapi.yaml`](contracts/openapi.yaml)
and [`contracts/schema.prisma`](contracts/schema.prisma). Any change to either goes back
through this plan (Principle IV).

All research decisions are closed and approved, HSTS included (R-006, approved 2026-09-20:
derived from `NODE_ENV` — helmet emits it only when `NODE_ENV === 'production'`).

## Technical Context

**Language/Version**: TypeScript 7.0.2 (native compiler), `strict` in every package; Node 24 LTS.

**Primary Dependencies**: NestJS 12.1, Prisma 7.10 (never the 8.0 RC on the `latest` tag),
helmet 8.3, class-validator 0.15 / class-transformer 0.5; React 19.3, Vite 8.3, React Router
8.4, TanStack Query 5.103, React Hook Form 7.88 (v8 is beta — excluded); openapi-typescript
7.13 + openapi-fetch 0.17; swagger-ui-dist 5.33 (static assets only). Exact pins and
rationale: [research.md R-001](research.md). No `@nestjs/swagger`, no date library, no zod,
no Anthropic SDK, no ESLint.

**Storage**: PostgreSQL 18 via Prisma. `BIGINT` money, `DATE` dates, deferred constraint
trigger for sum-to-zero, functional unique indexes on `lower(trim(name))` (raw SQL in the
first migration — [data-model.md](data-model.md)).

**Testing**: Vitest 5 (api + web, tests colocated with their files), supertest 7 e2e against
real Postgres with ajv response-vs-contract validation, Playwright 1.63 (Chromium only)
against the full Docker Compose stack. oxlint 1.85 + oxlint-tsgolint (type-aware) as the only
linter; Prettier 3.9.

**Target Platform**: Docker Compose on a developer laptop — `postgres:18` + api (`node:24`,
port 3000) + web (Vite build served by nginx, port 8080 incl. `/docs`). Dev: Vite on 5173.
SPA and API are separate origins, no proxy, strict CORS allowlist (research R-004).

**Project Type**: pnpm-workspace monorepo — `apps/api`, `apps/web`, `packages/contract`, `e2e`.

**Performance Goals**: SC-008 — server-side p95 on the FR-032 dataset (~5 000 transactions):
≤1 s balances/lists (default page of 50), ≤2 s monthly report/projection. Measured by
`perf:measure` (research R-013), manual, not CI.

**Constraints**: money as strings of integer cents with a ±10^15-cent edge guard (FR-022);
read-after-write balance freshness with no push/polling (FR-028); calendar dates with "today"
from `APP_TIMEZONE` (FR-029); env vars closed to the FR-035 seven (incl. `CORS_ORIGINS` and
`LLM_BASE_URL`, amended 2026-09-20 and 2026-09-21); structured errors with
correlation id everywhere (FR-023/FR-033); WCAG-AA-level keyboard/label/focus floor (FR-034).

**Scale/Scope**: single user, single currency, 8 screens, 23 API paths / 31 operations,
7 backend modules, demo seed of 60–100 transactions + optional 5 000-transaction generator.

## Constitution Check

_Gate evaluated before Phase 0 and re-checked after Phase 1 design: **PASS** (both), with one
justified entry and two conditional fallbacks in Complexity Tracking, no violations._

| Principle                  | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Ledger integrity        | Every intent → exactly 2 entries summing to zero; enforced in `ledger/domain/` **and** by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, both inside one interactive Prisma transaction (data-model.md). Soft deletes keep entries balanced. `ledger:check` reconciles, `ledger:rebuild` repairs; the CI integrity test asserts the global zero sum.                                                                                                                                                                   |
| II. Integer money          | `BIGINT` columns; wire format `type: string, pattern '^-?[0-9]{1,16}$'` frozen in the yaml; `bigint` arithmetic only; ±10^15 guard validated after `BigInt()` at the edge (custom class-validator decorator; `shared/lib/money.ts` in the web). `JSON.stringify` throws on `bigint`, so an unconverted leak cannot ship. Dollars exist only in the UI presentation layer.                                                                                                                                                     |
| III. One translation point | `LedgerService.toEntries` in `apps/api/src/modules/ledger/domain/` is the only intent→entries conversion (all four intents). API/UI speak intent; no endpoint, DTO or screen mentions entries, debits, credits or system accounts (response DTOs verified by their specs and by ajv against the yaml).                                                                                                                                                                                                                        |
| IV. Contracts before code  | `contracts/openapi.yaml` + `contracts/schema.prisma` frozen with this plan. The yaml has a **single copy**: codegen and the `/docs` build read `specs/001-personal-finance-manager/contracts/openapi.yaml` directly. Web types generated by openapi-typescript; hand-written contract types banned (lint + review). Drift guards: `contract:check` (routes vs yaml + byte-diff of `apps/api/prisma/schema.prisma` against the frozen schema, CI) and ajv validation of every e2e response. Changes re-enter through the plan. |
| V. Validate at the edges   | Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform); one DTO per body/query/params; intent DTOs chosen by `kind` mirroring the yaml discriminator; typed domain errors mapped to HTTP in exactly one global exception filter using the frozen `ErrorResponse` shape + correlation id. Controllers never build error responses.                                                                                                                                                                               |
| VI. Domain tests first     | Colocated unit tests for `toEntries` (4 intents), unbalanced rejection, `balanceAt`, recurrence expansion + projection (weekly/monthly/month-end/end-date/overdue), `money.ts`, the money-validation decorator, every response DTO `from(...)` at the guard limits, and the server-error→form-field mapper. Written alongside the domain code, never deferred — Principle VI overrides the tasks template's "only if requested". Global integrity + reconciliation run in CI.                                                 |
| VII. Modular monolith      | Seven modules, public services only, graph acyclic and documented below; enforced by `import/no-cycle` + `no-restricted-imports` (research R-003). Module wiring readable in each `<module>.module.ts` (exports only services). No barrel files, so cycles are visible to the linter.                                                                                                                                                                                                                                         |

Stack constraints: matches the constitution's fixed stack. New runtime dependencies and their
stated reasons: `helmet` (maintained security headers, research R-005), `openapi-fetch`
(typed client over the generated contract types, replaces a hand-rolled fetch wrapper that
would duplicate contract types), `class-validator`/`class-transformer` (Principle V names
them), `react-router` (client-side routing for the 8 screens; hand-rolled routing would
reimplement history/focus handling), `@tanstack/react-query` (the FR-028
refetch-after-write/invalidation machinery; hand-rolling it is exactly the cache-consistency
code the constitution warns against), `react-hook-form` (form state + validation wiring for
the four intent forms and the pickers via `Controller`). Everything else is dev-only or
constitution-mandated.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-finance-manager/
├── plan.md              # This file
├── research.md          # Phase 0 — all delegated decisions closed (R-001…R-016)
├── data-model.md        # Phase 1 — entities, intent→entry mapping, raw SQL, seed
├── quickstart.md        # Phase 1 — run/validate guide, README plan, walkthrough script
├── contracts/
│   ├── openapi.yaml     # FROZEN — contract and served documentation
│   └── schema.prisma    # FROZEN — copied to apps/api/prisma in Foundational
└── tasks.md             # Phase 2 (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml  tsconfig.base.json  .oxlintrc.json  .prettierrc  .nvmrc
.env.example  docker-compose.yml  .github/workflows/ci.yml  package.json

apps/api/
├── prisma/                      # schema.prisma (copy of the frozen contract) + migrations (incl. raw SQL) + seed
├── src/
│   ├── main.ts                  # helmet + enableCors (allowlist from CORS_ORIGINS) before routes
│   ├── app.module.ts
│   ├── common/                  # NO business logic
│   │   ├── prisma.service.ts
│   │   ├── correlation-id.middleware.ts
│   │   ├── logging.interceptor.ts           # json ConsoleLogger, 1 line/request, no amounts/descriptions
│   │   ├── domain-errors.ts                 # + colocated .spec.ts
│   │   ├── http-exception.filter.ts         # + colocated .spec.ts — the ONLY error→HTTP mapping
│   │   └── money.decorator.ts               # + colocated .spec.ts — pattern + ±10^15 guard after BigInt
│   └── modules/<module>/        # identical layout in all 7 modules
│       ├── <module>.module.ts   # wires providers, imports other modules, exports ONLY services
│       ├── controllers/         # HTTP only; no business logic, no doc decorators
│       ├── services/            # the module's only public surface; <module>.service.ts + .spec.ts (repo mocked)
│       ├── repositories/        # the only files touching Prisma
│       ├── domain/              # pure functions, bigint; no @nestjs/*, no @prisma/*; each file + .spec.ts
│       └── dtos/                # in/out; out-DTOs expose `static from(...)` + .spec.ts (bigint→string, guard limits)
└── test/                        # the ONLY api tests outside colocation: supertest e2e (.e2e-spec.ts)
    ├── <module-or-flow>.e2e-spec.ts         # one per module/flow, ajv-validated against the yaml
    ├── security-headers.e2e-spec.ts         # helmet + CORS contract
    └── integrity.e2e-spec.ts                # global sum-to-zero + snapshot reconciliation

apps/web/
├── public/docs/                 # swagger-ui-dist assets + openapi.yaml copy (build step)
└── src/
    ├── app/                     # entry, providers (QueryClient, router), imports design/tokens.css
    ├── routes/                  # one route per screen; composition only
    ├── features/<screen>/       # accounts, transactions, report, upcoming, projection, projects, similar, categories
    │   └── components/<Component>/<Component>.tsx + <Component>.test.tsx   # + hooks/, forms of that screen
    ├── shared/ui/<Component>/   # design-system components (pickers, money input, empty state, table, modal)
    └── shared/lib/
        ├── money.ts + money.test.ts   # the ONLY module touching raw cents: branded Cents, parser, formatter, BigInt ops
        ├── api.ts                     # openapi-fetch client, baseUrl constant — the only network access
        ├── form-errors.ts + test      # ErrorResponse.details → setError mapper (shared helper)
        └── query-keys.ts              # single query-key factory (FR-028 invalidation depends on it)

packages/contract/
└── src/types.ts                 # generated by openapi-typescript reading the frozen yaml in
                                 # specs/001-…/contracts/ directly (single copy, no duplicate)
                                 # — never edited by hand

e2e/
├── playwright.config.ts
└── specs/story-1-accounts … story-6-similar.spec.ts   # vs the compose stack, keyboard-only
```

**Structure Decision**: pnpm monorepo with four workspace packages as above. Conventions
fixed here so tasks.md does not improvise: test names `.spec.ts` (api) / `.test.tsx`·`.test.ts`
(web); file names kebab-case in the api (Nest convention), component folders PascalCase in
the web; **no barrel files** (`index.ts` re-exports hide the cycles `import/no-cycle` must
see) — import the file directly; one service per api module; controllers and repositories get
no mocked unit tests (the supertest e2e against real Postgres covers them — logic that
accumulates there moves to `domain/`); features never import other features (shared code is
promoted to `shared/`); every hex lives in `design/tokens.css`.

## Module dependency graph (Principle VII — frozen, research R-015)

```text
ledger        → (nothing)               # the double-entry engine: transactions, entries,
                                        # system accounts, snapshots, toEntries, balanceAt,
                                        # list queries, reconciliation, rebuild
categories    → ledger                  # category + its system account in one atomic write
projects      → ledger                  # project spend figures read from the ledger
accounts      → ledger, categories, projects
              # owns /accounts AND /transactions: validates account rules itself, delegates
              # category/project checks, then calls LedgerService — this placement is what
              # keeps the graph acyclic (opening balances need accounts→ledger; transaction
              # validation would otherwise need ledger→accounts)
scheduled-items → accounts, categories  # confirm records a transaction via accounts' service
reports       → ledger, categories      # monthly + similar, pure domain over ledger reads
ai            → reports                 # narrative over the same grouped data
```

Cross-module atomic flows (account+opening, category+system account, confirm+advance) pass
the interactive Prisma transaction client through the public service call. `LedgerService`
enforces intent shape, translation and sum-to-zero; entity-state rules (archived, type match,
project status) belong to the modules that own those entities.

## Story × module matrix (scope of each tasks.md phase)

| Story                            | API modules touched                             | Web (features/screens)             |
| -------------------------------- | ----------------------------------------------- | ---------------------------------- |
| US1 Accounts & transactions (P1) | accounts (+ledger, categories, projects wiring) | accounts, transactions, categories |
| US2 Balances (P2)                | accounts, ledger (balanceAt, snapshots)         | accounts (dashboard, as-of view)   |
| US3 Monthly report (P3)          | reports (+categories)                           | report                             |
| US4 Scheduled & projection (P4)  | scheduled-items (+accounts, categories)         | upcoming, projection               |
| US5 Projects (P5)                | projects (+accounts for tagging)                | projects                           |
| US6 Similar + AI (P6)            | reports, ai                                     | similar                            |

Phases follow the template: Setup, Foundational, one per story in priority order, Polish —
never one per module. Foundational delivers: Prisma schema + raw-SQL migration, seed
skeleton, `common/` (filter, errors, correlation id, logging, PrismaService, money
decorator), helmet + CORS in `main.ts`, the ledger module core, `contract:check`,
`/docs` static pipeline, a Playwright smoke spec (the SPA loads and `/docs` responds — the UI
stage has something real to run before any story screen exists), CI green end to end.

## Frontend implementation rules (fixed here)

- **Money**: `shared/lib/money.ts` only — branded `Cents` over string; parser accepts
  `1234.5`, `1,234.50`, `$1,234.50`, rejects >2 decimals; formatter splits the string by
  hand; comparison/addition via `BigInt` only; no `number` arithmetic, no `<`/`>` between
  strings; no component renders raw cents (asserted in component tests, SC-009).
- **Forms** (React Hook Form, no resolver, no zod): value types derive from generated
  contract types; native RHF rules (`required`, `maxLength` 60/120) + `money.ts` parser as
  `validate`; server `details` → `setError` via the shared `form-errors.ts` helper;
  field-less errors shown at form level with the correlation id (SC-011); custom pickers via
  `Controller`; `shouldFocusError` + `aria-describedby`/`aria-invalid` (FR-034). Submit via
  TanStack Query mutations; success invalidates every entry-derived query family from
  `query-keys.ts` — balances, transaction lists, monthly and similar reports, projection and
  project figures — so no on-screen view can go stale, not only the FR-028 balance floor.
- **Prototype fidelity**: `design/screens/` prototypes are reference, not code — tokens from
  `design/tokens.css` (never the prototype's inline hex), "today" from `APP_TIMEZONE` (never
  the prototype's hard-coded TODAY), money never through the prototype's float demo math.
  Interaction details adopted: relative due labels in Upcoming ("Due today"/"Due in N days"/
  "Due tomorrow"/"Overdue N days"), amount autofocus on create (not edit), blur-normalisation
  to `1,234.50` (invalid input left as typed for validation to report), transfer destination
  picker showing source disabled with "— source" and archived with "— archived", clickable
  transaction rows to edit from the monthly report, project detail and similar top-5.
- **Out of this plan**: the UX-feedback layer (Undo toast, N shortcut, row flash, modal
  dirty-guard) — Undo is in the spec's Out of Scope; deferred to feature 002. The prototype's
  save toasts are ignored.

## Tests & CI (Principle VI)

Unit (colocated, no Nest/no Postgres): everything listed in the Constitution Check row VI.
Services with mocked repositories cover orchestration only; real transactionality is e2e's
job. Component tests: render + own interaction, money components assert dollars-only.
API e2e (supertest, real Postgres): accounts, every intent, balances, reports, SC-006 error
catalogue, the four AI codes against a local HTTP stub of the provider (`LLM_BASE_URL`
pointed at it; empty key for `AI_NOT_CONFIGURED`), security headers + CORS, ajv against the
yaml per endpoint/status. UI e2e
(Playwright, Chromium, compose stack + demo seed): one spec per story, keyboard-only
(SC-012), dollars-never-cents (SC-009), refetch-after-write without reload (FR-028), errors
beside fields + correlation id (SC-011). No automated-accessibility package (out of scope).
Global integrity + snapshot reconciliation on every run. GitHub Actions: Node 24 →
oxlint --type-aware → typecheck (tsc TS7) → contract:check → unit → api e2e (postgres:18
service container) → integrity + reconciliation → Playwright vs compose, uploading report and
traces as artifacts on failure.

## Complexity Tracking

| Entry                                                    | Why needed                                                                                                                                                         | Simpler alternative rejected because                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Balance snapshot cache (`balance_snapshots`)             | FR-012 mandates a cached balance layer updated in the same transaction as entry writes; serves the hottest reads (account list, dashboard total, projection start) | "No cache" violates FR-012. Month-end snapshots rejected (research R-007): backdated edits would have to invalidate later snapshots inside the write path — complexity with no measured need at 5 000 transactions. Ceiling marked in code: add month-end snapshots if as-of-date p95 nears SC-008 budget. |
| _(conditional)_ `typescript-api: npm:typescript@6` alias | Only if openapi-typescript cannot run on TS7 (research R-002, verified in Setup)                                                                                   | Downgrading the project to TS6 rejected: directive fixes TS7; alias scopes TS6 to the one tool, with a comment naming the ceiling (drop when the tool supports TS7).                                                                                                                                       |
| _(conditional)_ SWC build for the api                    | Only if TS7's `tsc` does not emit decorator metadata (research R-002)                                                                                              | Hand-rolled decorator shims rejected; SWC ships inside `@nestjs/cli`, `tsc` (TS7) stays the typechecker.                                                                                                                                                                                                   |

## Phase 1 re-evaluation

Design artifacts introduce no new principle violations: the contract exposes intent only
(III ✓), money as strings (II ✓), one error shape (V ✓), and the schema enforces sum-to-zero
and unique names in the database (I ✓, stack constraint ✓). Gate: **PASS**.
