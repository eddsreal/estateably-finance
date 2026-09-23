# Estateably Finance

A personal finance manager: accounts, income, expenses and transfers on a double-entry ledger,
balances now and at any past date, monthly expenses by category, upcoming bills and income
with a budget projection, expenses per project, and a report that groups similar transactions,
with an optional AI-written summary. Money is stored as whole cents in a single currency.

![Accounts screen on the demo data](.github/screenshot.png)

## Run it

```sh
docker compose up
```

That one command starts PostgreSQL, runs the migrations, loads the demo data and serves:

- **App**: http://localhost:8080
- **API**: http://localhost:3000
- **API docs**: http://localhost:8080/docs

Once the images are downloaded, you have a working app with demo data in under five minutes.
The demo data is dated relative to today, and it is reloaded every time the stack starts.

### Development

Requires Node 24 (`.nvmrc`) and pnpm 12.5 (`corepack enable`).

```sh
pnpm install
cp .env.example .env
docker compose up postgres
pnpm db:migrate && pnpm db:seed
pnpm dev                     # api on :3000, web on :5173
```

## Environment

These are all the variables the app reads. `.env.example` holds the development defaults.

| Variable         | Default                                                 | Purpose                                                        |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`   | `postgresql://postgres:postgres@localhost:5432/finance` | PostgreSQL connection (compose injects its own)                |
| `APP_TIMEZONE`   | `UTC`                                                   | The timezone that defines "today"                              |
| `LOG_LEVEL`      | `info`                                                  | JSON log level                                                 |
| `LLM_API_KEY`    | _(empty = AI disabled)_                                 | Anthropic key for the similar-transaction narrative            |
| `LLM_TIMEOUT_MS` | `10000`                                                 | LLM call timeout                                               |
| `LLM_BASE_URL`   | `https://api.anthropic.com`                             | LLM provider base URL; the e2e suite points it at a local stub |
| `CORS_ORIGINS`   | `http://localhost:5173,http://localhost:8080`           | Comma-separated browser origins the API accepts                |
| `NODE_ENV`       | _(unset in dev; compose sets `production`)_             | Platform convention; `production` turns on the HSTS header     |

## Scripts

| Script                        | What it does                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`     | Run or build every package                                                                     |
| `pnpm lint`                   | oxlint with type-aware rules, one root config                                                  |
| `pnpm typecheck`              | `tsc` (TypeScript 7) across packages                                                           |
| `pnpm test`                   | Unit tests: domain, services, DTOs, components (no database needed)                            |
| `pnpm test:e2e`               | API tests with supertest against a real PostgreSQL, each response checked against the contract |
| `pnpm test:ui`                | Playwright (Chromium) against the compose stack, one keyboard-only spec per story              |
| `pnpm db:migrate` / `db:seed` | Apply the schema, load the demo data                                                           |
| `pnpm db:generate-perf`       | Replace the data with the demo seed plus 5 000 transactions over 24 months                     |
| `pnpm ledger:check`           | Check that entries sum to zero and every cached balance matches its entries                    |
| `pnpm ledger:rebuild`         | Recompute every cached balance from entries alone                                              |
| `pnpm contract:check`         | Diff the API's routes against the contract                                                     |
| `pnpm contract:generate`      | Regenerate the web client's types from the contract                                            |
| `pnpm perf:measure`           | Measure p95 response times against the performance targets                                     |

## Testing

- `pnpm test` runs anywhere.
- `pnpm test:e2e` needs PostgreSQL: `docker compose up postgres`, with `DATABASE_URL` set.
- `pnpm test:ui` needs the full stack: `docker compose up`.
- `pnpm ledger:check` verifies the ledger in whatever database `DATABASE_URL` points at.

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main` and every pull request.

## Performance

With the stack up:

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance pnpm db:generate-perf
pnpm perf:measure
```

The generator is deterministic and runs only when you call it. It replaces whatever data is
in the database; restart the stack or run `pnpm db:seed` to get the demo data back.
`perf:measure` warms up each endpoint with 20 requests, then times 200 sequential requests
and prints the p95. Each time is the full round trip on localhost, so it is never less than
the server-side time. The script exits non-zero if any endpoint is over its budget.

Measured on 2026-09-24, compose stack on a developer laptop, 5 083 transactions:

| Endpoint                              | p95    | Budget |
| ------------------------------------- | ------ | ------ |
| Account list with balances            | 4.6 ms | 1 s    |
| Transaction list (default page of 50) | 2.2 ms | 1 s    |
| Balance as of a date                  | 6.9 ms | 1 s    |
| Monthly report                        | 3.2 ms | 2 s    |
| Projection, 12 months                 | 4.2 ms | 2 s    |

## Architecture

- A pnpm monorepo: `apps/api` (NestJS, Prisma, PostgreSQL), `apps/web` (React, Vite),
  `packages/contract` (web types generated from the OpenAPI contract), `e2e` (Playwright).
- The contract, [`openapi.yaml`](specs/001-personal-finance-manager/contracts/openapi.yaml),
  was written before the code and serves `/docs` as it is. `contract:check` and the e2e suite
  fail if the API drifts from it.
- The API is a modular monolith. `ledger` is at the bottom; `categories` and `projects` sit on
  it; `accounts` owns transactions; `reports`, `scheduled-items` and `ai` sit on top. Modules
  call each other only through their public services.
- Every transaction becomes entries that sum to zero. The domain enforces that, and so does a
  database constraint checked when the transaction commits.
- Money is integer cents: `BIGINT` in the database, `bigint` in code, strings on the wire.
  Only the UI shows dollars.
- One function, `LedgerService.toEntries`, turns intent into entries. The API and the UI never
  mention debits or credits.
- The rules behind all of this are in the
  [constitution](.specify/memory/constitution.md).

## AI narrative

The similar-transaction report can add a short written summary. The summary is optional:
set `LLM_API_KEY` (for compose: `LLM_API_KEY=... docker compose up`). Without a key, the
report works as usual and the summary button is disabled. If the provider fails or is slow,
the app shows a notice and leaves the report on screen.
