# Data model: UI redesign

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-23

No new domain entities, tables, columns, constraints or migrations. The Prisma schema frozen in
[feature 001](../001-personal-finance-manager/contracts/schema.prisma) is unchanged. Everything
below is derived when read and is never stored.

## Derived read models (API)

### Daily balance series (`BalanceHistoryResponse`, research R-002)

| Field                 | Type               | Rule                                                                                                                                  |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `from`, `to`          | `DateOnly`         | `from ≤ to ≤ today`; span ≤ 10 years; `to` defaults to today (`APP_TIMEZONE`); `from` defaults to the active accounts' earliest entry |
| `accounts[].balances` | `Money[]` (bigint) | length `to − from + 1`; `[i] = balanceAt(entries, from + i)`                                                                          |
| `accounts[].archived` | boolean            | archived accounts are present only with `includeArchived=true`                                                                        |
| `total`               | `Money[]` (bigint) | `[i] = Σ balances[i]` over **non-archived** accounts only                                                                             |

- **Source**: `EntriesRepository.listForAccount`, the read `balanceAsOf` already uses. Pure
  function `ledger/domain/balance-series.ts`:
  `balanceSeries(entries, from, to): bigint[]`.
- **Invariants (unit-tested)**: equality with `balanceAt` at every index. Constant across days
  with no entries. All zeros before the first entry. Soft-deleted transactions contribute nothing,
  because the repository already filters `deletedAt IS NULL`.
- **Owner**: `accounts` picks the accounts (it owns archived state), asks
  `LedgerService.earliestEntryDate` for the default `from`, and sums the total. `ledger` computes
  each series. The module graph is unchanged (accounts → ledger).
- **Client join**: the web always requests both with `includeArchived=true` and joins `accounts[]`
  with `listAccounts` by `accountId` for names and kinds. The archived toggle only filters cards
  on the client (research R-002).

### Transaction search (`listTransactions` + `q`, research R-001)

- `TransactionFilters` gains `q?: string`. `whereFor` adds
  `description ILIKE '%' || escapeLike(q) || '%'` (Prisma `contains` + `mode: 'insensitive'`
  on the escaped value), combined with the other filters by AND.
- Result, order (`date desc, id desc`), pagination and `deletedAt` filter are those of feature 001. The palette asks for `limit=8`.

## Client view models (web, presentation only)

None of these hold money as `number`. Cents stay branded `Cents` strings and any arithmetic uses
`BigInt` through `shared/lib/money.ts`.

| Model                 | Where                      | Content                                                                                                                    | Lifetime                                                                                                                     |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Dashboard range       | `features/accounts`        | `'7D' \| '30D' \| '90D' \| '1Y' \| 'All'` + `asOf` date (≤ today) → `to = asOf`, `from = asOf − (N − 1)`; All omits `from` | component state                                                                                                              |
| Chart selection       | `shared/ui/LineChart`      | selected day index (`role="slider"`); headline = `total[i]`, change = `total[i] − total[0]` (BigInt)                       | component state                                                                                                              |
| Toast                 | `shared/ui/Toast`          | `{ id, kind: 'saved' \| 'undo' \| 'error' \| 'refresh-failed', message, correlationId?, transactionId? }`                  | undo: `--dur-undo`, at most one, closed on first use or by an edit or delete of its id; refresh-failed: until Retry succeeds |
| Palette result        | `shared/ui/CommandPalette` | `{ group: 'Transactions' \| 'Reports' \| 'Actions', label, run() }`; transactions carry a `TransactionResponse`            | while open                                                                                                                   |
| Upcoming group        | `shared/lib/dates.ts`      | `'overdue-and-2-weeks' \| 'later-this-month' \| 'later-months'` + relative label                                           | derived per render                                                                                                           |
| Projection below-zero | `features/projection`      | first occurrence with `runningBalance < 0` (BigInt), lowest point, later negative periods                                  | derived per render                                                                                                           |
| Donut share           | `shared/ui/Donut`          | tenths of a percent by largest remainder (sum exactly 1000) → one-decimal percent string                                   | derived per render                                                                                                           |

## State transitions

Only one flow is new, and it reuses an existing path:

```text
create transaction ──201──▶ Undo toast (5 s, id held)
   ├─ Undo / ⌘Z outside a text field ──▶ toast closes ──▶ DELETE /transactions/{id}  (feature 001 path)
   │     ├─ 204 ──▶ invalidate
   │     └─ error ──▶ error toast with correlation id; transaction stays
   ├─ another create ──▶ this toast is replaced by the new one
   ├─ edit or delete of this id ──▶ toast closes, Undo gone
   └─ timeout ──▶ toast closes, Undo gone
```

Swipe-left delete and the row "⋯ → Delete" action both open `TransactionForm` in edit mode with
its delete confirmation showing, and then use its `DELETE`, which also closes a matching Undo. Edits and deletes show a "saved" toast with no Undo.
