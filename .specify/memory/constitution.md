<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR: workflow guidance materially changed)
- Modified sections:
  - Development Workflow & Quality Gates: ceilings of deliberate simplifications are recorded
    in the plan's Complexity Tracking instead of code comments. Rationale: CLAUDE.md forbids
    comments in code, and feature 001 already recorded every ceiling in Complexity Tracking.
- Templates requiring updates: none. CLAUDE.md already states this rule.
- Code made non-compliant: none. No ceiling comment exists in the code.
- Follow-up TODOs: none

Previous report (1.0.0)
- Version change: (template, unversioned) → 1.0.0
- Modified principles: none (initial ratification; all template placeholders replaced)
- Added sections:
  - Core Principles I–VII (Ledger Integrity, Integer Money, One Translation Point,
    Contracts Before Code, Validate at the Edges, Domain Tests First, Modular Monolith)
  - Technology Stack & Constraints
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: none
- Follow-up TODOs: none
-->

# Estateably Finance Constitution

Estateably Finance is a personal finance manager. Principles are listed in priority order:
when two principles conflict, the lower-numbered one wins.

## Core Principles

### I. Double-Entry Ledger Integrity (NON-NEGOTIABLE)

- Every transaction MUST consist of two or more entries whose amounts sum to exactly zero.
- The sum-to-zero invariant MUST be enforced twice: in the domain layer (before persistence) and
  by a database constraint. Both checks MUST run inside a single database transaction; a
  transaction and its entries are committed together or not at all.
- Entries are the single source of truth. Any cached or materialized balance is a derived
  optimization that MUST be reconcilable against entries at any time, and MUST be rebuilt from
  entries when a discrepancy is detected.
- No code path may create, update, or delete an entry outside a transaction that preserves the
  invariant. Partial writes, orphan entries, and one-sided adjustments are forbidden.

Rationale: a personal finance ledger is only useful if it can be trusted. Double-entry with a
hard zero-sum invariant makes every balance auditable and makes silent drift impossible.

### II. Integer Money in a Single Currency

- All monetary amounts MUST be represented as integers in cents.
- The system operates in a single currency. Multi-currency support is out of scope until a
  constitutional amendment introduces it.
- Floating-point types are forbidden for money anywhere in the domain, the API, and the database.
  This includes `number` arithmetic on cents in TypeScript where precision could be lost,
  `FLOAT`/`DOUBLE`/`REAL` columns in PostgreSQL, and decimal strings parsed as floats.
- Database money columns MUST be `BIGINT`. API payloads MUST carry money as JSON strings of
  integer cents (e.g. `"4250"`), never as JSON numbers: `JSON.parse` reads a JSON number as a
  float and can silently lose precision before any validation runs. Code that does arithmetic
  on cents MUST use `bigint` (`BigInt` in the browser), never `number`. Formatting for display
  (e.g. `$12.34`) happens only in the UI presentation layer.

Rationale: floats cannot represent most decimal amounts exactly. Integer cents make sums,
comparisons, and the zero-sum invariant exact by construction.

### III. One Translation Point

- Only `LedgerService.toEntries` MAY convert user intent into ledger entries. Supported intents
  are: expense, income, transfer, and opening balance. New intents are added to `toEntries`,
  never implemented elsewhere.
- The UI and the public API MUST NOT expose debits, credits, or system accounts. Users and API
  clients express intent (e.g. "expense of 1250 cents from account A in category C"); the
  ledger module alone decides which entries that produces.
- Other modules MUST NOT construct entries directly. They call the ledger module with an intent.

Rationale: a single translation point is the only place the zero-sum invariant needs to be
reasoned about, and it keeps accounting mechanics out of the product surface.

### IV. Contracts Before Code

- The OpenAPI specification and the database schema (Prisma) MUST be written and frozen in the
  plan phase before implementation of a feature starts.
- Backend, frontend, and infrastructure work proceed in parallel against the frozen contract.
  Agents and contributors MUST NOT change the contract unilaterally during implementation.
- A contract change during implementation MUST go back through the plan: update the spec and
  schema, record the change, and notify all parallel workstreams before continuing.
- Generated client types (from OpenAPI) and generated database types (from Prisma) are the
  reference; hand-written duplicates of contract types are forbidden.

Rationale: a frozen contract is what allows independent workstreams to run in parallel without
integration surprises at the end.

### V. Validate at the Edges

- All API input MUST be validated by DTOs using `class-validator` before it reaches a service.
  Unvalidated request bodies, query params, or path params MUST NOT be passed into the domain.
- Validation failures and all other errors MUST return a structured error response with one
  consistent shape across the whole API (at minimum: an error code, a human-readable message, and
  optional field-level details).
- Domain invariants (e.g. sum-to-zero, insufficient data for `balanceAt`) MUST throw typed domain
  errors. Domain code MUST NOT know about HTTP.
- Domain errors are mapped to HTTP status codes in exactly one place (a global exception filter).
  Controllers and services MUST NOT hand-roll HTTP error responses.

Rationale: validating once at the boundary keeps the domain free of defensive noise, and a single
error mapping keeps the API predictable for clients.

### VI. Tests for the Domain First

- Unit tests MUST cover, at minimum: `LedgerService.toEntries` for every supported intent, the
  sum-to-zero invariant (including rejection of unbalanced input), `balanceAt`, and budget
  projection.
- A global integrity test MUST assert that the sum of all entries in the database is zero. This
  test runs in CI on every change and MUST pass before merge.
- End-to-end tests MUST cover the main API flows: creating accounts, recording each intent type,
  reading balances, and reading reports.
- Domain unit tests are written before or alongside the domain code they cover, never deferred
  to a later task. A feature touching the ledger without the corresponding domain tests is
  incomplete.

Rationale: the domain is where money can be lost. It gets tests first; UI and glue code are
tested in proportion to their risk.

### VII. Modular Monolith

- The backend is a single NestJS application organized into modules with explicit boundaries:
  `accounts`, `ledger`, `categories`, `scheduled-items`, `projects`, `reports`, and `ai`.
- Each module MUST expose its capabilities only through its public service interface. Modules
  MUST NOT import another module's repositories, Prisma models, or internal helpers directly.
- Cross-module dependencies MUST be declared explicitly via NestJS module imports and MUST be
  acyclic.
- Any module MUST be extractable into a standalone service later without rewriting its
  consumers; if a change would make that impossible, it violates this principle.

Rationale: a monolith is the cheapest thing to build and operate now; explicit module boundaries
keep the option to split open without paying the distributed-systems cost up front.

## Technology Stack & Constraints

- Backend: NestJS (TypeScript) with PostgreSQL accessed through Prisma.
- Frontend: React with Vite (TypeScript).
- Local development and integration testing: Docker Compose (application + PostgreSQL).
- Continuous integration: GitHub Actions. CI MUST run linting, type checks, unit tests, the
  global integrity test, and end-to-end tests against a real PostgreSQL instance.
- TypeScript `strict` mode is required in every package.
- Adding a runtime dependency requires a stated reason in the pull request. Prefer the standard
  library, the platform, or an already-installed dependency over a new one.
- Database constraints (NOT NULL, foreign keys, check constraints, unique indexes) are preferred
  over application-level checks for any rule the database can express.

## Development Workflow & Quality Gates

- Every feature follows the Spec Kit flow: specification → plan (contract frozen here) →
  tasks → implementation. Implementation MUST NOT start before the plan's contract is frozen.
- Every pull request MUST state which principles it touches and how it complies. Reviewers MUST
  check the ledger and money principles (I–III) explicitly on any change that writes entries or
  handles amounts.
- No pull request merges with failing CI, a failing global integrity test, or a schema change
  that lacks a Prisma migration.
- Complexity that appears to violate a principle (a second entry-creation path, a cached balance
  without reconciliation, a cross-module internal import) MUST be justified in writing in the
  plan's complexity tracking, or removed.
- Deliberate simplifications with a known ceiling MUST be recorded in the plan's Complexity
  Tracking, naming the ceiling and the upgrade path. They are not marked in code comments.

## Governance

- This constitution supersedes all other practices, conventions, and templates in the
  repository. Where a template or guideline conflicts with it, the constitution wins.
- Amendments require: a written proposal describing the change and its rationale, an update to
  this document, a version bump, and a migration or remediation plan for any code the amendment
  makes non-compliant.
- Versioning follows semantic versioning:
  - MAJOR: a principle is removed, redefined, or its priority order changes in a way that
    invalidates existing compliant code.
  - MINOR: a principle or section is added, or existing guidance is materially expanded.
  - PATCH: clarifications, wording, or typo fixes with no semantic change.
- Compliance is reviewed on every pull request and at the plan phase of every feature via the
  plan's constitution check. Unresolved violations block merge.
- Runtime development guidance for agents lives in `CLAUDE.md` and MUST stay consistent with
  this document.

**Version**: 1.1.0 | **Ratified**: 2026-09-18 | **Last Amended**: 2026-09-22
