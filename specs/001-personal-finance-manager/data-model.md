# Data Model: Personal Finance Manager

**Feature**: `001-personal-finance-manager` | **Date**: 2026-09-20
**Companion artifacts**: [`contracts/schema.prisma`](contracts/schema.prisma) (frozen schema),
raw SQL below (ships as the first Prisma migration's raw section).

Conventions: every PK is `BIGINT GENERATED ALWAYS AS IDENTITY` (the stable FR-009 tie-breaker,
research R-008). Money columns are `BIGINT` integer cents (Principle II). Date columns are
`DATE` (FR-029). Soft delete only where stated.

## Entities

### Account (module: accounts)

A place the user holds money.

| Field       | Type                        | Rules                                                                         |
| ----------- | --------------------------- | ----------------------------------------------------------------------------- |
| id          | BIGINT PK                   |                                                                               |
| name        | VARCHAR(60)                 | 1–60 chars after trim; unique per `lower(trim(name))` incl. archived (FR-030) |
| kind        | enum `bank \| cash \| card` |                                                                               |
| openingDate | DATE                        |                                                                               |
| archived    | BOOLEAN default false       | archive/unarchive symmetric (FR-004)                                          |

- Balance is **never stored on the account**; it is derived from entries (current value cached
  in BalanceSnapshot).
- Opening balance is not a column: it is the account's single `opening` transaction (FR-002).
  Zero opening balance ⇒ no opening transaction. Editing opening balance/date edits or
  creates/deletes that transaction through the ledger (FR-001).

### Category (module: categories)

| Field    | Type                     | Rules                                               |
| -------- | ------------------------ | --------------------------------------------------- |
| id       | BIGINT PK                |                                                     |
| name     | VARCHAR(60)              | same name rule as Account, own namespace            |
| type     | enum `expense \| income` | immutable after creation (nothing in spec edits it) |
| archived | BOOLEAN default false    |                                                     |

Each category is backed by exactly one SystemAccount, created in the same atomic write
(categories.service opens the transaction, calls ledger to create it), never deleted,
untouched by rename/archive (spec Key Entities).

### SystemAccount (module: ledger — internal, never exposed)

The ledger-side counterparty rows. One per category plus one equity account.

| Field      | Type                                   | Rules                   |
| ---------- | -------------------------------------- | ----------------------- |
| id         | BIGINT PK                              |                         |
| kind       | enum `category \| equity`              |                         |
| categoryId | BIGINT FK → Category, nullable, unique | set iff kind = category |

The single `equity` row is created by the migration itself (not the seed): the ledger cannot
record an opening transaction without it. CHECK: `(kind = 'category') = (category_id IS NOT NULL)`.

### Transaction (module: ledger)

What the user did. Intent fields (amount, accounts, category) are **not** stored here — they
live in the entries, the single source of truth. The API response reconstructs the intent from
the entries plus `kind` (see mapping below).

| Field       | Type                                            | Rules                                                                      |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| id          | BIGINT PK                                       | secondary sort key (FR-009)                                                |
| kind        | enum `expense \| income \| transfer \| opening` | `opening` never interchanges with the others (FR-007)                      |
| date        | DATE                                            | ≤ today (FR-029); entries inherit it                                       |
| description | VARCHAR(120)                                    | 1–120 after trim (FR-005)                                                  |
| projectId   | BIGINT FK → Project, nullable                   | only when kind = expense (FR-020)                                          |
| deletedAt   | TIMESTAMPTZ nullable                            | soft delete (FR-007); non-null ⇒ excluded from every balance, list, report |

Indexes: `(date, id)` for list ordering; `(project_id)` for project reports; `(deleted_at)` partial.

### Entry (module: ledger)

One side of a transaction: signed amount into (+) or out of (−) an account.

| Field           | Type                                       | Rules                                           |
| --------------- | ------------------------------------------ | ----------------------------------------------- |
| id              | BIGINT PK                                  |                                                 |
| transactionId   | BIGINT FK → Transaction, ON DELETE CASCADE |                                                 |
| accountId       | BIGINT FK → Account, nullable              | user-account side                               |
| systemAccountId | BIGINT FK → SystemAccount, nullable        | system side                                     |
| amount          | BIGINT                                     | ≠ 0; sums to zero per transaction (Principle I) |

CHECK: exactly one of `account_id` / `system_account_id` is non-null; `amount <> 0`.
Sum-to-zero enforced by the deferred constraint trigger below **and** in the domain, both
inside one interactive Prisma transaction. Every intent of this feature produces exactly two
entries. Indexes: `(account_id)`, `(system_account_id)`, `(transaction_id)`.

### ScheduledItem (module: scheduled-items)

| Field       | Type                             | Rules                                                   |
| ----------- | -------------------------------- | ------------------------------------------------------- |
| id          | BIGINT PK                        |                                                         |
| kind        | enum `bill \| income`            |                                                         |
| description | VARCHAR(120)                     | FR-005 rule                                             |
| amount      | BIGINT                           | positive; ±10^15 guard at the edge (FR-022)             |
| accountId   | BIGINT FK → Account              | archived account ⇒ item stays, flagged (FR-018)         |
| categoryId  | BIGINT FK → Category             | type must match kind (FR-016)                           |
| nextDueDate | DATE                             | ≥ today on create; an edit may set the past (⇒ overdue) |
| recurrence  | enum `once \| weekly \| monthly` | monthly from 29–31 clamps to month-end                  |
| endDate     | DATE nullable                    | ≥ nextDueDate                                           |
| status      | enum `active \| completed`       | see transitions                                         |

The confirmation transaction has **no lasting link** to the item (FR-018) — no FK from
Transaction to ScheduledItem.

### Project (module: projects)

| Field  | Type                    | Rules                                         |
| ------ | ----------------------- | --------------------------------------------- |
| id     | BIGINT PK               |                                               |
| name   | VARCHAR(60)             | FR-030 name rule, own namespace, incl. closed |
| budget | BIGINT nullable         | positive when present; absent ≠ zero (US5 #8) |
| status | enum `active \| closed` |                                               |

Delete allowed only while no transaction (including soft-deleted ones? — no: only non-deleted
ones count as "unused"; a soft-deleted expense no longer references a live use, but its row
still points here, so **delete requires no referencing rows at all**, simplest and safest)
references it; otherwise `DOMAIN_RULE_VIOLATION` telling the user to close instead (FR-019, US5 #6).

### BalanceSnapshot (module: ledger — derived, internal)

| Field     | Type                    | Rules                                          |
| --------- | ----------------------- | ---------------------------------------------- |
| accountId | BIGINT PK, FK → Account | user accounts only                             |
| balance   | BIGINT                  | maintained in the same tx as every entry write |

Never a source of truth; rebuilt from entries by `ledger:rebuild`, reconciled by `ledger:check`
(FR-012, FR-031, research R-007).

## Intent → entries (LedgerService.toEntries, the only translation point)

All amounts below are positive integer cents except opening's, which is signed non-zero.

| Intent                            | Entry 1 | Entry 2       |
| --------------------------------- | ------- | ------------- |
| expense(a, account A, category C) | A: −a   | system(C): +a |
| income(a, account A, category C)  | A: +a   | system(C): −a |
| transfer(a, from A, to B)         | A: −a   | B: +a         |
| opening(s signed, account A)      | A: +s   | equity: −s    |

Derived reads:

- **current balance(A)** = Σ entries where account_id = A and transaction not soft-deleted
  (served from BalanceSnapshot; identical by construction).
- **balanceAt(A, d)** = same sum with `transaction.date ≤ d` (computed from entries, R-007).
- **monthly report(m)** = per expense-type category C: Σ entry.amount on system(C) where
  kind = expense, month(date) = m, not deleted. Income and transfers never touch an
  expense-category system account, so they are absent by construction (FR-013).
- **project spent(P)** = Σ amount of non-deleted expense transactions with projectId = P
  (read via the negative user-account entry, absolute value).
- **API transaction shape**: amount = |user-account entry|; account = its account; transfer
  source = the negative entry's account, destination = the positive one's; category =
  system-account entry's category.

## State transitions

- **Account.archived / Category.archived**: false ⇄ true, symmetric, no other field touched,
  no transaction touched (FR-004). Archived ⇒ excluded from pickers and totals; rejected as a
  reference in new transactions/edits/confirmations.
- **Project.status**: `active` ⇄ `closed` (FR-019). Closed ⇒ rejected on new transactions and
  edits (spec clarification). Delete: only unused, else 422.
- **ScheduledItem.status**: `active` → `completed` when confirmed as a `once` item, or when
  the advanced next due date would exceed `endDate` (FR-018). No transition back; the user
  re-creates. Editing never completes an item.
- **Transaction**: live → soft-deleted (`deletedAt` set). Edits regenerate all entries from
  the complete new intent in one atomic write; kind may change among expense/income/transfer;
  `opening` is edited only through the account form (FR-007).
- **ScheduledItem confirmation** (FR-018, one atomic transaction): record transaction with
  confirmed values (validated exactly like any new transaction) + advance `nextDueDate` one
  period (monthly clamps to month-end; overdue items advance one missed period per
  confirmation) or complete the item. Item's own amount/recurrence never altered.

## Raw SQL (first migration, alongside the Prisma-generated DDL)

```sql
-- Sum-to-zero, enforced at commit inside the same interactive transaction as the domain check
CREATE FUNCTION entries_sum_to_zero() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id BIGINT := COALESCE(NEW.transaction_id, OLD.transaction_id);
  s BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO s FROM entries WHERE transaction_id = tx_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'entries of transaction % sum to %, not zero', tx_id, s;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER entries_sum_to_zero
  AFTER INSERT OR UPDATE OR DELETE ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION entries_sum_to_zero();

-- Case- and whitespace-insensitive unique names, archived/closed rows included (FR-030)
CREATE UNIQUE INDEX accounts_name_unique   ON accounts   (lower(trim(name)));
CREATE UNIQUE INDEX categories_name_unique ON categories (lower(trim(name)));
CREATE UNIQUE INDEX projects_name_unique   ON projects   (lower(trim(name)));

-- Entry shape: exactly one side, never a zero amount
ALTER TABLE entries
  ADD CONSTRAINT entries_one_side CHECK (num_nonnulls(account_id, system_account_id) = 1),
  ADD CONSTRAINT entries_nonzero  CHECK (amount <> 0);

-- System account shape + the equity row the ledger cannot exist without
ALTER TABLE system_accounts
  ADD CONSTRAINT system_account_shape CHECK ((kind = 'category') = (category_id IS NOT NULL));
INSERT INTO system_accounts (kind) VALUES ('equity');
```

## Seed (FR-025, deterministic `db:seed`)

Deterministic means: two runs on the same calendar date (in `APP_TIMEZONE`) produce
byte-identical data; between different run dates only the dates shift, so the demo is always
current and the acceptance scenarios stay reproducible within a run date.

- The 12 fixed categories of FR-003 (9 expense, 3 income), each with its system account.
- 4 accounts: "Checking" (bank, opening $1,500.00 on the first seeded month's 1st), "Savings"
  (bank), "Visa" (card, negative opening −$500.00 — exercises US1 #11), "Cash" (cash), plus
  one archived account "Old Bank" with readable history (exercises FR-004).
- 60–100 transactions over the 3 months ending today (dates computed relative to seed-run
  "today" in APP_TIMEZONE so the demo is always current), hand-checkable, covering every
  category with activity, at least one transfer per month, descriptions that exercise FR-014
  grouping ("Uber 1234", "UBER 5678", "uber", …).
- Scheduled items: one `once` bill, one `monthly` bill (anchored on the 31st to show
  month-end clamping), one `weekly` income, one with an end date, one overdue. Amounts are
  sized so the projection to the end of next month dips below zero at least once — the
  walkthrough shows that flagged occurrence (US4 AS-5).
- One archived category with historical expenses; one project "Trip to France" with budget
  and tagged expenses from two accounts, and one closed project.
- `db:generate-perf` (FR-032, separate explicit command): ~5 000 transactions over 24 months,
  deterministic PRNG, never part of startup.
