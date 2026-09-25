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

| Script                               | What it does                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`            | Run or build every package                                                                         |
| `pnpm lint`                          | oxlint with type-aware rules, one root config                                                      |
| `pnpm typecheck`                     | `tsc` (TypeScript 7) across packages                                                               |
| `pnpm test`                          | Unit tests: domain, services, DTOs, components (no database needed)                                |
| `pnpm test:e2e`                      | API tests with supertest against a real PostgreSQL, each response checked against the contract     |
| `pnpm test:ui`                       | Playwright (Chromium) against the compose stack, one keyboard-only spec per story                  |
| `pnpm db:migrate` / `db:seed`        | Apply the schema, load the demo data                                                               |
| `pnpm db:generate-perf`              | Replace the data with the demo seed plus 5 000 transactions over 24 months                         |
| `pnpm ledger:check`                  | Check that entries sum to zero and every cached balance matches its entries                        |
| `pnpm ledger:rebuild`                | Recompute every cached balance from entries alone                                                  |
| `pnpm contract:check`                | Diff the API's routes against the contract                                                         |
| `pnpm contract:generate`             | Regenerate the web client's types from the contract                                                |
| `pnpm perf:measure`                  | Measure p95 response times against the performance targets                                         |
| `pnpm test:perf`                     | Playwright: the dashboard with its 1Y chart is usable within 2 s on the perf seed                  |
| `pnpm --filter web run check:tokens` | Fail on any colour, px, ms or arbitrary Tailwind value that does not come from `design/tokens.css` |

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
pnpm test:perf
```

The generator is deterministic and runs only when you call it. It replaces whatever data is
in the database; restart the stack or run `pnpm db:seed` to get the demo data back.
`perf:measure` warms up each endpoint with 20 requests, then times 200 sequential requests
and prints the p95. Each time is the full round trip on localhost, so it is never less than
the server-side time. The script exits non-zero if any endpoint is over its budget.

Measured on 2026-09-24, compose stack on a developer laptop, 5 083 transactions:

| Endpoint                              | p95     | Budget |
| ------------------------------------- | ------- | ------ |
| Account list with balances            | 3.7 ms  | 1 s    |
| Transaction list (default page of 50) | 2.2 ms  | 1 s    |
| Balance as of a date                  | 6.0 ms  | 1 s    |
| Monthly report                        | 2.6 ms  | 2 s    |
| Projection, 12 months                 | 4.0 ms  | 2 s    |
| Balance history, 1Y                   | 15.9 ms | 2 s    |
| Balance history, All                  | 18.5 ms | 2 s    |

`test:perf` then checks, in Chromium, that the dashboard with its 1Y chart is usable within 2 s
on the same data.

## Deployment

The compose file is the deployment unit: three containers, each built from its own Dockerfile.

| Container  | Image                                              | Port | Notes                                                       |
| ---------- | -------------------------------------------------- | ---- | ----------------------------------------------------------- |
| `postgres` | `postgres:18`                                      | 5432 | Health-checked; the api waits for it                        |
| `api`      | `apps/api/Dockerfile` (Node 24, compiled `tsc`)    | 3000 | Runs migrations, then the seed, then the server             |
| `web`      | `apps/web/Dockerfile` (Vite build served by nginx) | 8080 | Static SPA plus the API docs; security headers set by nginx |

To deploy on a single host:

```sh
git clone <repo> && cd estateably-finance
LLM_API_KEY=... docker compose up --build --detach --wait
```

The build is set up for a demo. Before a real environment, four things change:

1. **Stop seeding on start.** The api command runs `db:seed`, which reloads the demo data on every
   restart. In production it runs only `db:migrate`, ideally as a one-off release step, not on every
   replica.
2. **Make the API origin configurable.** The web client and the nginx CSP both point at
   `http://localhost:3000`. Either build the client with the real origin or serve the API under the
   same origin behind nginx (`/api`), which removes CORS entirely.
3. **Use a managed PostgreSQL** with backups and point-in-time recovery, and pass `DATABASE_URL` as
   a secret. The compose `postgres` service is for local use only.
4. **Add a health endpoint** for the load balancer and orchestrator. The API does not have one yet.

The images are stateless and read their configuration from the environment (see
[Environment](#environment)), so the same images run on any container platform: ECS/Fargate,
Cloud Run, Fly.io or Kubernetes.

## Scaling

Today the app serves one user. Scaling to many users is mostly a data problem, not a compute one.
The steps below are ordered: each one is taken when a measurement says it is needed, not before.

**1. Multi-tenancy (required before a second user).** Add authentication and a `user_id` on every
table, part of every unique index and of every query. It is enforced in the repositories and,
as a second layer, with PostgreSQL row-level security. The ledger invariant does not change: each
transaction still sums to zero, and so does each user's ledger.

**2. Horizontal API replicas.** The API keeps no state in memory, so it scales by adding replicas
behind a load balancer. The web app is static files and moves to a CDN.

**3. Push aggregation into SQL.** Today `balanceAsOf` and the reports load the matching rows and
sum them in Node. That is fast at 5 000 transactions (see [Performance](#performance)) but grows
linearly. The next step is `SUM(amount)` in the database with a composite index on
`(account_id, date)`, then month-end balance snapshots so an as-of balance reads one snapshot plus
at most a month of entries.

**4. Database capacity.** Connection pooling (PgBouncer) as replicas grow; read replicas for the
report, projection and history endpoints, which are read-only; writes stay on the primary because
the sum-to-zero check needs one transaction. When a single primary is no longer enough, shard by
`user_id`: a user's ledger never crosses users, so every transaction stays on one shard.

**5. Move slow work off the request.** The AI narrative calls an external provider synchronously.
Under load it moves to a job queue with a per-user rate limit and a cached result per report range.
Heavy reports and future bank-statement imports follow the same path.

**6. Split services only if a team or load profile needs it.** Modules talk only through their
public services, so `ai` or `reports` can be extracted without changing their callers. That is
an organisational decision, not a performance one.

**Observability.** Structured JSON logs with a correlation id already exist. At scale they go to a
log backend, with metrics (p95 per endpoint, error rate, pool saturation) and alerts on the
`ledger:check` result, run on a schedule against production.

## Architecture

- A pnpm monorepo: `apps/api` (NestJS, Prisma, PostgreSQL), `apps/web` (React, Vite),
  `packages/contract` (web types generated from the OpenAPI contract), `e2e` (Playwright).
- The contract, [`openapi.yaml`](specs/001-personal-finance-manager/contracts/openapi.yaml),
  was written before the code and serves `/docs` as it is. `contract:check` and the e2e suite
  fail if the API drifts from it.
- The API is a modular monolith. `ledger` is at the bottom; `categories` and `projects` sit on
  it; `accounts` owns transactions; `reports`, `scheduled-items` and `ai` sit on top. Modules
  call each other only through their public services.
- The web app is styled with Tailwind v4. Every colour, size, radius and timing comes from
  [`design/tokens.css`](design/tokens.css), loaded as the Tailwind theme; `check:tokens` runs in
  CI and rejects anything else. The fonts are Geist and Geist Mono, vendored under
  `apps/web/src/app/fonts/` (SIL OFL 1.1).
- The design references are in [`design/screens/`](design/screens/): `screens-v2.html` and
  `design-system-v2.html` are the current ones (the v1 files are kept for comparison). Open them
  in a browser. Where the two differ, Screens v2 wins.
- Every transaction becomes entries that sum to zero. The domain enforces that, and so does a
  database constraint checked when the transaction commits.
- Money is integer cents: `BIGINT` in the database, `bigint` in code, strings on the wire.
  Only the UI shows dollars.
- Feature 002 added three read-only additions to the contract, none of them a write path:
  `GET /accounts/balance-history` (one balance per day for each account and the total, behind the
  dashboard chart), `GET /ai/status` (whether the AI summary is configured, so its button is
  disabled from the first render) and `q` on `GET /transactions` (search by description, matched
  literally, used by the command palette).
- One function, `LedgerService.toEntries`, turns intent into entries. The API and the UI never
  mention debits or credits.
- The rules behind all of this are in the
  [constitution](.specify/memory/constitution.md).

## AI narrative

The similar-transaction report can add a short written summary. The summary is optional:
set `LLM_API_KEY` (for compose: `LLM_API_KEY=... docker compose up`). Without a key, the
report works as usual and the summary button is disabled. If the provider fails or is slow,
the app shows a notice and leaves the report on screen.
