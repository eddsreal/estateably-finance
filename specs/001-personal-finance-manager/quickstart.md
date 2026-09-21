# Quickstart & Validation: Personal Finance Manager

**Feature**: `001-personal-finance-manager` | **Date**: 2026-09-20

How to run the app, prove the feature works end to end, and demo it. Contract details live in
[`contracts/openapi.yaml`](contracts/openapi.yaml); entities in [`data-model.md`](data-model.md).

## Prerequisites

- Docker with Compose (only requirement for the reviewer path).
- For development: Node 24 (`.nvmrc`), pnpm 12.5 (`corepack enable` honours `packageManager`).

## Run everything (reviewer path, SC-007)

```sh
docker compose up
```

One command brings up `postgres:18`, runs migrations and the deterministic demo seed
(FR-025), and serves:

- **Web (SPA)**: http://localhost:8080
- **API**: http://localhost:3000 (separate origin; strict CORS allowlist)
- **API docs**: http://localhost:8080/docs (Swagger UI, static, rendering the frozen contract)

Expected: a working UI with demo data in under five minutes, image downloads aside.

## Development

```sh
pnpm install
docker compose up postgres          # database only
pnpm db:migrate && pnpm db:seed
pnpm dev                            # api on :3000, web (Vite) on :5173
```

## Environment (complete list, FR-035 — never invent another variable)

| Variable         | Default                                       | Purpose                                                     |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`   | compose-provided                              | PostgreSQL connection                                       |
| `APP_TIMEZONE`   | `UTC`                                         | The timezone that defines "today"                           |
| `LOG_LEVEL`      | `info`                                        | JSON log level                                              |
| `LLM_API_KEY`    | _(empty = AI disabled)_                       | Anthropic key for the narrative                             |
| `LLM_TIMEOUT_MS` | `10000`                                       | LLM call timeout                                            |
| `CORS_ORIGINS`   | `http://localhost:5173,http://localhost:8080` | Comma-separated browser-origin allowlist for the API's CORS |

## Root scripts (fixed names)

| Script                        | What it proves                                                            |
| ----------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`     | monorepo builds                                                           |
| `pnpm lint`                   | oxlint (incl. `--type-aware`), one root config                            |
| `pnpm typecheck`              | `tsc` (TS7) across packages                                               |
| `pnpm test`                   | unit: domain, services, DTOs, components — no DB needed                   |
| `pnpm test:e2e`               | supertest vs real Postgres; every response ajv-validated against the yaml |
| `pnpm test:ui`                | Playwright (Chromium) vs the compose stack, keyboard-only story specs     |
| `pnpm db:migrate` / `db:seed` | schema + deterministic demo data                                          |
| `pnpm db:generate-perf`       | ~5 000 tx / 24 months (FR-032; never part of startup)                     |
| `pnpm ledger:check`           | sum-to-zero integrity + snapshot reconciliation (FR-031)                  |
| `pnpm ledger:rebuild`         | rebuild the balance cache from entries alone                              |
| `pnpm contract:check`         | Nest routes ⟷ yaml paths diff (drift guard)                               |
| `pnpm contract:generate`      | regenerate web types from the yaml                                        |
| `pnpm perf:measure`           | SC-008 p95 measurement (below)                                            |

## Validation scenarios

1. **Ledger integrity (SC-002/SC-003/SC-010)**: `pnpm ledger:check` against the seeded
   compose DB → passes. Corrupt one snapshot by hand
   (`UPDATE balance_snapshots SET balance = balance + 1 WHERE account_id = 1;`) → fails
   naming the account; `pnpm ledger:rebuild` then `pnpm ledger:check` → passes again.
2. **Contract honesty**: `pnpm contract:check` → zero drift. `pnpm test:e2e` → every
   response matches the yaml schema for its endpoint and status, amounts arriving as strings.
3. **Structured errors (SC-006)**: covered by the API e2e — each invalid request of FR-008,
   FR-016, FR-020 answers the `ErrorResponse` shape and writes nothing.
4. **Security headers & CORS**: covered by the security e2e — helmet headers present, allowed
   origin echoed, foreign origin gets no CORS headers, preflight answered.
5. **Stories end to end (SC-001/SC-009/SC-011/SC-012)**: `pnpm test:ui` — one Playwright
   spec per story, keyboard-only, dollars-never-cents assertions, refetch-after-write checks,
   correlation id surfaced on failures.
6. **Performance (SC-008)**: with the compose stack up,
   `pnpm db:generate-perf && pnpm perf:measure` → prints p95 per endpoint; balances/lists
   under 1 s, monthly report/projection under 2 s. Manual, not CI (method in research R-013).

## README content plan (written in the Polish phase)

1. What it is, one paragraph + screenshot.
2. **Run it**: the single `docker compose up`, the three URLs, the under-five-minutes claim.
3. Environment variables table (the six above, defaults included).
4. Scripts table (as above).
5. Testing: `test`, `test:e2e` (needs Postgres), `test:ui` (needs compose), `ledger:check`.
6. Performance: how to run `db:generate-perf` + `perf:measure` and read the p95 output.
7. Architecture in ten lines: monorepo map, module graph, the ledger/money principles, link
   to `/docs` and to the constitution.
8. AI narrative: optional, set `LLM_API_KEY`, degrades to a disabled button without it.

## Walkthrough script (15–20 min, SC-001) — runs on the seeded demo data

Total ≈ 18 min. Every figure shown is hand-checkable against the seed (data-model.md fixes
its content; the seed README section lists the exact expected numbers once implemented).

1. **Accounts & transactions (P1, ~4 min)**: open Accounts — seeded accounts with balances,
   dashboard total, "Visa" showing negative (sign, not colour alone). Create account
   "Wallet" (cash, $100.00 opening) → appears with balance. Record an expense (autofocus on
   amount; type `42.5`, blur normalises to `42.50`), an income, a transfer (source account
   disabled with "— source" in the destination picker). Edit the expense into a transfer →
   category cleared. Try a same-account transfer → error beside the field. Delete a
   transaction → balances update without reload. Archive "Old Bank" is already archived —
   unarchive it, watch the total change, archive it back.
2. **Balances (P2, ~2 min)**: account detail — current balance; pick an as-of date between
   two seeded transactions and verify the arithmetic by hand; date before the opening → $0.00.
3. **Monthly report (P3, ~3 min)**: current month — per-category totals sum to the grand
   total; open a category row to see its expenses; click one to edit it into last month →
   both months' reports move; switch months without reload.
4. **Scheduled & projection (P4, ~4 min)**: Upcoming — seeded items with relative due labels
   ("Due in N days", "Overdue N days"); the overdue item flagged. Projection to next month's
   end → running series, hand-check the final figure; the below-zero occurrence flagged.
   Mark the rent bill paid, change amount and date in the confirmation → transaction exists,
   item advanced one month, projection no longer counts October's rent, report counts the
   confirmed amount.
5. **Projects (P5, ~2 min)**: "Trip to France" — spent, remaining, expense list across two
   accounts. Tag a new expense with it → figures update. Try deleting it → structured error
   says close instead; close, reopen.
6. **Similar report + AI (P6, ~3 min)**: generate for the seeded month — the three "Uber"
   variants group with count 3, top-5 highlighted, most expensive group flagged. With
   `LLM_API_KEY` set, generate the narrative; without it, show the disabled button and the
   structured `AI_NOT_CONFIGURED` answer in `/docs`.

Throughout: keyboard only (SC-012), amounts always dollars (SC-009), and one deliberate
validation error to show the field-level message plus the correlation id matching a stdout
log line (SC-011).
