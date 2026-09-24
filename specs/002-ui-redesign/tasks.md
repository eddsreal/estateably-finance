---
description: 'Task list for UI redesign — Screens v2 and Design System v2'
---

# Tasks: UI redesign — Screens v2 and Design System v2

**Input**: Design documents from `/specs/002-ui-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi-delta.yaml
(FROZEN), quickstart.md

**Tests**: NOT optional. Constitution Principle VI overrides this template's default: every
domain file, service, out-DTO, shared web lib and shared web component ships with its colocated
test in the same task. API e2e and Playwright specs are their own tasks.

**Organization**: Phases per the plan's Story → scope table: Setup, Foundational, one per user
story (P1–P7), Polish. `/speckit-implement` delivers one phase and stops (CLAUDE.md). Stories
5–7 slip first if the 2026-09-25 deadline is at risk (spec Assumptions).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US7, per spec.md priorities

## Path Conventions

The feature 001 pnpm monorepo: `apps/api`, `apps/web`, `packages/contract`, `e2e`. API tests
colocated as `.spec.ts` (supertest e2e only in `apps/api/test/*.e2e-spec.ts`). Web tests colocated
as `.test.ts(x)`. No barrel files. Features never import features. Shared web pieces live in
`apps/web/src/shared/ui/<Name>/<Name>.tsx` and `apps/web/src/shared/lib/`. No comments in code or
config. Every saved file is formatted with the project's Prettier config.

**Styling rule for every web task**: Tailwind utilities generated from `design/tokens.css` only.
No hex, `rgb(`, `hsl(`, `ms` literal or `px` literal other than `0` and `1px`, no arbitrary value
(`-[…]` or `[…]`), no bare `duration-N`/`delay-N`. The only escape is `-(--token)` naming a
variable defined in `tokens.css`. Class lists are plain strings or template literals: no `clsx`,
no `tailwind-merge`, no component takes a `className`. Pressed controls use
`duration-(--dur-press)` and hover states `duration-(--dur-hover)`, both with `ease-(--ease-out)`
(FR-015) (research R-005, R-013). Where Screens v2
and Design System v2 differ, Screens v2 wins.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the new build-time dependency and the vendored fonts.

- [x] T001 Add `tailwindcss` 4.3.3 and `@tailwindcss/vite` 4.3.3 as exact-pinned devDependencies in `apps/web/package.json` and run `pnpm install` to update `pnpm-lock.yaml` (research R-013). No runtime dependency is added
- [x] T002 Register the `tailwindcss()` plugin from `@tailwindcss/vite` in `apps/web/vite.config.ts`, next to the existing React plugin
- [x] T003 [P] Vendor the upstream Geist and Geist Mono **variable** `woff2` files and their `OFL.txt` (vercel/geist, SIL OFL 1.1) into `apps/web/src/app/fonts/` (research R-006). No npm package

**Checkpoint**: `pnpm install` and `pnpm --filter web build` pass with the plugin registered.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: apply the frozen contract and ship all three read-only API additions end to end
(so every later phase is web-only), plus the token system, fonts, base CSS, `check:tokens`,
shared dates and the grouped sidebar shell.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Contract (Principle IV, research R-003)

- [x] T004 Merge every fragment of `specs/002-ui-redesign/contracts/openapi-delta.yaml`, unedited, into the canonical `specs/001-personal-finance-manager/contracts/openapi.yaml` at the positions its description names: `QueryParam` appended after `ToParam` in `paths./transactions.get.parameters`; `/accounts/balance-history` inserted before `/accounts/{id}`; `/ai/status` appended after `/reports/similar/narrative`; `components.parameters.QueryParam`; `AccountBalanceSeries` and `BalanceHistoryResponse` after `BalanceResponse`; `AiStatusResponse` after `NarrativeResponse`. Set `info.version` to `1.1.0`. Then run `pnpm contract:generate` to regenerate `packages/contract/src/types.ts` (never edited by hand)

### API: transaction search `q` (FR-016, research R-001)

- [x] T005 [P] Create `apps/api/src/common/escape-like/escape-like.ts` exporting `escapeLike(value: string): string`, which escapes `\`, `%` and `_` so each matches itself in an `ILIKE` pattern, with `escape-like.spec.ts` covering each character, a mix of them and plain text unchanged
- [x] T006 Add `q` to `apps/api/src/modules/accounts/dtos/transaction-list-query.dto.ts`: optional, trimmed, "1–60 characters after trimming, otherwise `VALIDATION_FAILED`" (contract `QueryParam`). Thread it unchanged through `apps/api/src/modules/accounts/services/transactions.service.ts` → `LedgerService.list` (`ListTransactionsInput` in `apps/api/src/modules/ledger/services/ledger.service.ts`) → `TransactionFilters` in `apps/api/src/modules/ledger/repositories/transactions.repository.ts`, where `whereFor` adds `description` `contains` `escapeLike(q)` with `mode: 'insensitive'`, combined with the other filters by AND. Order (`date desc, id desc`), pagination and the `deletedAt` filter stay as they are. Without `q` the query is unchanged (FR-020). Extend `transactions.service.spec.ts` for the pass-through (depends on T005)
- [x] T007 Extend `apps/api/test/transactions.e2e-spec.ts` with `q` cases: case-insensitive substring match, `%`/`_`/`\` matched literally, soft-deleted rows excluded, newest first, `limit` respected with `total` counting every match, combined with `accountId` by AND, blank and 61-character `q` rejected with `VALIDATION_FAILED`, and every response checked by ajv against the 1.1.0 yaml (depends on T006)

### API: daily balance series (FR-006, FR-007, SC-005, research R-002)

- [x] T008 [P] Create pure `apps/api/src/modules/ledger/domain/balance-series.ts` exporting `balanceSeries(entries: DatedAmount[], from: string, to: string): bigint[]`: length `to − from + 1`, starts from `balanceAt(entries, from)`, then adds each later day's entries in `bigint`. Write `balance-series.spec.ts` first or alongside: `series[i] === balanceAt(entries, from + i)` for every `i`, a range before the first entry (all `0n`), a range with no entries (flat line), backdated entries, `from = to` (length 1), and a range crossing a month and a year end
- [x] T009 Add two public methods to `apps/api/src/modules/ledger/services/ledger.service.ts`: `balanceSeries(accountId, from, to)`, which reuses `EntriesRepository.listForAccount` (the read `balanceAsOf` uses) and the pure `balanceSeries`, and `earliestEntryDate(accountIds: bigint[]): Promise<string | null>`. Extend `ledger.service.spec.ts` for both, including `earliestEntryDate([])` and accounts with no entries returning `null` (depends on T008)
- [x] T010 [P] Create `apps/api/src/modules/accounts/dtos/balance-history-query.dto.ts`: `BalanceHistoryQueryDto` extends the existing `IncludeArchivedQueryDto` of `account-request.dto.ts` (same `@ToBoolean()` parsing as `listAccounts`), with optional `from` and `to` as `@IsDateOnly()`. Input-only rules, each throwing the existing `ValidationFailedError` from the DTO as `transaction-request.dto.ts` does: `to` not after today in `APP_TIMEZONE`, `from ≤ to`, span "must not exceed 10 years". With `balance-history-query.dto.spec.ts` covering `to` after today, `from` after `to`, a span of exactly 10 years accepted and one day more rejected, and `includeArchived` parsed as on `listAccounts`
- [x] T011 [P] Create `apps/api/src/modules/accounts/dtos/balance-history-response.dto.ts` with a static `from()` mapping the service result to `BalanceHistoryResponse` (`from`, `to`, `total: Money[]`, `accounts: { accountId, archived, balances: Money[] }[]`), every `bigint` as a cent string, with `balance-history-response.dto.spec.ts` asserting strings, never JSON numbers, including negatives and `"0"`
- [x] T012 Add `balanceHistory({ from?, to?, includeArchived })` to `apps/api/src/modules/accounts/services/accounts.service.ts`: picks accounts in `listAccounts` order (active, plus archived when `includeArchived`); `to` defaults to today in `APP_TIMEZONE`; when `from` is absent calls `LedgerService.earliestEntryDate` with the **active** accounts only, clamps it to 10 years before `to`, and uses `to` when they have no entries; calls `LedgerService.balanceSeries` per account; `total[i]` is the element-wise `bigint` sum over **non-archived** accounts only. Defaults and the clamp never fail. Extend `accounts.service.spec.ts` with a stubbed `LedgerService`: archived series excluded from `total`, element-wise sum, no active accounts gives zeros, default `from` taken from active accounts only (toggle never changes the range), clamp at 10 years (depends on T009)
- [x] T013 Add `GET /accounts/balance-history` (`getBalanceHistory`) to `apps/api/src/modules/accounts/controllers/accounts.controller.ts`, declared **before** every `:id` route, taking `BalanceHistoryQueryDto` and returning `BalanceHistoryResponseDto.from(...)` (depends on T010, T011, T012)
- [x] T014 Create `apps/api/test/balance-history.e2e-spec.ts`: active-only `total` with archived accounts present, `includeArchived=true` adds archived series and leaves `total` unchanged, last `total` element equals `listAccounts.totalBalance` when `to` is today, each series value equals `GET /accounts/{id}/balance?asOf=` on sampled days, defaults of `to` and `from`, `to` after today / `from` after `to` / span over 10 years rejected with `VALIDATION_FAILED`, responses checked by ajv against the 1.1.0 yaml (depends on T013)

### API: AI availability (FR-020 as amended, research R-004)

- [x] T015 [P] Add `isConfigured(): boolean` to `apps/api/src/modules/ai/services/ai.service.ts`, true when `LLM_API_KEY` is non-empty (the same check `similarNarrative` makes, which now calls it), never calling the provider. Extend `ai.service.spec.ts` for set, empty and absent. No new environment variable
- [x] T016 Create `apps/api/src/modules/ai/dtos/ai-status-response.dto.ts` (`{ configured: boolean }`) and add the `GET /ai/status` handler (`getAiStatus`) to `apps/api/src/modules/ai/controllers/ai.controller.ts` (depends on T015)
- [x] T017 Extend `apps/api/test/ai-narrative.e2e-spec.ts` with `GET /ai/status` for the key set and empty, asserting the provider stub receives no call and the response passes ajv against the 1.1.0 yaml (depends on T016)
- [x] T018 Run `pnpm contract:check`, `pnpm test`, `pnpm test:e2e` and `pnpm ledger:check`: zero route drift against the 1.1.0 yaml and every feature 001 test unchanged and green (quickstart scenarios 1–2) (depends on T007, T014, T017)
- [x] T019 [P] Add `getBalanceHistory` for the 1Y range (`from` = today − 364) and for "All" (no `from`) to the endpoint list of `scripts/perf-measure.mjs`, each with a 2 000 ms p95 budget (SC-006)

### Web: tokens, fonts, base CSS (FR-001, FR-002, FR-003, FR-015, research R-005, R-006, R-013)

- [x] T020 Rewrite `design/tokens.css` from Screens v2 as a Tailwind `@theme static` block that starts with `--*: initial`: colours `--color-{accent, accent-hover, accent-soft, ink-*, sand-*, text-1…3, negative, warning, transfer, cat-1…7}` with accent `#1a7a53` and readable secondary text `#5b6472`; `#8a93a1` and `#1f8a5e` only as `--color-decor-*`; radii `--radius-{xs…2xl, pill}` (5 to 28 px plus pill); shadows `--shadow-{card, popover, tooltip, toast, overlay, accent}`; `--ease-out: cubic-bezier(.2,.8,.2,1)`; fonts `--font-ui: 'Geist', system-ui, sans-serif` and `--font-mono: 'Geist Mono', ui-monospace, monospace`; numeric scales `--text-{10…64}` and `--spacing-{2…56}` named by pixel value, with no `--spacing` multiplier. Add a plain `:root` block with `--dur-press 100ms`, `--dur-hover 150ms`, `--dur-dialog 200ms`, `--dur-enter 320ms`, `--stagger 40ms`, `--dur-morph 400ms`, `--dur-count 700ms`, `--dur-flash 2400ms`, `--dur-undo 5000ms`. In the same change, repoint every feature 001 variable name used in `apps/web/src/app/app.css` to its new token, so no alias layer is left behind
- [x] T021 Restructure `apps/web/src/app/app.css` to start with `@import "tailwindcss";` then `@import "../../../../design/tokens.css";`, followed by `@font-face` for both vendored fonts (`font-display: swap`), base rules (body on the sand canvas in `--font-ui`, `font-variant-numeric: tabular-nums` for figures, visible focus ring), `@keyframes` for undo progress, row flash and screen entry, and the `prefers-reduced-motion: reduce` override that sets every `--dur-*` except `--dur-undo` and `--dur-flash`, plus `--stagger`, to `0ms`. Make `apps/web/src/app/main.tsx` import only `app.css`. The legacy feature 001 rules stay until US1 removes them (depends on T020)
- [x] T022 Run `pnpm --filter web build` and `pnpm --filter web typecheck`. This is the Tailwind fallback trigger (research R-013): if the build fails under Vite 8 or TS7, stop and report to the user, who decides at this checkpoint whether to fall back to plain CSS on the same tokens (depends on T021)
- [x] T023 Restore `design/design-system.md` (deleted in the working tree; recover the v1 text with `git show HEAD:design/design-system.md`) and rewrite it for v2 (FR-003): keep the rules that still hold (money formatting, the four kind glyphs, custom pickers, error placement, empty states), describe the v2 foundations and components with `design/screens/design-system-v2.html` and `design/screens/screens-v2.html` as the visual reference and the v1 files kept for history, add the kind glyphs ↑ expense, ↓ income, ⇄ transfer, ● opening balance and ▲/▼ for balance changes (FR-004), and list every allowed text-token-on-surface-token pair, marking large-text pairs, in a machine-readable table that `check:tokens` parses (SC-003) (depends on T020)
- [x] T024 Create `apps/web/scripts/check-tokens.mjs` and add `"check:tokens": "node scripts/check-tokens.mjs"` to `apps/web/package.json`. It fails on any `.css` or `.tsx` under `apps/web/src` containing a hex, `rgb(`, `hsl(`, an `ms` literal, a `px` literal other than `0` and `1px`, a Tailwind arbitrary value (a utility containing `-[` or starting with `[`), a `-(--x)` naming a variable not defined in `design/tokens.css`, or a bare numeric `duration-*`/`delay-*`. SVG `viewBox` and coordinates are exempt. It also computes the WCAG contrast of every pair listed in `design/design-system.md` and fails below 4.5:1, or 3:1 for pairs marked large, and fails if a `--color-decor-*` token is paired with text. Export the checks as functions and cover them in `apps/web/scripts/check-tokens.test.mjs`, adding `'scripts/**/*.test.mjs'` to `test.include` in `apps/web/vite.config.ts` so `pnpm test` runs it, with fixtures including an arbitrary value and a bare `duration-150` (both rejected), `1px` accepted, and a failing contrast pair. The legacy `app.css` rules are expected to fail until US1 (T046). Do not add it to CI yet (depends on T020, T023)

### Web: shared helpers and shell (FR-005, research R-011)

- [x] T025 [P] Create `apps/web/src/shared/lib/dates.ts` with `localToday()` (browser date, as in feature 001), `relativeDueLabel(due, today)` giving "Today", "Tomorrow", "In N days", "⚠ Overdue 1 day" or "⚠ Overdue N days", and `upcomingGroup(due, today)` returning `'overdue-and-2-weeks'` for overdue items and days 0–14 (even across a month end), `'later-this-month'` for the rest of the current month, and `'later-months'` for everything later (FR-011), with `dates.test.ts` covering days 0, 1, 14 and 15, a 14-day window crossing a month end (second group empty), singular/plural and year end. Replace the duplicated `localToday` in `SimilarPage.tsx`, `AccountDetailPage.tsx`, `AccountForm.tsx`, `UpcomingPage.tsx`, `ScheduledItemForm.tsx`, `ConfirmItemForm.tsx`, `ProjectionPage.tsx` and `TransactionForm.tsx` with the shared import
- [x] T026 [P] Create `apps/web/src/app/Sidebar/Sidebar.tsx` with `Sidebar.test.tsx`: the ink sidebar with brand, a Search field (inert until US5), and `NavLink`s grouped as Money (Accounts, Transactions), Reports (Monthly expenses, Similar transactions), Planning (Upcoming, Projection, Projects) and Setup (Categories), with the active state (ink highlight with a green left bar), the hover state, and the current date and currency in the footer (FR-005). The test asserts group labels, order and `aria-current` on the active route
- [x] T027 Move `Shell` out of `apps/web/src/app/main.tsx` into `apps/web/src/app/Shell/Shell.tsx`, rendering `Sidebar` beside `<main><Outlet /></main>`. `main.tsx` keeps the router, the query client and the providers (depends on T026)

**Checkpoint**: API complete for the whole feature and CI green (T018). Web builds with Tailwind
(T022). `check:tokens` runs locally and reports only the legacy `app.css` rules. The user
decides on the Tailwind fallback here if T022 failed.

---

## Phase 3: User Story 1 - New visual foundation across the app (Priority: P1) 🎯 MVP

**Goal**: every existing route and shared component on the v2 tokens, Geist, the grouped ink
sidebar, kind glyphs, ▲/▼, faint cents and reduced motion. Layouts stay feature 001's where US3
redesigns them.

**Independent Test**: open each of the 10 routes. Each uses the new tokens and fonts, the sidebar
marks the active route, and `pnpm --filter web run check:tokens` passes with no legacy rule left.

- [x] T028 [P] [US1] Create `apps/web/src/shared/ui/Amount/Amount.tsx` with `Amount.test.tsx`: renders a `Cents` string through `money.ts` with an explicit sign, tabular figures in `--font-mono`, the negative colour and a minus sign for negatives (still negative in greyscale), and a `size="large"` variant whose cents render in the faint grey. The test asserts the rendered text equals the `money.ts` formatting for positive, negative, zero and large values
- [x] T029 [P] [US1] Create `apps/web/src/shared/ui/KindGlyph/KindGlyph.tsx` and `apps/web/src/shared/ui/Delta/Delta.tsx`, with colocated tests: `KindGlyph` always renders glyph and colour together (↑ expense, ↓ income, ⇄ transfer, ● opening balance) with an accessible label; `Delta` renders ▲/▼ plus the signed amount for balance changes (FR-004)
- [x] T030 [P] [US1] Reskin `apps/web/src/shared/ui/Modal/Modal.tsx` (overlay shadow, 200 ms `--dur-dialog` entry, radii) and `apps/web/src/shared/ui/Table/Table.tsx` (row hairlines, header eyebrows in `--font-mono`, truncation with ellipsis and the full text kept for assistive technology) onto tokens; keep their tests green
- [x] T031 [P] [US1] Reskin `apps/web/src/shared/ui/Picker/Picker.tsx`, `AccountPicker/AccountPicker.tsx`, `CategoryPicker/CategoryPicker.tsx`, `ProjectPicker/ProjectPicker.tsx` and `MoneyInput/MoneyInput.tsx` onto tokens (control heights from `--spacing-*`, focus ring, error border in the negative colour); keep their tests green
- [x] T032 [P] [US1] Reskin `apps/web/src/shared/ui/EmptyState/EmptyState.tsx` and `apps/web/src/shared/ui/TransactionForm/TransactionForm.tsx` onto tokens, using `KindGlyph` and `Amount`; keep behaviour and tests unchanged
- [x] T033 [US1] Style `apps/web/src/app/Shell/Shell.tsx` and `Sidebar/Sidebar.tsx` fully on tokens and add the screen-entry animation (`--dur-enter` with `--stagger` between sections, `--ease-out`, no bounce) to the routed content, disabled under reduced motion by the T021 override (depends on T027)
- [x] T034 [P] [US1] Reskin `apps/web/src/features/accounts/components/AccountsPage/AccountsPage.tsx`, `AccountDetailPage/AccountDetailPage.tsx` and `AccountForm/AccountForm.tsx` onto token utilities with `Amount`, `KindGlyph` and `Delta`; update their tests where markup changed
- [x] T035 [P] [US1] Reskin `apps/web/src/features/transactions/components/TransactionsPage/TransactionsPage.tsx` onto token utilities with `Amount` and `KindGlyph`; update its test
- [x] T036 [P] [US1] Reskin `apps/web/src/features/categories/components/CategoriesPage/CategoriesPage.tsx` and `CategoryForm/CategoryForm.tsx` onto token utilities (category colours from `--color-cat-1…7`); update the test
- [x] T037 [P] [US1] Reskin `apps/web/src/features/report/components/ReportPage/ReportPage.tsx` onto token utilities with `Amount`; update its test
- [x] T038 [P] [US1] Reskin `apps/web/src/features/similar/components/SimilarPage/SimilarPage.tsx` onto token utilities with `Amount`; update its test
- [x] T039 [P] [US1] Reskin `apps/web/src/features/upcoming/components/UpcomingPage/UpcomingPage.tsx`, `ScheduledItemForm/ScheduledItemForm.tsx` and `ConfirmItemForm/ConfirmItemForm.tsx` onto token utilities; update the test
- [x] T040 [P] [US1] Reskin `apps/web/src/features/projection/components/ProjectionPage/ProjectionPage.tsx` onto token utilities with `Amount`; update its test
- [x] T041 [P] [US1] Reskin `apps/web/src/features/projects/components/ProjectsPage/ProjectsPage.tsx`, `ProjectDetailPage/ProjectDetailPage.tsx`, `ProjectFigures/ProjectFigures.tsx` and `ProjectForm/ProjectForm.tsx` onto token utilities with `Amount`; update the tests
- [x] T042 [US1] Delete every feature 001 rule from `apps/web/src/app/app.css`, leaving only the imports, `@font-face`, base rules, `@keyframes` and the reduced-motion override listed in T021 (depends on T028–T041)
- [x] T043 [US1] Update `e2e/specs/smoke.spec.ts` and `e2e/specs/story-1-accounts.spec.ts` … `story-6-similar.spec.ts` to the new markup and the grouped sidebar labels, keeping them keyboard-only where they were, with every asserted figure unchanged (SC-002) (depends on T042)
- [x] T044 [US1] Add a Playwright spec `e2e/specs/redesign-foundation.spec.ts`: visits each of the 10 routes, asserts the active sidebar item has `aria-current="page"`, the body's computed `font-family` starts with Geist, and with `reducedMotion: 'reduce'` routed content has no running animation (US1 scenarios 2 and 4) (depends on T042)
- [x] T045 [US1] Run `pnpm --filter web test`, `pnpm test:ui`, `pnpm format:check` and `pnpm lint`; all green (depends on T043, T044)
- [x] T046 [US1] Run `pnpm --filter web run check:tokens` until it passes, then add a "Tokens and contrast" step running it to `.github/workflows/ci.yml`, directly after "Format check (prettier)" (quickstart scenario 4) (depends on T042)

**Checkpoint**: the whole app on the v2 foundation. The user runs the SC-001 side-by-side review
for the sidebar and foundations before approving US2.

---

## Phase 4: User Story 2 - Accounts dashboard with balance history (Priority: P2)

**Goal**: screen 01: headline total, balance-over-time chart with ranges, "Balance as of",
account cards with sparklines, archived toggle and dashed note.

**Independent Test**: on the demo seed, for each range the chart's last value equals the feature
001 total, and any hovered day equals the balance as of that day (quickstart scenario 3).

- [x] T047 [P] [US2] Add to `apps/web/src/shared/lib/money.ts`: `toPlotNumber(cents, min, max, height)`, the only cents → `number` conversion, mapping `min` to 0 and `max` to `height` (the middle for a flat series), used for chart geometry only; `countUpFrames(start, end)` returning 61 `Cents` values `start + (end − start) × k / 60n` for k = 0…60 in `BigInt`; and `change(a, b)` in `BigInt`. Extend `money.test.ts`: count-up endpoints exact, every frame an integer string, negative and zero ranges, `toPlotNumber` monotonic
- [x] T048 [P] [US2] Add `balanceHistory: (from: string | undefined, to: string | undefined) => ['accounts', 'history', from, to]` (always requested with `includeArchived=true`, research R-002) to `apps/web/src/shared/lib/query-keys.ts`, so the existing `queryKeys.accounts` invalidation in `invalidateEntryDerived` refetches it
- [x] T049 [US2] Add `recharts` 3.10.1 as an exact-pinned dependency of `apps/web` (research R-007, user decision 2026-09-24) and create `apps/web/src/shared/ui/LineChart/LineChart.tsx` with `LineChart.test.tsx`: a Recharts area chart (`responsive`) of the whole series mapped through `toPlotNumber`, colours and stroke width as `var(--token)`, a dashed crosshair and a dot on the selected day; the wrapper is a `role="slider"` with `aria-valuemin` 0, `aria-valuemax` the last index and `aria-valuetext` such as "22 Sep 2026, $4,457.50, ▲ $120.00"; ←/→ one day, Home/End the ends, PageUp/PageDown 7 days; pointer hover and drag select the exact day and show a tooltip naming it; `onSelect(index)` for the headline; Recharts' animation morphs between series over `--dur-morph` with the `--ease-out` curve and is off when `matchMedia('(prefers-reduced-motion: reduce)')` matches. Tests assert every rendered figure equals the source string, the key behaviour, the ARIA values and the pointer selection (depends on T047)
- [x] T050 [P] [US2] Create `apps/web/src/shared/ui/Sparkline/Sparkline.tsx` with `Sparkline.test.tsx`: a decorative (`aria-hidden`) Recharts line of one account's series over the range, through the same `toPlotNumber`, with no animation (depends on T047, T049)
- [x] T051 [US2] Rebuild `apps/web/src/features/accounts/components/AccountsPage/AccountsPage.tsx` as screen 01: range chips 7D/30D/90D/1Y/All, where a range of N days is `from = asOf − (N − 1)` through `to = asOf` (1Y = 365 days) and All omits `from`; a "Balance as of" date whose max is the server's `to` from the first `getBalanceHistory` response (never after today); headline `total[i]` with the change `total[i] − total[0]` shown with `Delta`, count-up over `--dur-count` via `countUpFrames`; `LineChart` bound to `total`; one card per account (name, kind, balance as of `to`, `Sparkline`) from `getBalanceHistory.accounts[]` joined with `listAccounts` by `accountId`, both always requested with `includeArchived=true` (research R-002); the archived toggle is client-side only and never refetches: off, archived cards are hidden and a dashed note names how many archived accounts there are and the sum of their series at `to` (in `BigInt`); on, they show as cards marked archived. The headline and chart read `total`, which is active-only either way. Update `AccountsPage.test.tsx` for the range mapping, the as-of bound, the join, the note's count and balance, the toggle not refetching, and the headline change (depends on T048, T049, T050)
- [x] T052 [US2] Create `e2e/specs/redesign-dashboard.spec.ts`: for every range, sampled chart days (first, middle, last, via the slider's `aria-valuetext`) equal `GET /accounts/{id}/balance?asOf=` summed over active accounts; the last value equals the feature 001 total; arrow keys move the selection; a past "Balance as of" moves the headline and every card; the archived toggle leaves the headline unchanged (SC-005, US2 scenarios 1–5) (depends on T051)
- [x] T053 [US2] Create `e2e/perf/dashboard.perf.spec.ts` and `e2e/perf/playwright.perf.config.ts`, and add `"test:perf": "playwright test --config perf/playwright.perf.config.ts"` to `e2e/package.json` and `"test:perf": "pnpm --filter e2e run test:perf"` to the root `package.json`. The test loads the dashboard on the 5 000-transaction perf seed, selects 1Y, and fails unless the headline and the 1Y chart are drawn and the chart accepts an ArrowLeft within 2 s (SC-006). Not added to CI (depends on T051)

**Checkpoint**: dashboard complete; quickstart scenarios 3 and 10 pass. User's SC-001 review of
screen 01.

---

## Phase 5: User Story 3 - Reskinned forms and lists for every existing flow (Priority: P3)

**Goal**: screens 02, 03, 04, 05, 06, 12–19 in their v2 layouts, with feature 001 behaviour
unchanged.

**Independent Test**: run the feature 001 walkthrough on the new screens; every figure matches
(quickstart scenario 5).

- [ ] T054 [P] [US3] Rebuild `apps/web/src/shared/ui/TransactionForm/TransactionForm.tsx` as screens 06/14: a type switch Expense / Income / Transfer that shows the fields each kind requires and carries amount, date and description over; each validation error under its field with the border in the negative colour and a message naming the fix ("Use at most 2 decimal places, like 250.50."); From = To on a transfer rejected under To; a future date rejected under Date with a message suggesting scheduling instead; amount input accepts `1234.5`, `1,234.50`, `$1,234.50` and `-350` only where a sign is allowed. Add `TransactionForm.test.tsx` covering the type switch carry-over and each message
- [ ] T055 [P] [US3] Rebuild `apps/web/src/features/accounts/components/AccountForm/AccountForm.tsx` as screen 12: for an archived account it offers Unarchive in place of Archive and notes that its scheduled payments cannot be marked paid. Add `AccountForm.test.tsx`
- [ ] T056 [P] [US3] Rebuild `apps/web/src/features/accounts/components/AccountDetailPage/AccountDetailPage.tsx` as screen 02: rows grouped by day, each day with its net amount derived from `kind` and the account's role as feature 001 already does (no entries in the UI). Extend `AccountDetailPage.test.tsx` for the grouping and day nets
- [ ] T057 [P] [US3] Rebuild `apps/web/src/features/transactions/components/TransactionsPage/TransactionsPage.tsx` as screen 13: date, type, category and project filters, a "Clear filters" action, and page-numbered pagination on the existing `limit`/`offset` (FR-008). Extend `TransactionsPage.test.tsx` for clearing and page navigation
- [ ] T058 [P] [US3] Rebuild `apps/web/src/features/categories/components/CategoriesPage/CategoriesPage.tsx` as screen 15 with inline rename: Enter saves, Esc cancels, keyboard operable with a visible focus ring; renaming to an existing name shows the duplicate-name error inline and does not save. Extend `CategoriesPage.test.tsx`
- [ ] T059 [P] [US3] Add `share(totals: Cents[]): string[]` to `apps/web/src/shared/lib/money.ts`: tenths of a percent, each `total × 1000n / grandTotal` rounded down, the remaining tenths given one each to the largest remainders (ties by input order), so they add up to exactly 1000, formatted with one decimal place. Extend `money.test.ts` with sums of exactly 100.0% on awkward splits (for example three equal totals) and the tie rule
- [ ] T060 [US3] Create `apps/web/src/shared/ui/Donut/Donut.tsx` with `Donut.test.tsx`: `stroke-dasharray` arcs in `--color-cat-*`; hovering or focusing a category enlarges its segment, fades the others and shows its name, amount and share in the centre; keyboard focus moves through segments; not drawn when the grand total is zero. Tests assert shares from `share()` and that every figure equals the source string (depends on T059)
- [ ] T061 [US3] Rebuild `apps/web/src/features/report/components/ReportPage/ReportPage.tsx` as screen 03 with `Donut` and category rows that expand to the transactions behind them (FR-009). Extend `ReportPage.test.tsx` (depends on T060)
- [ ] T062 [P] [US3] Rebuild `apps/web/src/features/upcoming/components/UpcomingPage/UpcomingPage.tsx` as screen 04: groups from `upcomingGroup` (overdue and the next 2 weeks, later this month, later months), each item with `relativeDueLabel`; Mark paid disabled with its reason written next to it for an item on an archived account (FR-014). Extend `UpcomingPage.test.tsx`
- [ ] T063 [P] [US3] Rebuild `apps/web/src/features/upcoming/components/ScheduledItemForm/ScheduledItemForm.tsx` and `ConfirmItemForm/ConfirmItemForm.tsx` as screen 16: Mark paid opens pre-filled and shows the scheduled amount next to any edited amount. Add `ConfirmItemForm.test.tsx`
- [ ] T064 [US3] Rebuild `apps/web/src/features/projection/components/ProjectionPage/ProjectionPage.tsx` as screens 05 and 17: any end date up to 24 months ahead with 3M/6M/12M/24M shortcuts; the chart via `LineChart`; a payment-by-payment ledger with the balance after each payment; the first row where the running total drops below $0.00 marked "Below $0.00" (comparison in `BigInt`); a summary naming that date, the lowest point and every later period below zero (FR-010). Extend `ProjectionPage.test.tsx` (depends on T049)
- [ ] T065 [P] [US3] Rebuild `apps/web/src/features/projects/components/ProjectsPage/ProjectsPage.tsx`, `ProjectDetailPage/ProjectDetailPage.tsx`, `ProjectFigures/ProjectFigures.tsx` and `ProjectForm/ProjectForm.tsx` as screen 18: cards, "Over budget by $X" on an over-budget project, and for a project with expenses the reason it cannot be deleted in place of Delete. Extend the tests
- [ ] T066 [P] [US3] Rebuild `apps/web/src/features/similar/components/SimilarPage/SimilarPage.tsx` as screen 19; extend `SimilarPage.test.tsx`
- [ ] T067 [US3] Update `e2e/specs/story-1-accounts.spec.ts` … `story-6-similar.spec.ts` to the v2 layouts, keyboard-only where they were, every figure unchanged (SC-002), and add assertions for US3 scenarios 3, 4, 5, 6 and 7 (depends on T054–T066)

**Checkpoint**: every feature 001 flow on its v2 screen. User's SC-001 review of screens 02–06
and 12–19.

---

## Phase 6: User Story 4 - States: empty, loading, errors and feedback (Priority: P4)

**Goal**: screen 08 skeletons and every screen 20 state: 8 empties, errors with correlation id,
saved and refresh-failed toasts, AI notices, disabled reasons.

**Independent Test**: empty the database, then trigger API down, AI failing and AI not configured.
Each shows its screen 20 state with the correct text and correlation id (quickstart scenario 6).

- [ ] T068 [P] [US4] Create `apps/web/src/shared/ui/Toast/Toast.tsx` with `Toast.test.tsx`: a `ToastProvider` (React context) with an `aria-live="polite"` region and a `useToast()` hook, supporting kinds `'saved' | 'error' | 'refresh-failed'` (data-model Toast: `{ id, kind, message, correlationId? }`); `saved` closes itself, `error` shows the correlation id with Copy ID (`navigator.clipboard.writeText`), `refresh-failed` stays until its Retry resolves; shadow `--shadow-toast`
- [ ] T069 [P] [US4] Create `apps/web/src/shared/ui/ErrorNotice/ErrorNotice.tsx` with `ErrorNotice.test.tsx`: the message, the `correlationId` from `ErrorResponse`, "Copy ID" and "Try again" (FR-013)
- [ ] T070 [P] [US4] Create `apps/web/src/shared/ui/Skeleton/Skeleton.tsx` with `Skeleton.test.tsx`: block, line and row shapes sized from tokens, `aria-busy` on the container, no shimmer under reduced motion
- [ ] T071 [P] [US4] Rewrite `apps/web/src/shared/ui/EmptyState/EmptyState.tsx` to the screen 20 layout (what is missing, what would fill it, at most one action) and extend `EmptyState.test.tsx` for the single-action rule
- [ ] T072 [P] [US4] Add `refetchEntryDerived(queryClient)` to `apps/web/src/shared/lib/query-keys.ts`, calling `queryClient.refetchQueries({ queryKey }, { throwOnError: true })` for each entry-derived key and rejecting if any refetch fails; add `query-keys.test.ts`
- [ ] T073 [US4] Mount `ToastProvider` in `apps/web/src/app/Shell/Shell.tsx`, and make every mutation (in `TransactionForm`, `AccountForm`, `CategoriesPage`/`CategoryForm`, `ScheduledItemForm`, `ConfirmItemForm`, `ProjectForm` and the delete actions) show a `saved` toast on success, then call `refetchEntryDerived`; on its rejection show the persistent "Balances couldn't update" `refresh-failed` toast whose Retry repeats the call until it resolves, never rolling the change back; show a failed mutation's error with its correlation id (depends on T068, T072)
- [ ] T074 [US4] Wire the screen 20 empty state copy, `Skeleton` loading matching the final layout, and `ErrorNotice` for failed queries into every list and report: dashboard (`AccountsPage`), monthly report (`ReportPage`), transactions (`TransactionsPage`, `AccountDetailPage`), upcoming (`UpcomingPage`), projects (`ProjectsPage`), archived categories (`CategoriesPage`), similar transactions (`SimilarPage`) and projection (`ProjectionPage`), extending each page's test with its empty, loading and error render (depends on T069, T070, T071)
- [ ] T075 [US4] In `apps/web/src/features/similar/components/SimilarPage/SimilarPage.tsx`, read `getAiStatus` on load: with `configured: false` "Summarize with AI" renders disabled from the first render with its reason written next to it; keep the feature 001 fallback (a `422 AI_NOT_CONFIGURED` still disables it); a failed AI summary shows a dismissible notice and leaves the report on screen. Extend `SimilarPage.test.tsx` for all three (depends on T074)
- [ ] T076 [US4] Audit every disabled control under `apps/web/src` and make each state its reason in visible text next to it, not only in a tooltip (FR-014)
- [ ] T077 [US4] Create `e2e/specs/redesign-states.spec.ts`: the 8 empty states with their screen 20 copy on an emptied database; API down → error with correlation id and a working Copy ID; AI provider failing → dismissible notice, report stays; AI not configured → button disabled on first render with its reason; balance refetch blocked by route interception → persistent Retry toast, change kept, Retry clears it (SC-007) (depends on T073, T074, T075, T076)

**Checkpoint**: all states and feedback in place. User's SC-001 review of screens 08 and 20.

---

## Phase 7: User Story 5 - Command palette (Priority: P5)

**Goal**: screen 07, ⌘K/Ctrl+K search over transactions, reports and actions.

**Independent Test**: type "uber" on the demo seed: matching transactions show date, account,
category and amount, and Enter opens the selected one in its edit form (quickstart scenario 8).

- [ ] T078 [P] [US5] Add `transactionSearch: (q: string) => ['transactions', 'search', q]` to `apps/web/src/shared/lib/query-keys.ts`, so the existing `queryKeys.transactions` invalidation covers it
- [ ] T079 [US5] Create `apps/web/src/shared/ui/CommandPalette/CommandPalette.tsx` with `CommandPalette.test.tsx`, a modal dialog on the existing `Modal` focus handling: transactions from `GET /transactions?q=…&limit=8` with a 200 ms debounce and the result count from `total`, account and category names joined by id from the cached `listAccounts` and `listCategories`; a static, client-filtered list of Reports (routes) and Actions ("New transaction", "New account", …); results grouped as Transactions, Reports, Actions; ↑/↓ move through the flattened groups, Enter runs the item, Esc closes and returns focus to the opener. The test covers grouping, count, keys and focus return (depends on T078)
- [ ] T080 [US5] In `apps/web/src/app/Shell/Shell.tsx`, open the palette from a global ⌘K/Ctrl+K `keydown` listener and from the Sidebar Search field. Enter on a transaction result closes the palette and opens `TransactionForm` in edit mode in a `Modal` over the current route with no navigation; closing it returns focus to the palette's opener without reopening the palette (FR-016). Extend `Sidebar.test.tsx` for the Search field (depends on T079)
- [ ] T081 [US5] Create `e2e/specs/redesign-palette.spec.ts`: "uber" lists matching transactions newest first with a count; Enter opens the edit form over the current screen; Esc returns focus to the opener; all by keyboard (depends on T080)

**Checkpoint**: palette complete. User's SC-001 review of screen 07.

---

## Phase 8: User Story 6 - Undo after creating a transaction (Priority: P6)

**Goal**: a 5 s Undo on the latest create, through the existing delete path, and the 2.4 s
new-row highlight.

**Independent Test**: create a transaction, press Undo within 5 s: it disappears everywhere,
balances return, and `pnpm ledger:check` passes (quickstart scenarios 2 and 7).

**Depends on**: US4 (`ToastProvider`).

- [ ] T082 [US6] Add the `'undo'` kind to `apps/web/src/shared/ui/Toast/Toast.tsx` (data-model Toast `transactionId`): at most one undo toast, a new one replaces the previous; a progress bar as the undo keyframe over `--dur-undo`, with the JS timer reading the same token via `getComputedStyle`; the first activation removes the toast before the request, so a second press sends no second `DELETE`; `closeUndoFor(id)`; and a `flashId` exposed from the context for `--dur-flash`. Extend `Toast.test.tsx` for replace, once-only, timeout and close-by-id
- [ ] T083 [US6] In `apps/web/src/shared/ui/TransactionForm/TransactionForm.tsx`, push the undo toast holding the new `id` on a successful create; Undo calls the existing `deleteTransaction` path, then the usual invalidation; a failed delete shows the error toast with its correlation id and the transaction stays. A successful update or delete of the held id calls `closeUndoFor`. Edits and deletes show `saved` with no Undo (FR-017). Extend `TransactionForm.test.tsx` (depends on T082)
- [ ] T084 [US6] In `apps/web/src/app/Shell/Shell.tsx`, add one `keydown` listener for ⌘Z/Ctrl+Z that triggers the open Undo only when `document.activeElement` is not an `input`, `textarea`, `select` or `[contenteditable]`; inside a field the browser's text undo runs. Add a test in `apps/web/src/app/Shell/Shell.test.tsx` for inside and outside a field (depends on T082)
- [ ] T085 [US6] Highlight the row whose id equals `flashId` in green for `--dur-flash` in `TransactionsPage.tsx` and `AccountDetailPage.tsx`, fading only when motion is allowed (under reduced motion it shows for the full 2.4 s without fading). Extend both page tests (depends on T082)
- [ ] T086 [US6] Create `e2e/specs/redesign-undo.spec.ts`: Undo within 5 s removes the row everywhere and restores balances; ⌘Z in a text field undoes text only; no Undo after 5 s; edit and delete toasts have no Undo; a second press sends no second `DELETE`; a failed Undo shows the error toast and keeps the row; a second create replaces the first Undo; editing the new row closes its Undo. Then run `pnpm ledger:check` (depends on T083, T084, T085)

**Checkpoint**: Undo complete; global sum zero and reconciliation still pass.

---

## Phase 9: User Story 7 - Phone layout (Priority: P7)

**Goal**: screens 09–11 below 768 px: floating tab bar with More sheet, stacked dashboard,
bottom sheet with numeric keypad, swipe actions with a non-swipe alternative.

**Independent Test**: at 390 px, record an expense through the bottom sheet, then delete it by
swiping (quickstart scenario 9).

- [ ] T087 [P] [US7] Create `apps/web/src/shared/lib/media.ts` exporting `usePhoneLayout()`, backed by `matchMedia('(max-width: 767px)')` with a change listener, and `media.test.ts`
- [ ] T088 [P] [US7] Add a `sheet` variant (bottom-anchored, drag handle, same focus handling) to `apps/web/src/shared/ui/Modal/Modal.tsx`; extend `Modal.test.tsx`
- [ ] T089 [P] [US7] Create `apps/web/src/shared/ui/Keypad/Keypad.tsx` with `Keypad.test.tsx`: digits, decimal point and backspace writing into the same string `MoneyInput` parses with `money.ts`, so the money rules are unchanged; a third decimal is refused
- [ ] T090 [P] [US7] Create `apps/web/src/shared/ui/SwipeRow/SwipeRow.tsx` with `SwipeRow.test.tsx`: Pointer Events with `touch-action: pan-y`, translate while dragging, act past 35% of the row width in either direction (left → `onDelete`, right → `onEdit`), otherwise snap back with no action
- [ ] T091 [P] [US7] Create `apps/web/src/shared/ui/RowActions/RowActions.tsx` with `RowActions.test.tsx`: a "⋯" menu button (APG menu button pattern) offering Edit and Delete, operable by keyboard and screen reader
- [ ] T092 [US7] Create `apps/web/src/app/TabBar/TabBar.tsx` with `TabBar.test.tsx`: shown below 768 px in place of the sidebar (hidden with a `max-width: 767px` variant), with Accounts, Report, a central Add button opening the new-transaction sheet, Upcoming and More; More opens a `Modal` sheet listing Transactions, Similar transactions, Projection, Projects and Categories, grouped as in the sidebar. Mount it in `Shell.tsx` (depends on T087, T088)
- [ ] T093 [US7] Below 768 px, open `TransactionForm` in the `sheet` variant with `Keypad` driving its amount (screen 11), from the tab bar's Add and every "New transaction" action (depends on T088, T089, T092)
- [ ] T094 [US7] Wrap transaction rows in `TransactionsPage.tsx` and `AccountDetailPage.tsx` in `SwipeRow` below 768 px and give every row a `RowActions` button at every width; left swipe and "⋯ → Delete" open `TransactionForm` in edit mode with its delete confirmation already showing (a new `confirmDelete` prop on `apps/web/src/shared/ui/TransactionForm/TransactionForm.tsx`; confirming uses the form's existing delete mutation, which already closes a matching Undo from T083; the form's own Delete button keeps its feature 001 behaviour); right swipe and "⋯ → Edit" open it in edit mode (FR-018, research R-010). Extend both page tests and `TransactionForm.test.tsx` for the `confirmDelete` prop (depends on T090, T091)
- [ ] T095 [US7] Stack the dashboard hero and account list below 768 px in `AccountsPage.tsx` (screen 09), and make every route free of horizontal scroll at 390 px (depends on T092)
- [ ] T096 [US7] Create `e2e/specs/redesign-phone.spec.ts` at 390×844: no horizontal scroll on any route; the tab bar and More reach every primary route; an expense recorded through the keypad sheet; a short swipe snaps back; a long left swipe asks for confirmation, then deletes; "⋯" offers the same actions by keyboard (depends on T093, T094, T095)

**Checkpoint**: phone layout complete. User's SC-001 review of screens 09–11.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: documentation, retired notes and the full validation run.

- [ ] T097 [P] Update `README.md`: Tailwind v4 styling from `design/tokens.css`, the `check:tokens` and `test:perf` scripts, the three new read-only endpoints, and the design references in `design/screens/`
- [ ] T098 [P] Mark the feature 001 Complexity Tracking entry "Narrative button learns 'not configured' from the first answer" in `specs/001-personal-finance-manager/plan.md` as retired by feature 002 (`GET /ai/status`, research R-004)
- [ ] T099 Run every quickstart scenario in `specs/002-ui-redesign/quickstart.md` (1–13), including `pnpm db:generate-perf && pnpm perf:measure && pnpm test:perf`, reduced-motion emulation and the blocked-font check; record any failure and fix it before handing over
- [ ] T100 Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm ledger:check`, `pnpm --filter web run check:tokens` and `pnpm test:ui`; all green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story. Ends with the Tailwind
  fallback decision (T022) if the build failed.
- **US1 (Phase 3)**: depends on Foundational. It removes the legacy CSS, so every later phase
  works on the v2 foundation and `check:tokens` gates CI from T046 on.
- **US2–US7**: depend on Foundational and US1. Delivered one phase at a time, in priority order,
  each after the user's approval (CLAUDE.md).
- **Polish (Phase 10)**: depends on every story that ships.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P2)**: US1. Provides `LineChart`, which US3's projection chart reuses.
- **US3 (P3)**: US1; T064 needs US2's `LineChart` (T049).
- **US4 (P4)**: US1; wires its states into the US3 screens, so it follows US3.
- **US5 (P5)**: US1; independent of US2–US4.
- **US6 (P6)**: US4 (`ToastProvider`, T068).
- **US7 (P7)**: US1; independent of US4–US6 except that the swipe delete reuses the delete
  confirmation.

### Within Each Phase

- Domain function and its spec before the service that calls it (T008 → T009 → T012).
- DTOs and service before the controller (T010, T011, T012 → T013), controller before its e2e.
- Shared lib and shared component before the page that uses them.
- Tests are in the same task as the code they cover. e2e and Playwright tasks come last.

### Parallel Opportunities

- Setup: T003 alongside T001/T002.
- Foundational: T005, T008, T010, T011, T015, T019, T025, T026 in parallel. The q, series and AI
  tracks are independent until T018.
- US1: T028–T032 in parallel, then T034–T041 in parallel (one feature folder each).
- US2: T047, T048 in parallel; T050 after T049 adds `recharts`.
- US3: T054–T059 and T062, T063, T065, T066 in parallel.
- US4: T068–T072 in parallel.
- US7: T087–T091 in parallel.

---

## Parallel Example: Foundational API tracks

```bash
Task: "Create escapeLike with its spec in apps/api/src/common/escape-like/escape-like.ts"
Task: "Create pure balanceSeries with its spec in apps/api/src/modules/ledger/domain/balance-series.ts"
Task: "Create BalanceHistoryQueryDto with its spec in apps/api/src/modules/accounts/dtos/balance-history-query.dto.ts"
Task: "Create BalanceHistoryResponseDto with its spec in apps/api/src/modules/accounts/dtos/balance-history-response.dto.ts"
Task: "Add AiService.isConfigured with its spec in apps/api/src/modules/ai/services/ai.service.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Create Amount with its test in apps/web/src/shared/ui/Amount/Amount.tsx"
Task: "Create KindGlyph and Delta with their tests in apps/web/src/shared/ui/"
Task: "Reskin the accounts feature in apps/web/src/features/accounts/components/"
Task: "Reskin the report feature in apps/web/src/features/report/components/ReportPage/ReportPage.tsx"
Task: "Reskin the projects feature in apps/web/src/features/projects/components/"
```

## Parallel Example: User Story 7

```bash
Task: "Create usePhoneLayout in apps/web/src/shared/lib/media.ts"
Task: "Add the sheet variant to apps/web/src/shared/ui/Modal/Modal.tsx"
Task: "Create Keypad in apps/web/src/shared/ui/Keypad/Keypad.tsx"
Task: "Create SwipeRow in apps/web/src/shared/ui/SwipeRow/SwipeRow.tsx"
Task: "Create RowActions in apps/web/src/shared/ui/RowActions/RowActions.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup, Phase 2 Foundational (the whole API side of the feature, CI green).
2. Phase 3 US1: the whole app on the v2 foundation, `check:tokens` in CI.
3. **STOP**: the user validates US1 and runs the SC-001 review.

### Incremental Delivery

One phase per `/speckit-implement` run, each followed by the user's approval: US2 dashboard →
US3 screens → US4 states → US5 palette → US6 Undo → US7 phone → Polish. With the 2026-09-25
deadline, US5–US7 are the first to slip. The API for US5 (`q`) is already shipped in
Foundational and stays valid with no web consumer.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- Every money figure the UI shows keeps its feature 001 value (FR-020). All cent arithmetic goes
  through `BigInt` in `money.ts`. `toPlotNumber` is the only cents → `number` conversion.
- No task adds a write path: Undo and swipe delete call the existing `DELETE /transactions/{id}`.
- A contract change during implementation goes back through the plan (Principle IV).
- If an environment variable is needed that is not in `.env.example`, ask first.
- No comments in code or config. Ceilings stay in plan.md Complexity Tracking.
- Commit only when the user asks.
