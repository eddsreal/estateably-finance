---
description: 'Task list for Personal Finance Manager'
---

# Tasks: Personal Finance Manager

**Input**: Design documents from `/specs/001-personal-finance-manager/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml (FROZEN), contracts/schema.prisma (FROZEN), quickstart.md

**Tests**: NOT optional. Constitution Principle VI overrides this template's default: every
domain file, service, out-DTO and shared web lib ships with its colocated test in the same
task. e2e and Playwright specs are their own tasks.

**Organization**: Phases per the plan — Setup, Foundational, one per user story (P1–P6),
Polish. `/speckit-implement` delivers one phase and stops (CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US6, per spec.md priorities

## Path Conventions

pnpm monorepo (plan.md): `apps/api`, `apps/web`, `packages/contract`, `e2e`. Api tests
colocated as `.spec.ts` (supertest e2e in `apps/api/test/*.e2e-spec.ts` only); web tests
colocated as `.test.ts(x)`. No barrel files. Every hex in `design/tokens.css`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo skeleton, toolchain verification, compose, CI scaffold.

- [x] T001 Create monorepo skeleton at repo root: `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `e2e`), root `package.json` (`packageManager: pnpm@12.5`, `engines.node: 24`, root script names per quickstart.md), `.nvmrc` (24), `tsconfig.base.json` (`strict: true`), `.prettierrc`
- [x] T002 [P] Scaffold `apps/api`: package.json with exact pins from research R-001 (NestJS 12.1.0, prisma/@prisma/client 7.10.0 — never the 8.0 RC on `latest`, helmet 8.3.0, class-validator 0.15.1, class-transformer 0.5.1, vitest 5.0.1, supertest 7.3.0, ajv 8.20.0, typescript 7.0.2), tsconfig with `experimentalDecorators` + `emitDecoratorMetadata`, nest-cli.json
- [x] T003 [P] Scaffold `apps/web`: package.json pins (react 19.3.0, vite 8.3.0, @vitejs/plugin-react 6.1.1, react-router 8.4.0, @tanstack/react-query 5.103.2, react-hook-form 7.88.0 — v8 beta excluded, openapi-fetch 0.17.0, testing-library, jsdom 30.1.1), `vite.config.ts`, tsconfig
- [x] T004 [P] Scaffold `packages/contract`: package.json (openapi-typescript 7.13.0 dev), `contract:generate` script emitting `packages/contract/src/types.ts` from `specs/001-personal-finance-manager/contracts/openapi.yaml` read in place (single copy, R-014); generated file never edited by hand
- [x] T005 [P] Scaffold `e2e`: package.json (playwright 1.63.0), `e2e/playwright.config.ts` (Chromium only, baseURL http://localhost:8080)
- [x] T006 Run the two research R-002 verifications: (1) TS7 `tsc` emits decorator metadata for a minimal Nest+class-validator sample; (2) `contract:generate` runs on TS7. On failure apply the pre-approved fallback (SWC builder via `@nestjs/cli` / `"typescript-api": "npm:typescript@6"` alias scoped to openapi-typescript, ceiling comment) and record it in plan.md Complexity Tracking
- [x] T007 [P] Create root `.oxlintrc.json` per research R-003: plugins typescript/react/react-hooks/jsx-a11y/import/vitest, `correctness: error`, `import/no-cycle: error`, `no-restricted-imports` (domain may not import `@nestjs/*`/`@prisma/*`; modules may only import other modules' `services/`); wire `lint` (incl. `--type-aware` with oxlint-tsgolint 7.0.2002) and `typecheck` root scripts
- [x] T008 [P] Create `.env.example` with exactly the FR-035 seven plus `DATABASE_URL` and their defaults (research R-016; FR-035 amended 2026-09-22 to include `NODE_ENV`): `DATABASE_URL`, `APP_TIMEZONE=UTC`, `LOG_LEVEL=info`, `LLM_API_KEY=`, `LLM_TIMEOUT_MS=10000`, `LLM_BASE_URL=https://api.anthropic.com`, `CORS_ORIGINS=http://localhost:5173,http://localhost:8080`, `NODE_ENV=development` (HSTS only under `production`, R-006). Never invent another variable
- [x] T009 [P] Create `docker-compose.yml` (postgres:18; api on node:24 port 3000 with `NODE_ENV=production`; web = Vite build served by nginx on 8080 incl. `/docs`) and `apps/web/nginx.conf` with the SPA CSP, `X-Content-Type-Options` and `Referrer-Policy` from research R-005
- [x] T010 Create `.github/workflows/ci.yml`: Node 24 → oxlint --type-aware → typecheck (tsc TS7) → contract:check → unit → api e2e (postgres:18 service container) → integrity + reconciliation → Playwright vs compose, uploading report/traces on failure (stages may reference scripts landed in Phase 2)

**Checkpoint**: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm contract:generate` all pass.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema + raw SQL, `common/`, main.ts security, ledger module core, seed
skeleton, contract:check, `/docs`, web shell, smoke + integrity e2e, CI green.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T011 Copy frozen `specs/001-personal-finance-manager/contracts/schema.prisma` to `apps/api/prisma/schema.prisma` (byte-identical) and create the first migration in `apps/api/prisma/migrations/` including the raw SQL of data-model.md verbatim: `entries_sum_to_zero()` DEFERRABLE INITIALLY DEFERRED constraint trigger, unique indexes on `lower(trim(name))` for accounts/categories/projects, CHECKs `num_nonnulls(account_id, system_account_id) = 1` and `amount <> 0`, `(kind = 'category') = (category_id IS NOT NULL)`, and the `INSERT INTO system_accounts (kind) VALUES ('equity')` row
- [x] T012 [P] Create `apps/api/src/common/prisma.service.ts` (PrismaClient lifecycle, interactive-transaction helper)
- [x] T013 [P] Create `apps/api/src/common/correlation-id.middleware.ts`: per-request `crypto.randomUUID()`, inbound values ignored, echoed as `X-Correlation-Id` response header, attached to request context (research R-009)
- [x] T014 [P] Create `apps/api/src/common/logging.interceptor.ts`: Nest `ConsoleLogger` json mode, exactly one line per request (correlation id, method, route, status, duration ms), level from `LOG_LEVEL`, never an amount or description in a log line (FR-033)
- [x] T015 [P] Create `apps/api/src/common/domain-errors.ts` + colocated `domain-errors.spec.ts`: typed domain error classes for the R-011 422 catalogue (archived account, category type mismatch, same-account transfer, closed project, project on non-expense, delete of used project, opening-kind change, type change on used category, future date, range > 24 months)
- [x] T016 Create `apps/api/src/common/http-exception.filter.ts` + `.spec.ts`: the ONLY error→HTTP mapping, full research R-011 catalogue (`VALIDATION_FAILED` 400, `NOT_FOUND` 404, `DUPLICATE_NAME` 409, `DOMAIN_RULE_VIOLATION` 422, `AI_NOT_CONFIGURED` 422, `AI_PROVIDER_ERROR` 502, `AI_RATE_LIMITED` 503, `AI_TIMEOUT` 504, `INTERNAL_ERROR` 500 with stack logged), frozen `ErrorResponse` shape with `correlationId` and field-level `details` (FR-023)
- [x] T017 [P] Create `apps/api/src/common/money.decorator.ts` + `.spec.ts`: class-validator decorator — pattern `^-?[0-9]{1,16}$` then `BigInt(value)` then ±10^15 guard (FR-022); spec covers both guard limits and signed/positive variants
- [x] T018 Create `apps/api/src/main.ts` + `apps/api/src/app.module.ts`: helmet before routes (API CSP `default-src 'none'; frame-ancestors 'none'`, `X-Powered-By` off, HSTS only when `NODE_ENV === 'production'` with the R-006 ceiling comment), `enableCors` from `CORS_ORIGINS` (methods, `credentials: false`, `exposedHeaders: ['X-Correlation-Id']`, `maxAge: 3600` per R-004), global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform), correlation middleware, logging interceptor, exception filter
- [x] T019 Create `apps/api/src/modules/ledger/domain/to-entries.ts` + `.spec.ts`: `LedgerService.toEntries`'s pure core — the ONLY intent→entries translation (Principle III): expense(a,A,C)→A:−a/system(C):+a; income→A:+a/system(C):−a; transfer(a,A,B)→A:−a/B:+a; opening(signed s,A)→A:+s/equity:−s; exactly two entries each; unbalanced/zero rejection; pure `bigint`, no @nestjs/* or @prisma/* imports
- [x] T020 [P] Create `apps/api/src/modules/ledger/domain/balance-at.ts` + `.spec.ts`: balanceAt(entries, date) = sum of non-deleted entries dated on or before date, `bigint`; spec covers before-first, between, on-date, today (US2 scenarios)
- [x] T021 Create `apps/api/src/modules/ledger/repositories/` (transactions, entries, system-accounts, balance-snapshots — the only files touching Prisma in this module)
- [x] T022 Create `apps/api/src/modules/ledger/services/ledger.service.ts` + `.spec.ts` (repos mocked) and `ledger.module.ts` (exports ONLY LedgerService): record intent / regenerate entries on edit / soft delete, each inside one interactive Prisma transaction that also updates `balance_snapshots` (FR-012); paginated list queries ordered `date DESC, id DESC` with total (FR-009, limit default 50 max 200); current-balance and balanceAt reads; accepts a passed-in transaction client for cross-module atomic flows; trusts callers for entity-state rules, enforces intent shape and sum-to-zero (R-015)
- [x] T023 Create reconciliation + rebuild in `apps/api/src/modules/ledger/` and wire root scripts `ledger:check` (recompute every snapshot from entries, fail naming each differing account/value; plus global sum-to-zero) and `ledger:rebuild` (recompute whole cache in one atomic write) per FR-031
- [x] T024 [P] Create deterministic seed skeleton `apps/api/prisma/seed.ts` + root `db:seed`/`db:migrate` scripts: exactly the 12 FR-003 categories (Groceries, Dining, Rent, Utilities, Transport, Health, Entertainment, Shopping, Travel expense; Salary, Freelance, Interest income) each with its system account; dates computed relative to seed-run "today" in `APP_TIMEZONE`; two runs on the same date byte-identical (data-model.md). Story data added in later phases
- [x] T025 [P] Create `contract:check` script (apps/api): instantiate AppModule without listening, diff registered routes against the frozen yaml's paths+methods, fail on any drift; also byte-diff `apps/api/prisma/schema.prisma` against `specs/001-personal-finance-manager/contracts/schema.prisma` (R-014)
- [x] T026 [P] Add `/docs` static pipeline to the web build: copy swagger-ui-dist 5.33.0 assets + the frozen yaml into `apps/web/public/docs/` as a build step; served by Vite (dev) and nginx (compose), no CDN (R-014)
- [x] T027 Create web shell `apps/web/src/app/`: entry, providers (QueryClient, react-router), import `design/tokens.css`; app renders an empty route shell
- [x] T028 [P] Create `apps/api/test/integrity.e2e-spec.ts`: global sum-to-zero over the seeded DB + snapshot reconciliation passes; deliberately corrupting one snapshot makes `ledger:check` fail naming it (SC-002, SC-010)
- [x] T029 [P] Create `apps/api/test/security-headers.e2e-spec.ts`: helmet headers present, HSTS present iff `NODE_ENV=production`, allowed origin echoed, foreign origin gets no CORS headers, preflight OPTIONS answered, `X-Correlation-Id` exposed (R-004/R-005/R-006)
- [x] T030 [P] Create Playwright smoke spec `e2e/specs/smoke.spec.ts`: the SPA loads and `/docs` responds against the compose stack
- [x] T031 Make CI green end to end: all `.github/workflows/ci.yml` stages pass on this phase's code (lint, typecheck, contract:check, unit, api e2e, integrity, Playwright smoke)

**Checkpoint**: Foundation ready — user story phases can begin.

---

## Phase 3: User Story 1 - Accounts and transactions (Priority: P1) 🎯 MVP

**Goal**: manage accounts (bank/cash/card, signed opening balances) and record/edit/delete
expense, income and transfer transactions over the double-entry ledger; manage categories.

**Independent Test** (spec US1): create two accounts with opening balances, record an
expense, an income and a transfer, edit one, delete another; at every step each balance
matches hand arithmetic and all ledger entries sum to zero.

### Implementation for User Story 1

- [x] T032 [P] [US1] Create categories module `apps/api/src/modules/categories/`: repository, `categories.service.ts` + `.spec.ts` (create category + its system account in one atomic write via LedgerService with the passed transaction client; rename; archive/unarchive symmetric; list; type changeable only while no transaction — soft-deleted included — references the category, else `DOMAIN_RULE_VIOLATION` (FR-003 as amended 2026-09-22); spec covers unused-change ok / used-change rejected; `DUPLICATE_NAME` surfaced from the unique index), `categories.module.ts` exporting only the service
- [x] T033 [US1] Create categories controllers + DTOs in `apps/api/src/modules/categories/{controllers,dtos}/` for listCategories/createCategory/updateCategory/archiveCategory/unarchiveCategory (yaml operationIds); update DTO carries the optional `type` per the amended contract (used-category change → `DOMAIN_RULE_VIOLATION`); out-DTOs `static from(...)` + `.spec.ts`; name rule "1–60 chars after trimming surrounding whitespace" (FR-030)
- [x] T034 [P] [US1] Create projects module skeleton `apps/api/src/modules/projects/`: repository + `projects.service.ts` + `.spec.ts` exposing only the validation US1 needs — project exists and is `active`, else `DOMAIN_RULE_VIOLATION` (FR-020); full surface lands in US5; `projects.module.ts` exporting only the service
- [x] T035 [US1] Create accounts module `apps/api/src/modules/accounts/`: repositories + `accounts.service.ts` + `.spec.ts` — create account (name 1–60 trimmed, kind bank|cash|card) with atomic opening transaction via LedgerService when opening balance ≠ 0 (signed, may be negative, never zero-amount); edit kind/name/opening balance/date — zero→non-zero records the opening transaction, non-zero→zero deletes it (FR-001); archive/unarchive symmetric, archived excluded from totals; list with snapshot balances + total across non-archived
- [x] T036 [US1] Create `apps/api/src/modules/accounts/services/transactions.service.ts` + `.spec.ts`: record/edit/delete/list via LedgerService; edit submits a complete new intent, kind may change among expense/income/transfer, `opening` never interchanges (FR-007); validations before translation: amount positive (money decorator), description "between 1 and 120 characters after trimming, empty or whitespace-only rejected" (FR-005), date ≤ today in `APP_TIMEZONE` (FR-029), archived/missing account or category rejected, category type matches kind, transfers carry no category and no project, same-account transfer rejected, project only on expense and must be active (delegated to projects service), date-range filter "start on or before end, at most 24 months" (FR-009)
- [x] T037 [US1] Create accounts + transactions controllers and DTOs in `apps/api/src/modules/accounts/{controllers,dtos}/` for listAccounts/createAccount/updateAccount/archiveAccount/unarchiveAccount and listTransactions/createTransaction/updateTransaction/deleteTransaction; intent in-DTOs discriminated by `kind` mirroring the yaml discriminator (Principle V); money as JSON strings of integer cents; out-DTOs `static from(...)` + `.spec.ts` at the bigint→string guard limits; pagination limit default 50, above 200 → `VALIDATION_FAILED`, `total` in every list, offset past the end → empty page with correct total
- [x] T038 [US1] Extend `apps/api/prisma/seed.ts`: accounts "Checking" (bank, $1,500.00 opening on first seeded month's 1st), "Savings" (bank), "Visa" (card, −$500.00 opening), "Cash" (cash), archived "Old Bank" with readable history; 60–100 hand-checkable transactions over the 3 months ending today, every category active, ≥1 transfer per month, one archived category with historical expenses, descriptions exercising FR-014 grouping ("Uber 1234", "UBER 5678", "uber", …) per data-model.md
- [x] T039 [P] [US1] Create `apps/api/test/accounts.e2e-spec.ts` (real Postgres, every response ajv-validated against the yaml): create/edit incl. opening-balance edits and the zero↔non-zero cases, negative opening (US1 #11), archive/unarchive with totals, `DUPLICATE_NAME` incl. archived names, `NOT_FOUND`
- [x] T040 [P] [US1] Create `apps/api/test/transactions.e2e-spec.ts` (ajv-validated): all four intents' effects on balances and entries, kind-change edit incl. expense→transfer clearing category (US1 #5a), soft delete, a transaction dated before the account's opening date accepted and reflected in the as-of balance (spec edge case), pagination + deterministic `date DESC, id DESC` ordering, and the full FR-008 rejection catalogue writing nothing (SC-006): $0.00, negative, missing account, non-existent category, type mismatch, future date, same-account transfer, description rule, >10^15 cents
- [x] T041 [P] [US1] Create `apps/web/src/shared/lib/money.ts` + `money.test.ts`: branded `Cents` over string, parser accepting `1234.5`, `1,234.50`, `$1,234.50` and rejecting >2 decimals (FR-027), hand-split formatter to `$1,234.50`/`-$120.00` (explicit minus, FR-026), comparison/addition via `BigInt` only — the ONLY web module touching raw cents
- [x] T042 [P] [US1] Create `apps/web/src/shared/lib/api.ts` (openapi-fetch client over `packages/contract` types, baseUrl constant `http://localhost:3000` with ceiling comment — the only network access) and `apps/web/src/shared/lib/query-keys.ts` (single query-key factory; FR-028 invalidation depends on it)
- [x] T043 [P] [US1] Create `apps/web/src/shared/lib/form-errors.ts` + `form-errors.test.ts`: `ErrorResponse.details` → RHF `setError` per field; field-less errors surfaced at form level with the correlation id (SC-011)
- [x] T044 [US1] Create shared UI components in `apps/web/src/shared/ui/` per design/design-system.md + tokens.css (no hard-coded hex): `MoneyInput/` (dollars in, blur normalises to `1,234.50`, invalid input left as typed, autofocus on create not edit), `EmptyState/`, `Modal/`, `Table/` — each `<Component>.tsx` + `.test.tsx`; labels, keyboard, visible focus, `aria-describedby`/`aria-invalid` (FR-034)
- [x] T045 [US1] Create pickers in `apps/web/src/shared/ui/`: `AccountPicker/` (transfer destination shows source disabled with "— source", archived with "— archived") and `CategoryPicker/` (filtered by type, archived excluded), RHF `Controller`-compatible, keyboard-operable + `.test.tsx`
- [x] T046 [US1] Create `apps/web/src/features/accounts/`: account list with balances + dashboard total, create/edit form (name, kind, opening balance via MoneyInput, opening date via `<input type="date">`), archive/unarchive; RHF native rules (`required`, `maxLength` 60) + money parser as `validate`, server errors via form-errors.ts, mutations invalidate every entry-derived query family; component tests assert dollars-only (SC-009)
- [x] T047 [P] [US1] Create `apps/web/src/features/categories/`: category management screen (list incl. type, create/edit `maxLength` 60, archive/unarchive, empty state) + component tests
- [x] T048 [US1] Create `apps/web/src/features/transactions/`: paginated list (50/page, position from `total`, filters date-range/kind/category/project, clickable rows to edit) and the intent forms — expense/income/transfer with kind switch on edit dropping/requiring fields per FR-007, description `maxLength` 120, TanStack Query mutations invalidating balances, lists, reports, projection and project figures from query-keys.ts (FR-028); refetch failure keeps the mutation, says so, offers retry, never shows pre-mutation balances as current; component tests
- [x] T049 [US1] Wire routes in `apps/web/src/routes/` for accounts, transactions, categories screens (composition only)
- [x] T050 [US1] Create `e2e/specs/story-1-accounts.spec.ts` (Playwright, keyboard-only, vs compose + seed): US1 acceptance scenarios 1–11 — create, record all kinds, edit incl. kind change, delete, validation errors beside fields with correlation id, archive/unarchive, dollars-never-cents, balances update without reload

**Checkpoint**: US1 fully functional — the MVP. Stop for approval before Phase 4.

---

## Phase 4: User Story 2 - Balances now and at any date (Priority: P2)

**Goal**: real-time (read-after-write) current balances and balance as of any date.

**Independent Test** (spec US2): with known dated transactions, request balances for dates
before/between/on-date/today and match hand-computed values.

### Implementation for User Story 2

- [x] T051 [US2] Implement getAccountBalanceAsOf: controller route + query DTO (date validation) + out-DTO `static from(...)` + `.spec.ts` in `apps/api/src/modules/accounts/`, reading through LedgerService.balanceAt (computed from entries, R-007); before-opening dates answer "0"
- [x] T052 [P] [US2] Create `apps/api/test/balances.e2e-spec.ts` (ajv-validated): US2 scenarios — $4,457.50 current, $1,457.50 as of 09-12 and 09-10, $0.00 before opening, value identical with snapshot present, absent and deliberately wrong-then-rebuilt (SC-003), read immediately after create/edit/delete reflects the change (FR-028). The spec creates its own accounts and transactions (the exact US2 scenario) through the API; it never reads the demo seed's accounts, whose balances these figures cannot match
- [x] T053 [US2] Extend `apps/web/src/features/accounts/`: account detail with as-of-date balance view (`<input type="date">`), dashboard total across non-archived accounts; verify every balance on screen refetches after each mutation without reload via the query-keys families; component tests
- [x] T054 [US2] Create `e2e/specs/story-2-balances.spec.ts`: keyboard-only — hand-checkable as-of values on the seed, record a transaction and watch balances + total update without a full-page reload (FR-028)

**Checkpoint**: US1 + US2 independently functional. Stop for approval.

---

## Phase 5: User Story 3 - Monthly expenses by category (Priority: P3)

**Goal**: per-month expense totals by category with drill-down; income/transfers absent.

**Independent Test** (spec US3): expenses across categories and two months plus an income
and a transfer; each month's report shows correct per-category totals and grand total.

### Implementation for User Story 3

- [x] T055 [US3] Create reports module `apps/api/src/modules/reports/` with `domain/monthly-report.ts` + `.spec.ts`: pure `bigint` grouping per expense-type category system account for a month, grand total = sum of category totals, categories without activity omitted, income/transfers absent by construction (FR-013, data-model.md derived reads)
- [x] T056 [US3] Create `reports.service.ts` + `.spec.ts`, `reports.module.ts` (imports ledger + categories, exports only the service), controller + DTOs for getMonthlyReport (`/reports/monthly`) incl. the transactions behind each category; out-DTO `from(...)` `.spec.ts`
- [x] T057 [P] [US3] Create `apps/api/test/reports-monthly.e2e-spec.ts` (ajv-validated): US3 scenarios — Groceries $72.50 / Rent $120.00 / total $192.50, empty month "0" total, drill-down rows, edit moving a transaction between months moves it between reports (SC-004)
- [x] T058 [US3] Create `apps/web/src/features/report/` + route: month switcher (no reload, month in page state), per-category rows expanding to their transactions, clicking a transaction opens its edit (plan interaction details), grand total, empty state; component tests assert dollars-only
- [x] T059 [US3] Create `e2e/specs/story-3-report.spec.ts`: keyboard-only — seeded month totals sum to grand total, drill-down, edit into last month moves both reports, month switch without reload

**Checkpoint**: US1–US3 independently functional. Stop for approval.

---

## Phase 6: User Story 4 - Future bills, income and budget projection (Priority: P4)

**Goal**: scheduled items (once/weekly/monthly, end dates, overdue) and the running
projection of total balance up to a horizon; mark-as-paid records a real transaction.

**Independent Test** (spec US4): with a known total, create one-off/monthly/weekly items,
verify projections for several horizons against hand-expanded occurrences, mark one paid
and verify the transaction plus the item's advance.

### Implementation for User Story 4

- [x] T060 [US4] Create scheduled-items module `apps/api/src/modules/scheduled-items/` with `domain/recurrence.ts` + `.spec.ts` and `domain/projection.ts` + `.spec.ts` (pure, `bigint`): expansion for once/weekly/monthly, "a monthly recurrence anchored on the 29th, 30th or 31st falls on the last day of any shorter month" (FR-016), end-date cutoff, one overdue occurrence per missed period since nextDueDate (FR-017), overdue placed at the start of the series, running balance series from the current total, horizon capped at 24 months
- [x] T061 [US4] Create repository + `scheduled-items.service.ts` + `.spec.ts` + `scheduled-items.module.ts` (imports accounts + categories, exports only the service): CRUD with FR-016 rejections (amount positive, "next due date earlier than today when created" rejected while an edit may set the past ⇒ overdue, missing/archived account or category, category type vs kind, end date ≥ next due date); confirm (FR-018): pre-validated confirmed values recorded as an ordinary transaction via the accounts transactions service and nextDueDate advanced one period (month-end clamp) or status → `completed` (once, or advance past endDate), both in one atomic transaction via the passed client; item's own amount/recurrence never altered; no FK from transaction to item
- [x] T062 [US4] Create controllers + DTOs for listScheduledItems/createScheduledItem/updateScheduledItem/deleteScheduledItem/confirmScheduledItem and getProjection (`/projection`); out-DTOs `from(...)` + `.spec.ts`; upcoming list ordered by due date with overdue and archived-account flags
- [x] T063 [US4] Extend `apps/api/prisma/seed.ts`: one `once` bill, one `monthly` bill anchored on the 31st, one `weekly` income, one end-dated item, one overdue item; amounts sized so the projection to end of next month dips below zero at least once (data-model.md)
- [x] T064 [P] [US4] Create `apps/api/test/scheduled-items.e2e-spec.ts` (ajv-validated): CRUD, every FR-016 rejection writing nothing (SC-006), confirm with changed amount+date (US4 #7a: $1,250.00 on 10-03 recorded, item keeps $1,200.00 and advances to 11-01), once-item completion, end-date completion, confirm on archived account rejected
- [x] T065 [P] [US4] Create `apps/api/test/projection.e2e-spec.ts` (ajv-validated): US4 horizons ($5,457.50 / $7,257.50), weekly expansion 10-01…10-29, overdue counted from series start with one occurrence per missed period, an item due today counted until confirmed and absent afterwards (spec edge case), end-date cutoff, >24-month horizon rejected, running balances (SC-005). The spec creates its own accounts and scheduled items (the exact US4 scenario) through the API; it never reads the demo seed's items, whose figures these horizons cannot match
- [x] T066 [US4] Create `apps/web/src/features/upcoming/` + route: items ordered by due date with relative labels ("Due today"/"Due tomorrow"/"Due in N days"/"Overdue N days"), overdue and archived-account flags, create/edit form (pickers, recurrence, optional end date), confirm modal pre-filled with amount/date/account/category/description all editable (FR-018), empty state; component tests
- [x] T067 [US4] Create `apps/web/src/features/projection/` + route: horizon picker (≤24 months), running series with each occurrence and balance after it, below-zero occurrences visibly flagged not by colour alone (FR-026/FR-034), final projected balance; confirm/edit mutations invalidate projection queries; component tests
- [x] T068 [US4] Create `e2e/specs/story-4-scheduled.spec.ts`: keyboard-only — seeded items with relative labels, overdue flagged, hand-checked projection with the below-zero flag, mark rent paid with changed amount/date, item advances, projection and report update

**Checkpoint**: US1–US4 independently functional. Stop for approval.

---

## Phase 7: User Story 5 - Expenses per project (Priority: P5)

**Goal**: tag expenses with a project; per-project spent, remaining budget, over-budget
flag and expense list; close/reopen; delete only while unused.

**Independent Test** (spec US5): project with budget, expenses tagged from two accounts,
verify spent/remaining/list; untagged expense not counted.

### Implementation for User Story 5

- [ ] T069 [US5] Complete `apps/api/src/modules/projects/`: service + `.spec.ts` — create/edit (name 1–60 trimmed unique incl. closed, budget "positive when present; absent ≠ zero" per FR-019 as amended 2026-09-22, zero/negative → structured error), close/reopen reversible, delete only when no transaction rows reference it (soft-deleted included) else `DOMAIN_RULE_VIOLATION` telling the user to close (data-model.md), report per project: spent = Σ non-deleted expense transactions via ledger reads, remaining/over-budget only when a budget exists (FR-021)
- [ ] T070 [US5] Create projects controllers + DTOs for listProjects/createProject/updateProject/deleteProject/closeProject/reopenProject/listProjectTransactions; out-DTOs `from(...)` + `.spec.ts` (budget/remaining absent, not zero, when no budget — US5 #8)
- [ ] T071 [US5] Extend `apps/api/prisma/seed.ts`: project "Trip to France" with budget and tagged expenses from two accounts, plus one closed project (data-model.md)
- [ ] T072 [P] [US5] Create `apps/api/test/projects.e2e-spec.ts` (ajv-validated): spent/remaining across accounts, over-budget flag + overrun, untag removes from total, delete-used rejected then close/reopen cycle, project on transfer/income rejected, closed project on new transactions and edits rejected (FR-020, SC-006), no-budget shape
- [ ] T073 [US5] Create `apps/web/src/features/projects/` + route + `ProjectPicker` in `apps/web/src/shared/ui/`: project list (status, spent, remaining), detail (over-budget flag with overrun, expense list), create/edit/close/reopen, delete offered only when unused with the structured-error path; expense form gains the optional project picker (expenses only); component tests
- [ ] T074 [US5] Create `e2e/specs/story-5-projects.spec.ts`: keyboard-only — US5 scenarios on the seed incl. tagging from two accounts, over-budget display, delete rejected → close → reopen

**Checkpoint**: US1–US5 independently functional. Stop for approval.

---

## Phase 8: User Story 6 - Similar-transaction report + AI narrative (Priority: P6)

**Goal**: deterministic grouping of similar transactions with top-5 highlights; optional
LLM narrative that fails structurally and never touches the deterministic report.

**Independent Test** (spec US6): seeded descriptions differing in case/whitespace/trailing
digits group correctly for a range; narrative endpoint answers the four AI codes.

### Implementation for User Story 6

- [ ] T075 [US6] Create `apps/api/src/modules/reports/domain/normalise.ts` + `.spec.ts` and `domain/similar-report.ts` + `.spec.ts`: research R-010 normalisation (trim, lowercase, collapse whitespace, strip one trailing digit run; empty result → trimmed original as key), grouping with count/total per group ordered by total descending, five most expensive transactions, most expensive group; spec covers "Uber 1234"/"UBER 5678"/"uber" → one group, "Flat 4B" untouched, "12345" grouped as itself, empty range → empty report
- [ ] T076 [US6] Implement getSimilarReport (`/reports/similar`) in the reports module: service method, controller, DTOs (+ `from(...)` `.spec.ts`); date range bounded per FR-009 (start ≤ end, ≤24 months)
- [ ] T077 [US6] Create ai module `apps/api/src/modules/ai/` + `ai.module.ts` (imports reports, exports only the service): `ai.service.ts` + `.spec.ts` calling `POST {LLM_BASE_URL}/v1/messages` with native fetch (no SDK), headers `x-api-key`/`anthropic-version: 2023-06-01`, model constant `claude-haiku-4-5-20251001` with ceiling comment, `AbortSignal.timeout(LLM_TIMEOUT_MS)`, no retries; empty `LLM_API_KEY` → `AI_NOT_CONFIGURED` without any network call; 429 → `AI_RATE_LIMITED`, other non-2xx → `AI_PROVIDER_ERROR`, timeout → `AI_TIMEOUT` (R-011/R-012); controller for generateSimilarNarrative (`/reports/similar/narrative`)
- [ ] T078 [P] [US6] Create `apps/api/test/reports-similar.e2e-spec.ts` (ajv-validated): seeded Uber group count 3 with summed amount, ordering by total desc, top-5 + top group, deterministic across two runs, empty period without error, range rejections
- [ ] T079 [P] [US6] Create `apps/api/test/ai-narrative.e2e-spec.ts`: local HTTP stub with `LLM_BASE_URL` pointed at it — success narrative, `AI_NOT_CONFIGURED` (empty key, no request hits the stub), `AI_PROVIDER_ERROR` 502, `AI_RATE_LIMITED` 503, `AI_TIMEOUT` 504, all through the real global filter with correlation ids, ajv-validated
- [ ] T080 [US6] Create `apps/web/src/features/similar/` + route: date range, Generate report button, groups with count/total, top-5 and top-group highlights, Narrative button disabled when AI not configured, provider failure → dismissible notice while the grouped report stays on screen (FR-015); component tests
- [ ] T081 [US6] Create `e2e/specs/story-6-similar.spec.ts`: keyboard-only — seeded grouping, highlights, disabled narrative button without a key

**Checkpoint**: all six stories independently functional. Stop for approval.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T082 [P] Create `db:generate-perf` (FR-032) in `apps/api/prisma/generate-perf.ts`: ~5 000 transactions over 24 months, deterministic PRNG, explicit command only, never part of startup
- [ ] T083 [P] Create `perf:measure` script `scripts/perf-measure.mjs` per research R-013: native fetch, 20-request warmup then 200 sequential per endpoint (account list, transaction list default page, balance as-of, monthly report, 12-month projection), p95 = `sorted[ceil(0.95·n)-1]`; run it once against the compose stack + perf dataset and record the numbers vs SC-008 targets
- [ ] T084 [P] Write `README.md` per the quickstart.md content plan: what it is, `docker compose up` + three URLs + under-five-minutes claim, env table (the FR-035 seven + `DATABASE_URL`), scripts table, testing, performance, ten-line architecture, AI narrative note
- [ ] T085 FR-034/SC-012 audit across all 8 screens: every control labelled, keyboard-only operability with visible focus, errors tied to fields and announced, WCAG AA contrast (negative amounts not colour-alone), every list/report has its design-system empty state; fix findings in place
- [ ] T086 Final validation: cold `docker compose up` reviewer path (SC-007), quickstart walkthrough dry-run on the seed (SC-001), `ledger:check` corrupt→fail→`ledger:rebuild`→pass cycle, one deliberate UI error's correlation id found verbatim in exactly one stdout line with no amounts/descriptions logged (SC-011), full CI green, Prettier pass over every file this feature touched

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first; T002–T005 parallel after it; T006 after T002+T004; T007–T009 parallel; T010 last.
- **Foundational (Phase 2)**: needs Phase 1. T011 → T012–T017 (T016 after T015) → T018 → T019–T023 (ledger chain: T019/T020 → T021 → T022 → T023) → T024–T030 → T031. BLOCKS all stories.
- **User Stories (Phases 3–8)**: all need Phase 2. Sequential P1→P6 per CLAUDE.md (one phase per `/speckit-implement` run, approval between). US2 reads US1's data; US3 reports over US1; US4 confirms through US1's transaction surface; US5 completes US1's projects skeleton; US6 reports over US1's descriptions — but each story's _tests_ run independently on the seed.
- **Polish (Phase 9)**: after US1–US6.

### Within User Story 1

T032/T034 parallel → T033 → T035 → T036 → T037 → T038 → T039/T040 parallel.
Web: T041–T043 parallel → T044 → T045 → T046/T047/T048 → T049 → T050.

### Parallel Opportunities

- Phase 1: T002, T003, T004, T005 together; T007, T008, T009 together.
- Phase 2: T012–T015, T017 together; T024–T026, T028–T030 together.
- Each story: its e2e specs ([P] pairs like T039+T040, T064+T065, T078+T079) and its independent-file web libs (T041+T042+T043).
- Phase 9: T082, T083, T084 together.

## Parallel Example: User Story 1

```bash
# API modules that don't touch each other's files:
Task: "T032 categories module service + spec"
Task: "T034 projects module skeleton"

# Web shared libs, three independent files:
Task: "T041 shared/lib/money.ts + test"
Task: "T042 shared/lib/api.ts + query-keys.ts"
Task: "T043 shared/lib/form-errors.ts + test"

# Story e2e once implementation lands:
Task: "T039 accounts.e2e-spec.ts"
Task: "T040 transactions.e2e-spec.ts"
```

## Implementation Strategy

**MVP = Phases 1–3** (Setup, Foundational, US1): a usable single-account-book product —
accounts, categories, all transaction kinds, correct balances, CI green. Stop, validate
against US1's independent test, demo.

Then one story per `/speckit-implement` run in priority order — US2 (balances), US3
(monthly report), US4 (scheduled + projection), US5 (projects), US6 (similar + AI) — each
independently testable on the seed via its own Playwright spec, with user approval between
phases (CLAUDE.md: never chain phases). Polish last.

## Notes

- The contract is frozen: any change to `contracts/openapi.yaml` or `contracts/schema.prisma` goes back through plan.md, never through a task.
- Tests ship inside their implementation tasks (colocated) — Principle VI; e2e/Playwright are separate tasks so they can parallelise.
- Format every saved file with Prettier (project config); commit only when the user asks.
