# Feature Specification: Personal Finance Manager

**Feature Branch**: `001-personal-finance-manager`

**Created**: 2026-09-19

**Status**: Approved (`review-spec`, 2026-09-19); ready for `/speckit.plan`

**Input**: Estateably technical challenge — "design, develop, and architect a web application that manages personal accounts, including banks and associated transactions (ledger system), with real-time balances, expense reports, future bill management, and budget projection."

**Governing document**: `.specify/memory/constitution.md` v1.0.0. Terms used here (_entry_, _intent_, _sum-to-zero invariant_, _translation point_, _scheduled item_) carry the meaning defined there.

## Overview

Estateably Finance lets a single user keep a trustworthy record of their money across several accounts. Every movement of money is recorded as a **transaction** that the user expresses as an **intent** — an expense, an income, a transfer between two of their accounts, or an opening balance — and that the system stores as a set of balanced ledger **entries**. Balances, reports and projections are all derived from those entries, so they can never disagree with each other. Because every balance is computed from the entries at the moment it is read, a balance is never stale: this read-after-write freshness is what "real time" means in this feature.

The product surface speaks the user's language (accounts, expenses, income, transfers, categories, bills, projects). It never exposes debits, credits or the system-side accounts the ledger uses internally.

The product surface also speaks the user's units. Everywhere the user reads or writes an amount it is a dollar figure such as `$1,234.56`. Integer cents are how the system stores and transports money internally; the user never sees them. Every amount in this specification is written in dollars for that reason.

## Clarifications

### Session 2026-09-19

- Q: What should "real-time balances" mean in this product? → A: Refetch after write. Balances are always derived from entries on read, and the UI refetches the balances it displays after each successful mutation. No server push, no polling.
- Q: When the user marks a scheduled item as paid, can the amount and the date be adjusted before confirming? → A: Yes. Marking as paid opens a confirmation pre-filled from the scheduled item; the user may change the amount and the date. The transaction is recorded with the confirmed values and the scheduled item keeps its own.
- Q: Which clock decides what "today" is, for rejecting future dates and for starting the projection? → A: Calendar dates carry no time component, and "today" is the current date in a timezone set by an environment variable with a documented default.
- Q: May two accounts, categories or projects share a name? → A: No. Names are unique per entity type, compared case-insensitively, and archived or closed rows still hold their name.
- Q: Is the balance cache in scope for this version or explicitly deferred? → A: In scope. The cached balance layer ships with this feature, is updated or invalidated inside the same atomic write that changes the entries, and is covered by an automated reconciliation check.
- Q: May an account be opened with a negative opening balance, such as a card that already owes money? → A: Yes. The opening balance is signed and accepts negative values; the positive-amount rule applies to expenses, income and transfers, not to the opening transaction.
- Q: Can the user unarchive an account or category, and reopen a closed project? → A: Yes, all three are reversible. Archive and unarchive, close and reopen, are symmetric operations subject to the same validations.
- Q: Are transaction lists returned paginated or whole? → A: Paginated by limit and offset, 50 per page by default and 200 maximum, with the total match count in the response.
- Q: Is a transaction description required, and how long may it be? → A: Required. Between 1 and 120 characters after trimming surrounding whitespace; empty or whitespace-only is rejected.
- Q: How large is the demo dataset? → A: Two layers. A hand-checkable demo seed of 60 to 100 transactions over 3 months for the walkthrough and the end-to-end tests, plus an optional generator producing about 5 000 transactions over 24 months for performance measurement.
- Q: What happens to a scheduled occurrence whose due date has passed without being marked as paid? → A: It stays in the upcoming list flagged as overdue and the projection counts it at the start of the series; the next due date advances only when the user marks it as paid.
- Q: May an edit change a transaction's kind (expense ↔ income ↔ transfer)? → A: Yes. An edit submits a complete new intent, kind included, and it is validated exactly like a newly recorded transaction. Opening transactions stay opening.
- Q: How should the AI narrative behave when the configured LLM provider times out or errors? → A: The call carries a configurable timeout defaulting to 10 seconds; timeout, rate-limit and provider errors all return the structured error shape with a distinguishing code, the grouped report stays on screen unchanged, and nothing is retried.
- Q: What observability should this delivery include? → A: Structured JSON logs to stdout with a per-request correlation id echoed in the error shape, one line per request and every unhandled error, log level by environment variable. No metrics endpoint and no tracing backend.
- Q: What accessibility bar must the UI meet? → A: Every control labelled, every interactive element keyboard-operable with a visible focus indicator, validation errors tied to their field and announced, and text at WCAG AA contrast. No automated accessibility suite and no screen-reader test matrix.
- Q: How many overdue occurrences does a recurring scheduled item contribute to the projection? → A: One for every period missed since its next due date. A monthly item due 08-01 and never paid counts 08-01, 09-01 and 10-01 as overdue on 10-15; each confirmation advances it one period.
- Q: Is there an upper bound on amounts? → A: Yes, but only as a technical guard: at most 10^15 cents ($10,000,000,000,000.00) in absolute value per amount. Money travels as JSON strings of integer cents and is computed with `bigint`, so precision is exact at any magnitude; the bound exists because the database's `BIGINT` columns (amounts and cached balance snapshots) are finite, and rejecting at the edge with the structured error is the only way an oversized amount never becomes an unstructured database overflow.
- Q: Can a category that was never used be deleted? → A: No. Accounts and categories are archived, never deleted, whether or not anything references them.
- Q: How long may an account, category or project name be? → A: Between 1 and 60 characters after trimming surrounding whitespace.
- Q: Which environment variables does this feature introduce, and with what defaults? → A: `APP_TIMEZONE` (default `UTC`), `LOG_LEVEL` (default `info`), `LLM_API_KEY` (default empty, meaning not configured) and `LLM_TIMEOUT_MS` (default `10000`).
- Q: How are the SC-008 response times measured? → A: As the server-side 95th percentile of the API endpoints behind each screen, on the Docker Compose stack running on a developer laptop, with the FR-032 dataset.
- Q: May a transaction on an archived account be edited without unarchiving the account? → A: No. An edit passes exactly the validation of a new transaction, so the user unarchives the account first.
- Q: May a request reference a closed project? → A: No. A closed project is rejected like an archived account, on new transactions and on edits alike; the user reopens the project first.
- Q: Which categories does the seed ship? → A: Exactly twelve: Groceries, Dining, Rent, Utilities, Transport, Health, Entertainment, Shopping and Travel (expense); Salary, Freelance and Interest (income).
- Q: How many entries does each intent produce? → A: Exactly two, for all four intents.
- Q: What happens to the system account behind a category? → A: It is created with the category in one atomic write, never deleted, and untouched by renaming or archiving.
- Q: Which date ranges do lists and the similar-transaction report accept? → A: Start on or before end, spanning at most 24 months; anything else is rejected.

### Session 2026-09-20 (planning)

- Q: Should the CORS allowlist of browser origins be configuration or a constant? → A: Configuration. FR-035 is amended to add `CORS_ORIGINS`, a comma-separated origin allowlist defaulting to `http://localhost:5173,http://localhost:8080`.

### Session 2026-09-21 (plan review)

- Q: How can the FR-015 provider-failure codes (timeout, rate limit, provider error) be exercised by automated tests without calling the real provider? → A: The provider endpoint becomes configuration. FR-035 is amended to add `LLM_BASE_URL`, the provider's base URL, defaulting to `https://api.anthropic.com`; the API end-to-end suite points it at a local HTTP stub.

## User Scenarios & Testing _(mandatory)_

Stories are listed in delivery priority. Each one is independently demonstrable once the stories above it exist, and P1 alone is a usable product.

### User Story 1 - Accounts and transactions (Priority: P1)

As a user, I want to manage my personal accounts (several bank accounts, cash, cards) and record the transactions that move money in, out and between them, so that the application holds a complete and consistent record of my finances.

**Why this priority**: every other story reads from the data this one writes. Without accounts and a correct ledger there is nothing to balance, report or project.

**Independent Test**: create two accounts with opening balances, record an expense, an income and a transfer, edit one of them, delete another, and confirm at every step that each account's balance is the arithmetic the user would do by hand and that the sum of all ledger entries in the system is zero.

**Acceptance Scenarios**:

1. **Given** no accounts exist, **When** the user creates an account named "Checking" of kind _bank_ with an opening balance of $1,500.00 dated 2026-09-01, **Then** the account appears in the account list with a balance of $1,500.00 and the ledger contains one _opening_ transaction whose entries sum to zero.
2. **Given** the account "Checking" exists, **When** the user records an expense of $42.50 on 2026-09-10 in the category "Groceries" with the description "Market", **Then** the transaction is listed under "Checking" as an expense, the balance of "Checking" decreases by $42.50, and the transaction has exactly two entries that sum to zero.
3. **Given** the account "Checking" exists, **When** the user records an income of $3,000.00 on 2026-09-15 in the category "Salary", **Then** the balance of "Checking" increases by $3,000.00 and the transaction is listed as an income.
4. **Given** accounts "Checking" and "Savings" exist, **When** the user records a transfer of $500.00 from "Checking" to "Savings", **Then** "Checking" decreases by $500.00, "Savings" increases by $500.00, the transaction appears in both accounts' histories marked as a transfer, and no category is attached to it.
5. **Given** an expense of $42.50 exists, **When** the user edits it to $50.00 and changes its category to "Dining", **Then** the account balance reflects the new amount, the monthly report (Story 3) attributes $50.00 to "Dining" and nothing to "Groceries", and the ledger still sums to zero.
   5a. **Given** an expense of $50.00 from "Checking" exists, **When** the user edits it into a transfer of $50.00 from "Checking" to "Savings", **Then** its category is cleared, "Savings" increases by $50.00, the monthly report no longer counts it, and the ledger still sums to zero. **When** the user instead edits it into a transfer whose source and destination are the same account, **Then** the edit is rejected with a structured validation error and the transaction is left as it was.
6. **Given** an expense exists, **When** the user deletes it, **Then** it no longer appears in any list, balance or report, and the ledger still sums to zero.
7. **Given** the user submits an expense with an amount of $0.00, a negative amount, a missing account, a non-existent category, an income category on an expense, or a date in the future, **When** the request is processed, **Then** it is rejected with a structured validation error naming the offending field and nothing is written.
8. **Given** the user submits a transfer whose source and destination are the same account, **When** the request is processed, **Then** it is rejected with a structured validation error.
9. **Given** an account has transactions, **When** the user archives it, **Then** it disappears from the default account list and from dashboard totals, its history remains readable, and it can no longer be selected for new transactions. **When** the user later unarchives it, **Then** it returns to the list and to the totals with the same balance it had, and can be selected again.
10. **Given** the seeded category catalogue, **When** the user creates a new expense category "Pets", **Then** it is immediately available when recording an expense, and the monthly report can group by it.
11. **Given** no accounts exist, **When** the user creates an account "Visa" of kind _card_ with an opening balance of -$500.00, **Then** the account is created with a balance of -$500.00, the opening transaction's entries sum to zero, and the dashboard total reflects the debt.

---

### User Story 2 - Balances now and at any date (Priority: P2)

As a user, I want to see the balance of each account in real time and at any point in time I choose, so that I can answer "how much did I have on date X?" and "how much do I have now?" without doing arithmetic.

**Why this priority**: balances are the first thing a user looks at and the most visible proof that the ledger is correct. They are read-only over Story 1's data, so they ship immediately after it.

**Independent Test**: with a known set of dated transactions, request the balance of an account for several dates (before the first transaction, between transactions, on a transaction date, today) and compare each against the hand-computed value.

**Acceptance Scenarios**:

1. **Given** "Checking" has an opening balance of $1,500.00 on 2026-09-01, an expense of $42.50 on 2026-09-10 and an income of $3,000.00 on 2026-09-15, **When** the user views the account list, **Then** "Checking" shows a current balance of $4,457.50 and the total across non-archived accounts includes it.
2. **Given** the same account, **When** the user asks for the balance as of 2026-09-12, **Then** the answer is $1,457.50 (opening minus the expense; the income is not yet counted).
3. **Given** the same account, **When** the user asks for the balance as of 2026-09-10 (a date on which a transaction was recorded), **Then** the transaction of that day is included (balance = $1,457.50).
4. **Given** the same account, **When** the user asks for the balance as of 2026-08-15 (before any transaction), **Then** the answer is $0.00.
5. **Given** any account and date, **When** the balance is requested, **Then** the value equals the sum of that account's non-deleted entries dated on or before that date, whether or not any cached value exists.
6. **Given** a new transaction is recorded, edited or deleted, **When** the balance is requested immediately afterwards, **Then** it already reflects the change (no stale reads).
7. **Given** the user views the dashboard, **When** accounts are listed, **Then** each account's balance is shown next to it together with a total across all non-archived accounts.
8. **Given** the account list or dashboard is on screen, **When** the user records, edits or deletes a transaction, **Then** the balances and the total shown update to the new values without a full-page reload and without the user having to refresh or navigate.

---

### User Story 3 - Monthly expenses by category (Priority: P3)

As a user, I want a report showing my expenses classified by category for each month, so that I understand where my money goes.

**Why this priority**: the first analytical view over the ledger and the one the challenge names explicitly. It depends only on Stories 1 and 2.

**Independent Test**: record expenses across several categories and two different months, plus an income and a transfer, then request each month's report and verify per-category totals, the grand total, and that income and transfers are absent.

**Acceptance Scenarios**:

1. **Given** in September 2026 the user recorded expenses of $42.50 and $30.00 in "Groceries" and $120.00 in "Rent", plus an income of $3,000.00 and a transfer of $500.00, **When** the user requests the report for 2026-09, **Then** it lists "Groceries" = $72.50 and "Rent" = $120.00, a grand total of $192.50, and neither the income nor the transfer appear.
2. **Given** the same data, **When** the user requests the report for 2026-08, **Then** it returns an empty category list and a total of $0.00.
3. **Given** the report for 2026-09, **When** the user opens the "Groceries" row, **Then** they see the individual expenses that make up the $72.50.
4. **Given** the report is shown, **When** the user switches to another month, **Then** the report updates without a full-page reload and the selected month is reflected in the page state.
5. **Given** an expense in September is edited to October, **When** both months' reports are requested, **Then** September no longer includes it and October does.
6. **Given** categories exist with no expenses in the month, **When** the report is requested, **Then** those categories are omitted (only categories with activity are listed).

---

### User Story 4 - Future bills, future income and budget projection (Priority: P4)

As a user, I want to store bills and income that will happen in the future, and see a projection of my total balance over time, so that I know whether I can cover what is coming.

**Why this priority**: it introduces the only forward-looking data in the product. It builds on balances (Story 2) and on the same categories and accounts as Story 1.

**Independent Test**: with a known current total balance, create a one-off bill, a monthly bill and a weekly income; request projections for several horizons and verify the projected balance against hand-expanded occurrences; mark one bill as paid and verify a real transaction appears and the projection no longer counts that occurrence.

**Acceptance Scenarios**:

1. **Given** the user's accounts total $4,457.50, **When** the user creates a scheduled bill "Rent" of $1,200.00 due 2026-10-01 with monthly recurrence, a scheduled income "Salary" of $3,000.00 due 2026-10-05 with monthly recurrence, and a one-off bill "Flight" of $800.00 due 2026-10-12, **Then** all three appear in the upcoming list ordered by due date.
2. **Given** those scheduled items, **When** the user requests the projection up to 2026-10-31, **Then** the projected total balance is $4,457.50 − $1,200.00 + $3,000.00 − $800.00 = $5,457.50, and the response includes each occurrence with the running balance after it.
3. **Given** the same items, **When** the user requests the projection up to 2026-11-30, **Then** "Rent" and "Salary" are counted twice (October and November) and "Flight" once, giving $4,457.50 − $2,400.00 + $6,000.00 − $800.00 = $7,257.50.
4. **Given** a weekly scheduled item due 2026-10-01, **When** the projection horizon is 2026-10-31, **Then** the item is expanded into occurrences on 10-01, 10-08, 10-15, 10-22 and 10-29.
5. **Given** the projected running balance drops below zero at any occurrence, **When** the projection is shown, **Then** that occurrence is visibly flagged so the user can see when the shortfall happens.
6. **Given** the one-off bill "Flight" is due, **When** the user marks it as paid and confirms the pre-filled amount of $800.00 and due date unchanged, **Then** an expense transaction of $800.00 is recorded on that date in the bill's account and category, the account balance decreases accordingly, and "Flight" leaves the upcoming list and the projection.
7. **Given** the monthly bill "Rent" due 2026-10-01 is marked as paid, **When** the upcoming list is shown, **Then** an expense transaction for October exists and "Rent" now shows its next due date as 2026-11-01.
   7a. **Given** the monthly bill "Rent" of $1,200.00 is due 2026-10-01, **When** the user marks it as paid and changes the amount to $1,250.00 and the date to 2026-10-03 before confirming, **Then** the recorded expense is $1,250.00 on 2026-10-03, the October report counts $1,250.00, and "Rent" still shows $1,200.00 as its scheduled amount with its next due date on 2026-11-01.
8. **Given** a scheduled item with an end date, **When** the projection horizon extends past that end date, **Then** no occurrences after the end date are counted.
9. **Given** the user edits or deletes a scheduled item, **When** the projection is requested, **Then** it reflects the change and any transactions already materialised from that item are unaffected.
10. **Given** a scheduled item is submitted with an amount of $0.00, a due date in the past, a missing account, or a category whose type does not match the item's kind, **When** it is processed, **Then** it is rejected with a structured validation error.

---

### User Story 5 - Expenses per project (Priority: P5)

As a user, I want to tag expenses with a project (a house remodel, a trip to France) and see what each project has cost me, optionally against a budget, so that I can track spending on specific goals across accounts and categories.

**Why this priority**: a thin layer over Story 1's transactions with a clear product value; it does not affect the ledger itself.

**Independent Test**: create a project with a budget, tag expenses from two different accounts and categories with it, and verify the project's spent total, remaining budget and transaction list; verify an untagged expense is not counted.

**Acceptance Scenarios**:

1. **Given** no projects exist, **When** the user creates "Trip to France" with a budget of $5,000.00, **Then** it appears in the project list as active with $0.00 spent and $5,000.00 remaining.
2. **Given** the project exists, **When** the user records an expense of $800.00 ("Flights", from "Checking") and $300.00 ("Hotel deposit", from "Savings") tagged with the project, **Then** the project shows spent = $1,100.00, remaining = $3,900.00 and lists both expenses.
3. **Given** an expense is recorded without a project, **When** the project report is viewed, **Then** that expense is not counted.
4. **Given** a project's spent total exceeds its budget, **When** the project is viewed, **Then** it is visibly flagged as over budget and the overrun amount is shown.
5. **Given** an expense tagged with a project is edited to remove the project, **When** the project is viewed, **Then** its spent total no longer includes it.
6. **Given** a project has tagged transactions, **When** the user tries to delete it, **Then** the deletion is rejected with a structured error and the user is told to close the project instead; **When** the user closes it, **Then** it is no longer offered when recording new transactions but its report remains readable. **When** the user reopens it, **Then** it is offered again and its report is unchanged.
7. **Given** the user tries to tag a transfer or an income with a project, **When** the request is processed, **Then** it is rejected: only expenses can belong to a project.
8. **Given** a project without a budget, **When** it is viewed, **Then** spent is shown and the budget/remaining fields are absent rather than zero.

---

### User Story 6 - Similar-transaction report (Bonus, Priority: P6)

As a user, I want a button that generates a report grouping my similar transactions and highlighting the most expensive ones, so that recurring merchants and outliers stand out without manual sorting.

**Why this priority**: explicitly a bonus in the challenge. It is a read-only computation over existing data and can be dropped without affecting anything else.

**Independent Test**: seed transactions with repeated descriptions differing in case, whitespace and trailing numbers, generate the report for a date range and verify the groups, their totals and the top-N highlights.

**Acceptance Scenarios**:

1. **Given** expenses described "Uber 1234", "UBER 5678", "uber", "Netflix" and "Rent" exist within 2026-09, **When** the user presses _Generate report_ for that month, **Then** the three Uber expenses form one group with count 3 and their summed amount, "Netflix" and "Rent" are groups of one, and groups are ordered by total descending.
2. **Given** the report is generated, **When** it is displayed, **Then** it highlights the five most expensive individual transactions of the period and the most expensive group.
3. **Given** the period contains no transactions, **When** the report is generated, **Then** an empty report is returned without error.
4. **Given** the report is generated, **When** the same data is used again, **Then** the result is identical (the grouping is deterministic and needs no external service).

**AI-assisted narrative (optional extension of this story)**: when an LLM provider key is configured, a second button sends the same grouped data to the provider and shows a short natural-language summary. When no key is configured the button is disabled and the endpoint answers with a structured "AI not configured" error. Accuracy of the narrative is not an acceptance criterion; the integration path is. When the key is configured but the provider times out or fails, the endpoint answers with a structured error distinct from "not configured", the grouped report remains displayed, and the UI shows a dismissible failure notice.

---

### Edge Cases

- **Negative balances**: accounts may go negative (credit cards, overdrafts). The system never blocks a transaction for insufficient funds.
- **Future-dated transactions**: rejected. Anything in the future is a scheduled item; this keeps "current balance" equal to the sum of all entries and keeps the projection the single source of future money.
- **Opening balance of zero**: no opening transaction is recorded. The account simply starts empty.
- **Transaction dated before the account's opening date**: allowed; the balance as of a date before the opening simply reflects it. The opening balance is just another transaction.
- **Editing an opening balance**: allowed through the account's edit form; it edits the opening transaction like any other and rebalances the entries.
- **Category type mismatch**: an expense must use an expense category and an income an income category; transfers carry no category.
- **Reusing an archived name**: rejected. An archived account or category and a closed project keep their names, so the user renames or unarchives instead of creating a second one that reads the same.
- **Deleting an account or a category**: not offered. Both are archived (hidden from pickers), never removed, whether or not anything references them (FR-001, FR-003).
- **Archived account in a scheduled item**: the item stays visible and is flagged; a confirmation on the archived account is rejected, so the user picks another account in the confirmation or reassigns the item (FR-018).
- **Confirmed amount differs from the scheduled one**: the transaction carries the confirmed amount and the scheduled item keeps its own. The item is a template for what is expected, not a record of what happened, so a one-off difference never rewrites the recurrence.
- **Scheduled item due today**: counted in the projection until it is marked as paid.
- **Overdue scheduled item**: an occurrence whose due date has already passed and that was never marked as paid stays in the upcoming list, flagged as overdue, and is counted in the projection before any future occurrence. Nothing advances a scheduled item's due date except the user marking it as paid, so an ignored bill is never silently forgotten and a recurrence never rolls forward on its own.
- **Recurrence expansion bounds**: a projection horizon is capped at 24 months from today to bound the expansion.
- **Month boundaries**: monthly recurrence from the 31st falls on the last day of shorter months.
- **Dates have no time**: a transaction dated 2026-09-10 belongs to that day regardless of the hour it was entered. Two transactions on the same date have no defined order between them beyond insertion order.
- **Concurrent edits**: last write wins; no optimistic locking in this version.
- **Amount input precision**: the user may type `1234.5`, `1,234.50` or `$1,234.50`; all parse to the same cent value. More than two decimals is a validation error, not a rounding decision.
- **Negative amounts on screen**: a negative balance is shown as a formatted negative dollar figure (for example `-$120.00`), never as a bare number or a cent value.
- **Descriptions that normalise to the same text**: two descriptions that differ only in case, spacing or trailing digits are distinct stored values but one group in the FR-014 report. The stored text is never rewritten by the grouping.
- **Page beyond the end**: a page whose offset is past the last row returns an empty page with the correct total, not an error.
- **Empty states**: every list and report renders a meaningful empty state (no accounts yet, no expenses this month, nothing scheduled), reachable and readable under the same FR-034 rules as any other screen.
- **LLM provider unreachable**: the narrative request fails with a structured error after the configured timeout. The grouped report it summarises is computed locally and is never affected, so the bonus feature can only ever fail on its own.

## Requirements _(mandatory)_

### Functional Requirements

**Accounts and categories**

- **FR-001**: The system MUST let the user create, rename, archive and unarchive accounts, and edit an account's kind, opening balance and opening date at any time. An account has a name, a user-facing kind (_bank_, _cash_, _card_), an opening balance and an opening date. Editing the opening balance or date edits the opening transaction through the ledger (FR-007): changing a zero opening balance to a non-zero one records the opening transaction, and changing a non-zero one to zero deletes it.
- **FR-002**: Creating an account with a non-zero opening balance MUST record an _opening_ transaction; the balance is never stored as a bare number the ledger cannot explain. The opening balance is signed: it MAY be negative, so a card or an overdrawn account can be opened with the debt it already carries. Its entries still sum to zero, against the equity system account.
- **FR-003**: The system MUST ship with a seeded catalogue of 12 categories, each typed _expense_ or _income_, and MUST let the user create, rename, archive and unarchive categories. The catalogue is exactly: _Groceries_, _Dining_, _Rent_, _Utilities_, _Transport_, _Health_, _Entertainment_, _Shopping_ and _Travel_ (expense), and _Salary_, _Freelance_ and _Interest_ (income).
- **FR-004**: Archived accounts and categories MUST be excluded from pickers and dashboard totals but MUST remain readable in history and reports. Unarchiving MUST restore the entity to pickers and totals with its history intact, and MUST NOT alter any existing transaction.

**Transactions and ledger**

- **FR-005**: The system MUST let the user record, edit and delete transactions of kind _expense_, _income_ and _transfer_. Each has a date, an amount, a description, and the accounts/category that kind requires. The description is mandatory: after trimming surrounding whitespace it MUST be between 1 and 120 characters, and an empty or whitespace-only description MUST be rejected with a structured validation error. Scheduled items carry a description under the same rule.
- **FR-006**: Every transaction MUST be persisted as entries that sum to zero, produced by the single translation point, and validated both in the domain and by the database, in one atomic write.
- **FR-007**: Editing a transaction MUST regenerate all of its entries from the new intent in one atomic write; deleting MUST be a soft delete that removes the transaction from every balance, list and report. The edit MUST accept a complete new intent, its kind included: an expense MAY become an income or a transfer and back. The submitted intent MUST satisfy exactly the same validation as a newly recorded one, so a kind change drops the fields the new kind forbids (a transfer carries no category and no project) and requires the fields it needs (a transfer's second account). The _opening_ kind is not interchangeable with the other three: an opening transaction stays an opening transaction and is edited only through the account's edit form.
- **FR-008**: For expenses, income and transfers, the system MUST reject amounts that are not positive integers (cents), and descriptions that violate FR-005; the opening transaction takes a signed amount instead, which MUST still be non-zero. The system MUST also reject dates later than today as FR-029 defines it, transfers between the same account, references to archived or non-existent accounts/categories, and category types that do not match the transaction kind.
- **FR-009**: The system MUST list transactions per account and globally, filterable by date range, kind, category and project, ordered by date descending. Every transaction list MUST be paginated by limit and offset, defaulting to 50 rows and rejecting a limit above 200 with a structured validation error. Each response MUST carry the total number of matching transactions so the UI can show the position in the result set without a second request. The ordering MUST be deterministic across pages, breaking ties on equal dates by a stable secondary key. A date range, here and in FR-014, MUST start on or before its end and span at most 24 months; any other range MUST be rejected with the FR-023 structured error. A page whose offset is past the last row MUST return an empty page with the correct total, not an error.

**Balances**

- **FR-010**: The system MUST report each account's current balance and the total across non-archived accounts.
- **FR-011**: The system MUST report any account's balance as of any date, defined as the sum of its non-deleted entries dated on or before that date.
- **FR-012**: The system MUST maintain a cached balance layer serving current balances and balance-as-of-date reads. Every cached value MUST be updated or invalidated inside the same atomic database transaction as the write that changes the underlying entries, so a read can never return a value that disagrees with them. The cache is an optimisation and never a source of truth: it MUST be rebuildable from entries alone at any time.

**Reports**

- **FR-013**: The system MUST produce, for a given calendar month, the total spent per expense category, the month's grand total, and the transactions behind each category. Income and transfers MUST NOT appear.
- **FR-014**: The system MUST produce, for a given date range (bounded as in FR-009), a grouping of similar transactions by normalised description (case-insensitive, whitespace-collapsed, trailing digits ignored) with count and total per group, plus the five most expensive transactions and the most expensive group. A description that normalises to an empty string, such as one made only of digits, is grouped by its trimmed original text instead.
- **FR-015** _(optional)_: When an LLM provider key is configured, the system MUST be able to send the grouped report to the provider and return a short narrative; when not configured it MUST answer with a structured "not configured" error and the UI MUST disable the action. The provider call MUST be bounded by a timeout, configurable by environment variable and defaulting to 10 seconds, and MUST NOT be retried. A timeout, a rate-limit response or any provider error MUST be answered with the FR-023 structured error shape carrying a code that distinguishes the failure from "not configured", and MUST leave the deterministic FR-014 report on screen unchanged. No provider failure may affect any other endpoint.

**Scheduled items and projection**

- **FR-016**: The system MUST let the user create, edit and delete scheduled items (future bills and future income) with a description, an amount, an account, a category, a next due date, a recurrence (_once_, _weekly_, _monthly_) and an optional end date. The description follows the rule of FR-005. A monthly recurrence anchored on the 29th, 30th or 31st falls on the last day of any shorter month. The system MUST reject, with the FR-023 structured error naming the offending field and without writing anything: an amount that is not a positive integer (cents); a next due date earlier than today as FR-029 defines it when the item is created (an edit MAY set it in the past, which makes the item overdue); a missing, non-existent or archived account; a missing, non-existent or archived category, or one whose type does not match the item's kind (a bill takes an expense category, an income an income category); and an end date earlier than the next due date.
- **FR-017**: The system MUST produce a projection of the total balance up to a chosen horizon date (at most 24 months ahead): the current total of FR-010 plus every scheduled occurrence between today and the horizon, returned as a running series with the final projected balance. Occurrences whose due date has already passed without being marked as paid MUST be included, placed at the start of the series and marked as overdue, so the projection reflects money still owed. A recurring item contributes one overdue occurrence for every period missed since its next due date. The system MUST NOT advance a scheduled item's due date on its own: only marking an occurrence as paid moves the item forward.
- **FR-018**: The system MUST let the user mark a scheduled occurrence as paid/received. Marking MUST open a confirmation pre-filled with the occurrence's amount and due date, both of which the user MAY change; the account, category and description are pre-filled from the item and MAY also be changed. Confirming records a real transaction through the ledger with the confirmed values, and advances the scheduled item to its next due date, or completes it: a _once_ item, or one whose next due date would fall after its end date, becomes _completed_ and leaves the upcoming list and the projection. The scheduled item's own amount and recurrence MUST NOT be altered by the confirmation, and the confirmed values MUST pass the same validation as any other transaction, so a confirmation on an archived account is rejected. An item whose account is archived stays in the upcoming list and the projection, flagged, until the user picks another account in the confirmation or reassigns the item. The transaction a confirmation records is an ordinary transaction with no lasting link to the item: editing or deleting it follows FR-007 and never changes the scheduled item. To undo a confirmation made by mistake, the user deletes the transaction and sets the item's next due date back through FR-016.

**Projects**

- **FR-019**: The system MUST let the user create, edit, close, reopen and (when unused) delete projects with a name, an optional budget and a status. Closing and reopening are reversible at any time.
- **FR-020**: An expense MAY reference at most one project. Income and transfers MUST NOT reference a project; a request that attaches a project to either, or references a non-existent or closed project, MUST be rejected with the FR-023 structured error and write nothing.
- **FR-021**: The system MUST report, per project, the total spent, the remaining budget when a budget exists, an over-budget flag, and the list of its expenses.

**Cross-cutting**

- **FR-022**: All monetary amounts MUST be integers in cents everywhere the system handles them internally (database, domain, API payloads). In API payloads money MUST travel as a JSON string of integer cents (e.g. `"4250"`), never as a JSON number, and arithmetic on cents MUST use `bigint`/`BigInt`, never floating-point `number`. The application operates in a single currency (USD). Every amount the user enters — transaction, opening balance, scheduled amount and project budget — MUST have an absolute value of at most 10^15 cents ($10,000,000,000,000.00); a larger one MUST be rejected with the FR-023 structured error. This bound is a technical guard, not a product cap. The string carrier and `bigint` arithmetic make every sum exact at any magnitude, so precision imposes no limit; what remains finite is the database: money columns and cached balance snapshots are `BIGINT` (max ~9.2 × 10^18 cents), and without an edge bound an oversized amount — or an aggregate of huge valid ones — would surface as an unstructured `bigint out of range` database error (a 500), violating FR-023 and Principle V. The guard keeps any realistic aggregate at least three orders of magnitude inside `BIGINT` (roughly nine thousand maximum-sized amounts before approaching the range), so every rejection happens at the boundary, with the structured error shape.
- **FR-023**: All API input MUST be validated at the boundary, and every error MUST use one structured shape: a machine-readable code, a human-readable message and optional field-level details. That shape MUST also carry the correlation id of FR-033, so a message shown to the user can be matched to the log line that explains it.
- **FR-024**: The public API and UI MUST express intent (expense, income, transfer) and MUST NOT expose entries, debits, credits or system accounts.
- **FR-025**: The application MUST run locally with a single command (containerised database + API + web) and MUST load a demo dataset that exercises every story. That demo seed MUST be small enough to verify by hand: 60 to 100 transactions spread over about 3 months, across several accounts, the seeded categories, at least one archived entity, scheduled items of each recurrence, and at least one project with a budget. The seed MUST be deterministic, so the same command always produces the same data and the acceptance scenarios stay reproducible.
- **FR-032**: The system MUST ship a separate, optional data generator that loads roughly 5 000 transactions spread over 24 months, used only to measure the performance targets of SC-008. It MUST be invoked explicitly and MUST NOT run as part of the normal startup of FR-025.
- **FR-026**: The user interface MUST present every monetary amount as a formatted dollar figure (thousands separators, exactly two decimals, an explicit minus sign on every negative balance, with colour only as an additional cue on top of the sign) and MUST accept amount input in dollars. Converting between the dollars the user sees and the cents the API carries MUST happen in exactly one place in the frontend, at the API boundary. No screen, chart, report or error message may show a raw cent value.
- **FR-027**: Dollar input MUST be parsed to cents without floating-point rounding, and `1234.5`, `1,234.50` and `$1,234.50` MUST all parse to the same cent value; and an amount with more than two decimal places MUST be rejected with a structured validation error rather than silently rounded.
- **FR-028**: Balances MUST be correct on every read without any background process: the system MUST NOT depend on a push channel or on polling to keep them accurate. The UI MUST refetch every balance it is displaying after each successful transaction or account mutation, updating the screen without a full-page reload and without user action. If that refetch fails, the mutation stands and the UI says so with a way to retry; it MUST NOT present the pre-mutation balances as current. This read-after-write freshness is the complete definition of "real-time balances" for this feature.
- **FR-029**: Every date the user works with (transaction date, opening date, due date, end date, report month, projection horizon) MUST be a calendar date with no time component, stored and compared as a date. "Today" MUST be the current date in a single timezone configured by an environment variable, with the default of FR-035. Rejecting future dates, expanding recurrences, starting the projection and assigning a transaction to a report month MUST all use that same definition of today.
- **FR-030**: Account names, category names and project names MUST each be unique within their own entity type, compared without regard to case or surrounding whitespace, counting archived and closed rows. Each name MUST be between 1 and 60 characters after trimming surrounding whitespace. Uniqueness MUST be enforced by a database constraint, and a duplicate MUST be rejected with the structured error shape naming the offending field.
- **FR-031**: The system MUST provide an automated reconciliation check that recomputes every cached balance from the entries and fails when any cached value differs. It MUST run in CI alongside the global sum-to-zero check, and MUST be runnable on demand against a live database. A failing check MUST name each account and cached value that differs. The system MUST also provide an on-demand rebuild that recomputes the whole cache from entries alone in one atomic write; it is the required remedy for any discrepancy the check reports, and the check itself never repairs.
- **FR-033**: The API MUST emit structured JSON logs to stdout. Every request MUST produce one line carrying a correlation id, the method, the route, the response status and the duration in milliseconds; every unhandled error MUST be logged with its correlation id and stack trace. The correlation id MUST be generated per request, returned in the FR-023 error shape and in a response header, so a failure a reviewer sees on screen can be found in the logs. The log level MUST be set by an environment variable with a documented default. No monetary amount, no description and no other transaction content may appear in a log line. A metrics endpoint and a tracing backend are out of scope.
- **FR-034**: The user interface MUST be operable without a mouse and legible without effort. Every form control MUST have an associated visible label; every interactive element MUST be reachable and operable by keyboard with a visible focus indicator; a validation error MUST be programmatically associated with the field it concerns and announced to assistive technology when it appears; and all text MUST meet WCAG AA contrast against its background, including the negative-amount styling of FR-026, which MUST NOT rely on colour alone to signal a negative value. Every list and report MUST render an empty state as `design/design-system.md` defines it. An automated accessibility suite and a screen-reader test matrix are out of scope.
- **FR-035**: The configuration this feature introduces MUST be read from these environment variables, each listed in `.env.example` with its default: `APP_TIMEZONE`, the timezone that defines today for FR-029 (default `UTC`); `LOG_LEVEL`, for FR-033 (default `info`); `LLM_API_KEY`, the provider key of FR-015 (default empty, meaning not configured); `LLM_TIMEOUT_MS`, the provider timeout of FR-015 (default `10000`); `LLM_BASE_URL`, the base URL of the FR-015 provider (default `https://api.anthropic.com`; automated tests point it at a local stub) _(amended 2026-09-21 during plan review)_; and `CORS_ORIGINS`, the comma-separated allowlist of browser origins the API accepts cross-origin requests from (default `http://localhost:5173,http://localhost:8080`) _(amended 2026-09-20 during planning)_.

### Key Entities

- **Account**: a place the user holds money. Attributes: name (unique among accounts), kind (_bank_, _cash_, _card_), opening date, archived flag. Its balance is derived from entries, never entered directly. Internally the ledger also holds _system accounts_ (one per category, plus one equity account for opening balances); these are never shown to the user.
- **Category**: a label for classifying expenses or income. Attributes: name (unique among categories), type (_expense_ | _income_), archived flag. Each category is backed by exactly one system account, created in the same atomic write as the category, never deleted, and unaffected by renaming, archiving or unarchiving the category.
- **Transaction**: what the user did. Attributes: date, description (required, 1–120 characters), kind (_expense_ | _income_ | _transfer_ | _opening_), optional project, soft-delete marker. Owns exactly two entries: every intent of this feature (expense, income, transfer, opening) produces two. The constitution's "two or more" is the invariant, not a count this feature uses.
- **Entry**: one side of a transaction: the account it touches and a signed amount (positive into the account, negative out). Its date is the date of its transaction. All entries of a transaction sum to zero. Entries are the single source of truth for every balance and report.
- **Scheduled item**: a future bill or income not yet in the ledger. Attributes: description, kind (_bill_ | _income_), amount, account, category, next due date, recurrence (_once_ | _weekly_ | _monthly_), optional end date, status (_active_ | _completed_, see FR-018).
- **Project**: a user-defined goal that groups expenses. Attributes: name (unique among projects), optional budget, status (_active_ | _closed_).
- **Balance snapshot** _(derived, internal)_: a cached balance of one account at a point in time, rebuilt from entries on demand. Part of this delivery. Exists only to speed up balance reads; it is never a source of truth and is reconciled by FR-031.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every one of the six user stories can be demonstrated end-to-end in the UI, on the demo seed of FR-025, within the 15–20 minute walkthrough, with every figure shown verifiable by hand.
- **SC-002**: At any moment, the sum of all ledger entries in the database is exactly zero; an automated check enforces this on every change.
- **SC-003**: For any account and date, the reported balance equals the independently computed sum of that account's entries up to that date, with and without cached values present.
- **SC-004**: The monthly report's per-category totals add up to its grand total, and that total equals the sum of the month's expense transactions.
- **SC-005**: The projection for a horizon equals the hand-expanded arithmetic of current balance plus scheduled occurrences in the demo seed of FR-025, including weekly, monthly, end-dated and month-end cases.
- **SC-006**: Every invalid request enumerated in FR-008, FR-016 and FR-020 is rejected with the structured error shape and leaves the database unchanged.
- **SC-007**: A reviewer can install and run the whole application from the README with one command and reach a working UI with demo data in under five minutes, not counting the first download of container images.
- **SC-008**: On the generated dataset of FR-032 (about 5 000 transactions over 24 months), the API endpoints behind the balance and list screens answer within one second and those behind the monthly report and the projection within two seconds, measured as the server-side 95th percentile on the Docker Compose stack of FR-025 running on a developer laptop. List timings are measured on a single default page of 50 rows.
- **SC-009**: No user-visible surface displays a raw cent value: every amount rendered in the UI on the demo seed of FR-025 is a formatted dollar figure with two decimals.
- **SC-010**: The reconciliation check of FR-031 passes on the demo seed of FR-025 and after every mutation exercised by the end-to-end tests; deliberately corrupting one cached value makes it fail.
- **SC-011**: Every failing request a reviewer triggers in the UI shows a correlation id that appears verbatim in exactly one stdout log line, and that line names the route and the status; no log line emitted on the demo seed of FR-025 contains a monetary amount or a transaction description.
- **SC-012**: The whole SC-001 walkthrough, all six stories included, can be completed using only the keyboard, with the focused element visible at every step, and every field that rejects input names its error next to that field.

## Assumptions

The following assumptions were taken on 2026-09-19 while writing this specification:

- **Single user, no authentication**: the challenge excludes auth; the application models one user's finances. Multi-tenancy is a documented scaling concern, not a feature.
- **Single currency (USD), integer cents internally**: every amount is an integer number of cents in the database, the domain and the API, carried in API payloads as a JSON string of integer cents. The user always reads and writes dollars; the frontend converts at the API boundary and computes on cents with `BigInt`.
- **Double-entry ledger underneath a simple product surface**: transactions are stored as balanced entries with a hard sum-to-zero invariant. Users see expenses, income and transfers, never debits and credits.
- **Balances are computed from entries**: never entered or stored as independent facts. The cached balance layer (current-balance column, month-end snapshots, or both as the plan fixes) ships with this feature and must reconcile to the entries at all times.
- **Edits and deletes are allowed**: an edit regenerates the transaction's entries; a delete is a soft delete. There is no immutable audit log in this version.
- **Transfers are not expenses**: moving money between the user's own accounts never appears in the expense report or in project spend.
- **Future money is a separate concept**: bills and future income live as scheduled items, not as future-dated transactions. Recording a transaction dated in the future is rejected.
- **Dates, not timestamps**: the product reasons in calendar dates in one configurable timezone. No amount of clock precision is needed to answer any question this feature asks.
- **One project per expense**: an expense belongs to at most one project; income and transfers belong to none.
- **Stack**: NestJS + PostgreSQL (via Prisma) on the backend, React + Vite on the frontend, Docker Compose for local deployment. Both are the challenge's stated preferences.
- **Delivery order**: accounts and ledger → balances → monthly report → scheduled items and projection → projects → bonus grouping report (and, only if time remains, the AI narrative). The balance cache is delivered with the balances story, not deferred. Code is delivered on Friday 2026-09-25.
- **Archive, don't delete**: accounts and categories are archived rather than deleted, and archiving is reversible; projects can be closed and reopened, and deleted only while unused.
- **Projection horizon**: capped at 24 months.
- **Month-end recurrence**: a monthly recurrence anchored on the 29th–31st clamps to the last day of shorter months.

## Out of Scope

Explicitly excluded from this feature, even if the phrase "personal finance manager" might suggest them:

- Authentication, authorisation, multiple users or households.
- Multiple currencies, exchange rates, or currency conversion.
- Importing bank statements (CSV/OFX) or connecting to banks (Open Banking, Plaid and similar).
- Split transactions (one expense across several categories or projects).
- Per-category budget limits and alerts (the "budget" in this feature is the projection of total balance; a project budget is the only spending ceiling modelled).
- Automatic materialisation of scheduled items on their due date (a background job). Items are marked as paid by the user.
- Attachments and receipts, tags beyond category and project, notes with rich text.
- Reconciliation against bank statements.
- Investment, loan or interest modelling; credit-card statements and due dates beyond what a plain account with a negative balance provides.
- Notifications (email, push) and reminders.
- Audit trail / full history of edits, undo.
- Native mobile applications; the web UI is expected to be usable on a laptop screen and reasonable on a phone, nothing more.
- Internationalisation of the UI (English only).
- Automated accessibility testing and screen-reader conformance testing. FR-034 defines the accessibility floor for this delivery.
- Server-push transports (WebSocket, Server-Sent Events) and background polling for balance updates. FR-028 defines what "real time" means here.
- Data export.
- Metrics endpoints, tracing backends and log aggregation. FR-033 defines the observability floor for this delivery; anything beyond it is a documented scaling concern.
