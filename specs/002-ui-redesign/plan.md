# Implementation Plan: UI redesign — Screens v2 and Design System v2

**Branch**: `002-ui-redesign` | **Date**: 2026-09-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-ui-redesign/spec.md` (clarified 2026-09-23),
constitution v1.1.0, feature 001 plan and frozen contract.

## Summary

Reskin every feature 001 screen to Screens v2 / Design System v2 (tokens, Geist, grouped ink
sidebar), and add a balance-history dashboard, the screen 20 states, a feedback layer (toasts,
Undo of creates, Retry on a failed balance refresh), a ⌘K command palette and a layout for
screens narrower than 768 px. The web app does most of the work. The API gets three read-only
additions and nothing else:

- an optional `q` on `GET /transactions` for the palette (research R-001);
- `GET /accounts/balance-history`, a daily series built from `balanceAt`'s own read and a new
  pure `balanceSeries` (research R-002);
- `GET /ai/status`, `{ configured }`, so "Summarize with AI" renders disabled from the start
  (FR-020 as amended 2026-09-23, research R-004).

No entry path, table, migration or module is added. The one new dependency is Tailwind CSS v4
for styling, build-time only (research R-013). **Contract frozen with this
plan**: [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml) (yaml 1.0.0 → 1.1.0). The
Prisma schema is unchanged.

## Technical Context

**Language/Version**: unchanged from feature 001: TypeScript 7.0.2, `strict`, on Node 24 LTS.

**Primary Dependencies**: unchanged. React 19.3, React Router 8.4, TanStack Query 5.103,
React Hook Form 7.88, openapi-fetch 0.17. NestJS 12.1, Prisma 7.10. **New devDependencies: `tailwindcss` 4.3.3 and
`@tailwindcss/vite` 4.3.3** (R-013), which are build-time only. No new runtime dependency. Charts, toasts, palette, swipe and keypad are hand-written (R-007 to R-010). The
Geist fonts are vendored files, not a package (R-006).

**Storage**: PostgreSQL 18, no schema change. The balance series is derived on every read and
never stored.

**Testing**: unchanged tools (Vitest 5, supertest + ajv, Playwright 1.63 Chromium). Additions
are listed in R-012. New CI step: `check:tokens` (R-005).

**Target Platform**: the same Docker Compose stack. Browsers: current Chromium, Firefox and
Safari, desktop and mobile. The layout switches below 768 px.

**Project Type**: the existing pnpm monorepo (`apps/api`, `apps/web`, `packages/contract`,
`e2e`).

**Performance Goals**: SC-006, the dashboard with its 1Y chart usable within 2 s on the 5 000-
transaction dataset. The balance-history read is O(days + entries) per account (R-002).

**Constraints**: every figure identical to feature 001 (FR-020). WCAG AA text contrast
(SC-003). No hard-coded colour, size, radius, shadow or duration in components (SC-004).
Reduced-motion honoured (FR-015). No horizontal scroll at 390 px. Everything operable by
keyboard (FR-019).

**Scale/Scope**: 20 design screens mapped onto the 10 existing routes plus 3 overlays (palette,
transaction sheet, row actions). 3 read-only API additions. Deadline 2026-09-25 (spec Assumptions): stories
5–7 slip first.

## Constitution Check

_GATE: evaluated before Phase 0 and again after Phase 1: **PASS**, both times. One justified
entry and six recorded ceilings in Complexity Tracking. The FR-020 / US4 conflict was resolved by amending FR-020 (R-004)._

| Principle                  | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Ledger integrity        | No write path is added. Undo and swipe-delete call the existing `DELETE /transactions/{id}`, a soft delete inside the existing transaction with its balance deltas. The series is computed from entries on every read and never cached. Integrity and reconciliation run after the Undo e2e.                                                                                                                                                              |
| II. Integer money          | The series is `bigint` in the domain and cent strings on the wire. The web does all arithmetic in `BigInt` through `money.ts`: change since range start, donut share, below-zero detection, and the count-up, which interpolates in `bigint`. The only `number` view of cents is chart geometry (`toPlotNumber`), never displayed — see Complexity Tracking.                                                                                              |
| III. One translation point | Untouched. Neither addition mentions entries, debits, credits or system accounts. The day net on the account list is derived from `kind` and the account's role, as feature 001 already does.                                                                                                                                                                                                                                                             |
| IV. Contracts before code  | The delta is frozen here and applied verbatim to the single canonical yaml as the first Foundational task (R-003). The Prisma schema is unchanged. Web types are regenerated, never hand-written.                                                                                                                                                                                                                                                         |
| V. Validate at the edges   | `q` validated in `TransactionListQueryDto` (trimmed, 1–60). New `BalanceHistoryQueryDto` checks every input-only rule: `IsDateOnly`, `includeArchived` through the existing `@ToBoolean()`, `to` not after today, `from ≤ to`, the 10-year span. Cross-field failures throw the existing `ValidationFailedError` from the DTO, as `transaction-request.dto.ts` does, and are mapped only in the global filter. The service only applies defaults (R-002). |
| VI. Domain tests first     | `balance-series.spec.ts` (equality with `balanceAt` at every index, plus edges), the `escapeLike` spec and `accounts.service.spec.ts` for the active-only total are written with the code. The new web logic (plot/count-up helpers, due labels, grouping, contrast) gets colocated tests. The global integrity test is unchanged and still gates CI.                                                                                                     |
| VII. Modular monolith      | The graph is unchanged: `accounts → ledger` gains `LedgerService.balanceSeries` and `LedgerService.earliestEntryDate`, public service methods, and `ai` gains `AiService.isConfigured()` inside its own module. No repository crosses a module boundary. On the web, features still never import each other; the new shared pieces live in `shared/ui` and `shared/lib`.                                                                                  |

Stack constraints: no new runtime dependency. Reason stated for the two new devDependencies:
Tailwind generates the utility classes from `tokens.css` via `@theme`, so the design scale lives
in one file and SC-004 can be checked mechanically (R-005, R-013). Chosen by the user on
2026-09-23. Vendored fonts are static assets under SIL OFL, and their
licence ships with them.

## Project Structure

### Documentation (this feature)

```text
specs/002-ui-redesign/
├── plan.md                 # This file
├── research.md             # R-001…R-012
├── data-model.md           # derived read models, client view models, Undo flow
├── quickstart.md           # validation scenarios 1–13
├── contracts/
│   └── openapi-delta.yaml  # FROZEN — applied to the canonical 001 yaml in Foundational
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root) — only what this feature touches

```text
specs/001-personal-finance-manager/contracts/openapi.yaml   # delta applied, info.version 1.1.0
packages/contract/src/types.ts                               # regenerated

design/
├── tokens.css              # rewritten from Screens v2 as Tailwind `@theme static` + motion `:root` (R-005)
├── design-system.md        # rewritten; the kept rules + v2 components (FR-003)
└── screens/                # v2 = reference; v1 kept for history

apps/api/src/modules/
├── ledger/
│   ├── domain/balance-series.ts (+ .spec.ts)              # new, pure
│   ├── repositories/transactions.repository.ts            # whereFor: q (escaped ILIKE)
│   └── services/ledger.service.ts                         # + balanceSeries(), earliestEntryDate()
└── accounts/
    ├── controllers/accounts.controller.ts                 # + GET balance-history (before :id routes)
    ├── dtos/balance-history-query.dto.ts (+ .spec.ts)     # new
    ├── dtos/balance-history-response.dto.ts (+ .spec.ts)  # new, static from(), bigint→string
    ├── dtos/transaction-list-query.dto.ts                 # + q
    └── services/accounts.service.ts (+ .spec.ts)          # + balanceHistory(), active-only total
apps/api/src/modules/ai/
├── controllers/ai.controller.ts                           # + GET /ai/status
├── dtos/ai-status-response.dto.ts                         # new
└── services/ai.service.ts                                 # + isConfigured()
apps/api/src/common/escape-like/escape-like.ts (+ .spec.ts)  # new
apps/api/test/balance-history.e2e-spec.ts                    # new; transactions e2e + q cases; ai e2e + status (key set / empty)

apps/web/
├── package.json                               # + tailwindcss, @tailwindcss/vite (dev); + check:tokens
├── vite.config.ts                             # + tailwindcss() plugin
├── scripts/check-tokens.mjs                   # new (R-005), CI step; rejects literals and arbitrary utilities
└── src/
    ├── app/                                   # shell: Sidebar, TabBar, ToastProvider, palette + ⌘K/⌘Z listeners
    │   ├── fonts/                             # Geist + Geist Mono variable woff2 + OFL.txt (R-006)
    │   ├── main.tsx                           # imports app.css only
    │   └── app.css                            # @import tailwindcss + tokens; @font-face, base, keyframes, reduced motion
    ├── features/*/components/…                # every page reskinned in place (US1, US3); accounts gains the dashboard (US2)
    ├── shared/ui/
    │   ├── LineChart/ Sparkline/ Donut/       # new (R-007)
    │   ├── Toast/                             # new (R-008)
    │   ├── CommandPalette/                    # new (R-009)
    │   ├── TabBar/ Keypad/ SwipeRow/ RowActions/   # new (R-010)
    │   ├── Skeleton/                          # new (FR-012)
    │   ├── ErrorNotice/                       # new: message + correlation id + Copy ID / Try again (FR-013)
    │   └── Modal/ (sheet variant), EmptyState/ (screen 20 copy), existing pickers/inputs restyled
    └── shared/lib/
        ├── money.ts                           # + toPlotNumber, countUpFrames, share (BigInt)
        ├── dates.ts (+ test)                  # new: localToday, relative due label, Upcoming horizons (R-011)
        └── query-keys.ts                      # + balanceHistory, transactionSearch (under the entry-derived keys), refetchEntryDerived
e2e/specs/                                     # story-1…6 updated; redesign-{dashboard,states,palette,undo,phone}.spec.ts
e2e/perf/dashboard.perf.spec.ts (+ config)     # new; SC-006, run by `pnpm test:perf` on the perf seed, not in CI
```

**Structure Decision**: the feature 001 layout and conventions apply unchanged (no barrels,
colocated tests, features never import features, every literal value is a token). No new
routes. The palette, the sheet and the row actions are overlays mounted from `app/`. The
dashboard stays the `accounts` route.

## Screen → route → story

| Screen                            | Where                                          | Story     |
| --------------------------------- | ---------------------------------------------- | --------- |
| 01 Dashboard                      | `/` (index, `AccountsRoute`)                   | US2       |
| 02 Account detail, just saved     | `/accounts/:id`                                | US3 (US6) |
| 03 Monthly expenses               | `/report`                                      | US3       |
| 04 Upcoming                       | `/upcoming`                                    | US3       |
| 05 Projection                     | `/projection`                                  | US3       |
| 06 New transaction                | `TransactionForm` in `Modal`, from any route   | US3       |
| 07 Command palette                | overlay from `app/`                            | US5       |
| 08 Loading                        | `Skeleton` on every route                      | US4       |
| 09 Dashboard (phone)              | `/` below 768 px                               | US7       |
| 10 Swipe on a transaction         | transaction rows below 768 px                  | US7       |
| 11 New expense sheet              | `Modal` sheet + `Keypad`                       | US7       |
| 12 Account form                   | `AccountForm` from `/`                         | US3       |
| 13 Transactions, all accounts     | `/transactions`                                | US3       |
| 14 Transaction form by type       | `TransactionForm` (create and edit)            | US3       |
| 15 Categories                     | `/categories`                                  | US3       |
| 16 Schedule a payment             | `ScheduledItemForm` from `/upcoming`           | US3       |
| 17 Projection, payment by payment | `/projection` ledger                           | US3       |
| 18 Projects                       | `/projects`, `/projects/:id`                   | US3       |
| 19 Similar transactions report    | `/similar`                                     | US3       |
| 20 States board                   | empty, error and feedback states on each route | US4       |

The 10 routes are those of feature 001. The 3 overlays are the palette, the transaction sheet
and the row actions. The tab bar's More sheet (FR-018) has no screen in the design and belongs
to US7.

## Story → scope (phases for tasks.md)

| Story (priority)    | API                                                                                             | Web                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundational        | apply delta, regenerate types; `q` and balance-history end to end with their unit and e2e tests | Tailwind wiring, tokens.css as `@theme`, fonts, app.css base, `check:tokens` in CI, `dates.ts`, sidebar shell (FR-005)                                         |
| US1 Foundation (P1) | —                                                                                               | every route on the new tokens, kind glyphs and ▲/▼ (FR-004), money formatting with faint cents, reduced motion                                                 |
| US2 Dashboard (P2)  | —                                                                                               | `LineChart` (slider), `Sparkline`, ranges, "Balance as of" (not after today), archived toggle and dashed note                                                  |
| US3 Screens (P3)    | —                                                                                               | screens 02, 03, 04, 05, 12–19: layouts, donut, expandable rows, day groups, pagination, inline rename, below-zero marker                                       |
| US4 States (P4)     | —                                                                                               | `EmptyState` ×8, `Skeleton`, `ErrorNotice`, `Toast` saved/refresh-failed, AI notices, AI button disabled on load from `getAiStatus`, disabled reasons (FR-014) |
| US5 Palette (P5)    | —                                                                                               | `CommandPalette`, ⌘K, sidebar Search, edit-over-current-screen                                                                                                 |
| US6 Undo (P6)       | —                                                                                               | undo toast (once, latest only, closed by edit or delete, error toast on failure), ⌘Z rule, row flash                                                           |
| US7 Phone (P7)      | —                                                                                               | `TabBar` with More sheet, sheet + `Keypad`, `SwipeRow` + `RowActions`, stacked dashboard                                                                       |

Foundational applies the whole delta and implements all three API additions end to end, with their
domain, unit and e2e tests. That way `contract:check` never sees the yaml and the routes out of
step, and every story after Foundational is web-only. If US5 slips past the deadline, `q` ships
with no web consumer. That is accepted: it is read-only, tested and documented.

## Complexity Tracking

| Entry                                                            | Why needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Simpler alternative rejected because                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `money.ts#toPlotNumber`: cents → `number`, for SVG geometry only | SVG coordinates are floats. Principle II forbids `number` arithmetic on cents "where precision could be lost". Here the value is only turned into pixels: it is never displayed, summed or compared, and every label reads the exact `bigint` string. Ceiling: none that matters for display. Precision loss above 2^53 cents (about $90 trillion) moves a point by less than one pixel. Enforced by keeping it the only conversion in `money.ts` and asserting in `LineChart`/`Donut` tests that every rendered figure equals the source string. This ceiling and the ones below are recorded here and not in code comments: as constitution v1.1.0 and CLAUDE.md require. | Plotting in `bigint`: SVG cannot take bigint coordinates, so every value would still become a `number` at the attribute. Converting in one named place is the auditable version. |
| Balance history span clamped to 10 years (R-002)                 | Bounds the "All" response to about 3 650 values per account. Ceiling: with more than 10 years of history, "All" starts 10 years back. Upgrade path: server-side downsampling, with exact values fetched per hovered day.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No limit: the response grows without bound with the history.                                                                                                                     |
| Balance history reads one query per account (R-002)              | Reuses `listForAccount`, the read `balanceAsOf` already uses, so the series equals `balanceAt` by construction. Ceiling: requests grow with the number of accounts. Upgrade path: one grouped entries query when `perf:measure` shows it matters.                                                                                                                                                                                                                                                                                                                                                                                                                           | A grouped query now: a second read path to prove equal to `balanceAt`, with no measured need.                                                                                    |
| Transaction search is a sequential `ILIKE` (R-001)               | 5 000 rows are well within budget. Ceiling: search time grows linearly with the number of transactions. Upgrade path: a `pg_trgm` GIN index on `description`, a migration that re-enters the plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A trigram index now: a migration and an extension with no measured need.                                                                                                         |
| Chart path drawn from at most 180 points (R-007)                 | Keeps the "All" path readable and the morph cheap; hover and keys still read the exact day. Ceiling: inside a sampled bucket only the min and max survive. Upgrade path: scale the point count with the chart width.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Every day as a point: thousands of points for "All", slower to morph and no more readable.                                                                                       |
| Palette shows at most 8 transactions (R-009)                     | The palette is a jump list, and the count shows the total. Ceiling: older matches are not listed. Upgrade path: a "See all in Transactions" action carrying the query as a filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Paging inside the palette: a second list UI with no stated need.                                                                                                                 |
| Upcoming and forms use the browser's date (R-011)                | Accepted by the user on 2026-09-23. Ceiling: near midnight, when the browser's zone differs from `APP_TIMEZONE`, Upcoming and the dashboard can disagree by one day. Upgrade path: a server date read, which needs an FR-020 amendment.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reading the date from balance-history on every screen: a heavy read for one value.                                                                                               |

## Phase 1 re-evaluation

The design artifacts add no violation. The three contract additions are read-only and use the
existing money and error shapes (II ✓, V ✓). Neither exposes entries (III ✓). The series is
derived from entries on every call (I ✓). The module graph is unchanged (VII ✓). The contract is
frozen before any code (IV ✓). Gate: **PASS**.
