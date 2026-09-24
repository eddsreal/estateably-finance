# Research: UI redesign — Screens v2 and Design System v2

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-23

The Technical Context has no open NEEDS CLARIFICATION: the stack, pins and conventions are those
of feature 001 ([001 research](../001-personal-finance-manager/research.md)). The decisions below
are the ones this feature adds.

## R-001 Transaction search (FR-016): an optional `q` on `GET /transactions`

- **Decision**: add one optional query parameter, `q` (trimmed, 1–60 characters), to the
  existing `listTransactions`. It matches `description` case-insensitively as a substring.
  `%`, `_` and `\` in `q` match themselves: the repository escapes them before building the
  `ILIKE` pattern. The palette calls `GET /transactions?q=…&limit=8`, so "newest first", "capped"
  and "every non-deleted transaction" come from the existing order, `limit` and `deletedAt`
  filter. `q` combines with the other filters by AND.
- **Rationale**: the endpoint is already read-only and paginated, and already returns the fields
  a result row shows (date, account, category, amount). Without `q` the response is byte-for-byte
  what it is today, so FR-020 holds. The one visible change: the global `ValidationPipe` runs with
  `forbidNonWhitelisted`, so a request carrying `q` returns 400 today and will be accepted. No
  feature 001 client sends `q`, so no existing behaviour a client relies on changes. The change is one DTO field, one `where` clause and one
  contract parameter.
- **Alternatives considered**: a new `GET /transactions/search` would duplicate the DTO, the
  response mapping and the pagination for no difference in behaviour. Filtering on the client
  cannot see rows that are not loaded, which FR-016 rules out. A trigram index is not needed:
  a sequential `ILIKE` over 5 000 rows is well under the SC-008 budget of feature 001.

## R-002 Daily balance series (FR-006, FR-007, SC-005, SC-006): served by the API

- **Decision**: add `GET /accounts/balance-history` (accounts tag, `getBalanceHistory`), which
  returns one balance per day for each account and for the active total. Contract:
  [contracts/openapi-delta.yaml](contracts/openapi-delta.yaml). Computation:
  - `AccountsService.balanceHistory` picks the accounts (active, plus archived when
    `includeArchived=true`) and calls `LedgerService.balanceSeries(accountId, from, to)` for each.
    When `from` is absent it first calls a new public method,
    `LedgerService.earliestEntryDate(accountIds)`, with the **active** accounts only, so turning
    the archived toggle on never changes the range. `accounts` never reads a ledger repository.
  - `LedgerService.balanceSeries` reuses `EntriesRepository.listForAccount`, the same read that
    `balanceAsOf` uses, and a new pure function `ledger/domain/balance-series.ts`. That function
    takes `balanceAt(entries, from)` as its starting value and adds each later day's entries in
    `bigint`.
  - The total is the element-wise `bigint` sum over the **active** accounts only (FR-006). The
    sum is done in `AccountsService.balanceHistory`, and `accounts.service.spec.ts` tests it
    with a stubbed `LedgerService`.
- **Rationale**: every value is the sum of the account's non-deleted entries up to that date,
  the same definition as `balanceAt` (feature 001 FR-011). The unit test asserts
  `series[i] === balanceAt(entries, from + i)` for every i, which is SC-005 at the domain level.
  The read is one query per account and O(days + entries), well inside SC-006 for 5 000
  transactions. It adds no entry path and no stored data (Principles I and III).
- **Shape**: the dates are implied: element `i` is the balance at the end of `from + i days`.
  This keeps the "All" range over several years small. `from` and `to` are echoed in the
  response. When `to` is absent the server uses today in `APP_TIMEZONE`, so the dashboard never
  depends on the browser's clock. When `from` is absent ("All"), the server uses the earliest
  entry date of the active accounts, clamped to 10 years before `to`. `to` after today, `from`
  after `to`, or an explicit span over 10 years is rejected with `VALIDATION_FAILED`.
- **Where each rule is checked (Principle V)**: `BalanceHistoryQueryDto` checks everything that
  depends only on the input: the date format (`IsDateOnly`), `includeArchived` (the existing
  `@ToBoolean()` of `IncludeArchivedQueryDto`, so it parses exactly as on `listAccounts`), `to`
  not after today, `from ≤ to` and the 10-year span. The cross-field checks throw the existing
  `ValidationFailedError` from the DTO, the pattern `transaction-request.dto.ts` already uses.
  The service only applies the defaults and the clamp, which never fail.
- **Client join**: the response carries ids, not names or kinds. The dashboard always calls
  `getBalanceHistory` and `listAccounts` with `includeArchived=true` and joins `accounts[]` with
  `listAccounts` by `accountId`. The archived toggle is client-side only: off, it hides the
  archived cards and the dashed note counts them and sums their series at `to`; on, it shows them
  as cards marked archived. `total` is active-only on the server either way, so the toggle never
  refetches and never changes the headline or the chart.
- **Size**: "All" over 10 years is about 3 650 cent strings per account plus the total. That is
  a few tens of kilobytes for a personal set of accounts, measured by `perf:measure` and the
  SC-006 Playwright test (R-012). No server-side downsampling.
- **Alternatives considered**: build the series in the browser from `getAccountBalanceAsOf`,
  which would take 365 requests per account for 1Y. Rebuild it from the transaction list, which
  would need signed per-account amounts, that is entries in the UI, and breaks Principle III.
  Store month-end snapshots, a cache with no measured need (feature 001 R-007).

## R-003 Where the contract change lives (Principle IV)

- **Decision**: the frozen delta is [contracts/openapi-delta.yaml](contracts/openapi-delta.yaml).
  The first Foundational task copies it verbatim into the single canonical
  `specs/001-personal-finance-manager/contracts/openapi.yaml`, bumps `info.version` to `1.1.0`,
  and runs `contract:generate`. After that task the delta file is historical only. The Prisma
  schema does not change.
- **Rationale**: feature 001 fixed a single copy of the yaml that codegen, `/docs` and ajv all
  read. Editing it before implementation would break `contract:check` (routes compared with the
  yaml) on main until the endpoint exists. The delta keeps the change reviewable at the
  `review-plan` gate without breaking CI in the meantime.
- **Alternatives considered**: a second full yaml under `specs/002…` would give two sources of
  truth. Editing the canonical file now would leave CI red between plan and implementation.

## R-004 AI availability on first render (spec US4 scenario 4, FR-020 as amended)

- **Decision**: `GET /ai/status` returns `{ configured: boolean }`. It is true when
  `LLM_API_KEY` is non-empty, the same check `AiService` already makes before it calls the
  provider. It uses no new environment variable and never calls the provider. It is an
  `AiService.isConfigured()` method with a new handler in `ai.controller.ts`, and it lives in
  the `ai` module, so the module graph is unchanged. The similar-transactions screen reads it
  on load. With `configured: false`, "Summarize with AI" renders disabled from the start, with
  its reason next to it (FR-014). The feature 001 fallback stays: a `422 AI_NOT_CONFIGURED` from
  the narrative call still disables the button.
- **Rationale**: the user amended FR-020 on 2026-09-23 so that US4 scenario 4 holds as written.
  This retires the feature 001 Complexity Tracking entry "Narrative button learns 'not
  configured' from the first answer", whose stated ceiling was exactly this amendment.
- **Alternatives considered**: keeping the feature 001 behaviour was rejected by the user.
  Calling the narrative endpoint on load would spend a provider call whenever a key is set. A
  build-time web flag would duplicate the server's configuration.

## R-005 Tokens (FR-001, FR-003, SC-004)

- **Decision**: rewrite `design/tokens.css` from Screens v2, using its values wherever it and
  Design System v2 differ. The file becomes Tailwind's `@theme static` block (R-013), so every
  token is a CSS variable and generates the matching utility:
  - **Reset first**: `--*: initial` removes Tailwind's default theme. Only design tokens exist
    as utilities, and bare numeric values such as `p-4` resolve to nothing, because the
    `--spacing` multiplier is not defined.
  - **By role**:
    - colours `--color-{accent, accent-hover, accent-soft, ink-*, sand-*, text-1…3, negative,
warning, transfer, cat-1…7}`, giving `bg-accent`, `text-text-2`, `border-sand-3`;
    - radii `--radius-{xs…2xl, pill}`, 5 to 28 px, giving `rounded-card`-style names by role;
    - shadows `--shadow-{card, popover, tooltip, toast, overlay, accent}`;
    - `--ease-out: cubic-bezier(.2,.8,.2,1)`;
    - fonts `--font-{ui, mono}`.
  - **As numeric scales**, named by their pixel value, because Screens v2 uses many one-off
    sizes and SC-001 forbids snapping them to a coarser scale:
    - font size `--text-{10…64}`, giving `text-13`;
    - spacing and control heights `--spacing-{2…56}`, giving `p-14`, `gap-6`, `h-40`.
  - **Motion stays in a plain `:root` block** in the same file, because Tailwind v4 has no
    duration namespace: `--dur-press 100ms`, `--dur-hover 150ms`, `--dur-dialog 200ms`,
    `--dur-enter 320ms`, `--stagger 40ms`, `--dur-morph 400ms`, `--dur-count 700ms`,
    `--dur-flash 2400ms` and `--dur-undo 5000ms`. Components use them as
    `duration-(--dur-hover)`, and JS reads them with `getComputedStyle`. Under
    `prefers-reduced-motion` every `--dur-*` except `--dur-undo` and `--dur-flash`, plus
    `--stagger`, is set to `0ms`. The row highlight then shows for its full 2.4 s without a fade.
- The feature 001 token names are removed in the same change as the CSS that uses them, so no
  alias layer is left behind.
- `#8a93a1` and `#1f8a5e` survive only as `--color-decor-*` tokens, which the contrast check
  refuses to pair with any text token (FR-002).
- **Check**: `apps/web/scripts/check-tokens.mjs`, run in CI next to `format:check`. It fails on
  any of these in `.css` and `.tsx` under `apps/web/src`:
  - a hex, `rgb(`, `hsl(`, an `ms` literal, or a `px` literal other than `0` and `1px`.
    The `1px` hairline is a deliberate exception to SC-004: a border one device pixel wide is a
    rendering primitive, not a scale value;
  - any Tailwind arbitrary value: a utility containing `-[` or starting with `[`. The only
    escape into a value is `-(--token)`, and it has to name a variable defined in
    `tokens.css`;
  - a bare numeric `duration-*` or `delay-*`.

  SVG geometry is not a CSS size: a `viewBox` and the coordinates inside it are user units that
  scale with the element, so they are not tokens. Stroke widths, font sizes and colours on SVG
  elements are CSS and do use tokens.

  The same script computes the WCAG contrast of every text-on-surface pair listed in
  `design/design-system.md` and fails below 4.5:1, or 3:1 for tokens marked large (SC-003).
  That list is the source of truth for SC-003. The user's SC-001 review confirms that no screen
  uses a pair missing from it (spec clarification, plan review).

- **Alternatives considered**: a Stylelint plugin is a new dependency for a 40-line check.
  Snapping to Tailwind's default 4-px scale would break SC-001.

## R-006 Fonts (Assumption: served with the app)

- **Decision**: vendor the upstream Geist and Geist Mono **variable** `woff2` files (vercel/geist,
  SIL OFL 1.1) and their `OFL.txt` into `apps/web/src/app/fonts/`. They are declared with
  `@font-face` (`font-display: swap`) in `app.css`, outside `@theme`. The stacks are
  `'Geist', system-ui, sans-serif` and `'Geist Mono', ui-monospace, monospace`, so a failed load
  falls back without breaking the layout (edge case). Figures use
  `font-variant-numeric: tabular-nums`.
- **Rationale**: two files, no network, no dependency. Vite fingerprints them.
- **Alternatives considered**: the `geist` npm package adds a runtime dependency to ship two
  files. The subsets embedded in the design bundles are split by unicode range and keyed by
  UUIDs, which makes them fragile to extract.

## R-007 Charts, donut and sparklines (FR-006, FR-007, FR-009, FR-015)

- **Decision**: hand-drawn inline SVG in `shared/ui/` (`LineChart`, `Sparkline`, `Donut`), with
  no chart library, as the spec assumes.
  - **Geometry**: the only place a cent value becomes a `number` is
    `money.ts#toPlotNumber(cents)`, which scales it to pixels. The result is never displayed,
    added or compared (see Complexity Tracking). Every label, tooltip and headline reads the
    exact `bigint` string from the series.
  - **Sampling**: the path is drawn from at most 180 points (min/max-preserving downsample).
    Hovering or pressing an arrow key picks the exact day index in the full series (edge case
    "All").
  - **Ranges**: a range of N days ends on the "Balance as of" date and starts N − 1 days before
    it (30D is `to − 29` through `to`). 1Y is 365 days. The headline's change for day `i` is
    `total[i] − total[0]` in `bigint`.
  - **Morph (400 ms)**: both series are resampled to the same 180 points and their y values are
    interpolated with `requestAnimationFrame` and the `--ease-out` curve. CSS `d:` transitions
    are not supported in Safari.
  - **Count-up (700 ms)**: interpolated in `bigint`: `start + (end − start) × k / 60n` for
    k = 0…60. No float touches a displayed amount.
  - **Donut**: `stroke-dasharray` arcs. Shares are in tenths of a percent and add up to exactly
    1000: each is `total × 1000n / grandTotal` rounded down, then the remaining tenths go one
    each to the categories with the largest remainders (ties by category order). Shown with one
    decimal place. All in `bigint`. The donut is not drawn when `grandTotal` is zero: the empty
    state shows instead.
  - **Keyboard and ARIA**: the chart is a `role="slider"` over the day index (`aria-valuemin` 0,
    `aria-valuemax` the last index) with `aria-valuetext` such as "22 Sep 2026, $4,457.50, ▲
    $120.00". ←/→ move by one day, Home/End jump to the ends, and PageUp/PageDown move by 7 days,
    which matches the APG slider keys.
  - **Reduced motion**: `prefers-reduced-motion` sets every `--dur-*` token except `--dur-undo`
    and `--dur-flash` to `0ms`, sets `--stagger` to `0ms` too (as in R-005), and the
    rAF animations read `matchMedia` and jump straight to the final frame.

## R-008 Feedback layer: toasts, Undo, refresh failure (FR-013, FR-017)

- **Decision**: one `ToastProvider` in `shared/ui/Toast` (React context), mounted in `app/`,
  with an `aria-live="polite"` region. Four toast types: saved, undo, error with correlation id,
  and a persistent "Balances couldn't update".
  - **Undo**: a create mutation's `onSuccess` pushes an undo toast that holds the new `id`
    (`--dur-undo` 5 s, progress bar as a CSS keyframe of that length; the JS timer reads the
    same token through `getComputedStyle`). Undo
    calls the existing `deleteTransaction` mutation, the feature 001 delete path, and then the
    usual invalidation. One `keydown` listener handles ⌘Z/Ctrl+Z only when
    `document.activeElement` is not `input`, `textarea`, `select` or `[contenteditable]` (FR-017).
    - **Once**: the first activation (button or ⌘Z) removes the toast before the request, so a
      second press finds nothing to undo and no second `DELETE` is sent.
    - **Failure**: a failed `DELETE` pushes the error toast with its correlation id. The
      transaction stays.
    - **Latest only**: there is at most one undo toast. A new create replaces it, so ⌘Z always
      targets the latest create.
    - **Superseded**: a successful update or delete of the held id closes the undo toast.
      The `--dur-flash` green row highlight is a CSS class keyed on the new id. Reduced motion
      zeroes the animations but not `--dur-undo` or `--dur-flash`: the Undo window is a time limit,
      and the highlight stays visible for its full duration without a fade.
  - **Refresh failure**: after a successful mutation,
    `refetchEntryDerived(queryClient)`, a new helper in `query-keys.ts` next to
    `invalidateEntryDerived` that calls `queryClient.refetchQueries({ queryKey }, { throwOnError: true })` for each entry-derived key.
    There is no separate balances key. If it rejects, the persistent toast's Retry repeats that
    call until it resolves. The mutation
    itself is never reverted.
  - **Error with id**: `ErrorResponse.correlationId` plus `navigator.clipboard.writeText`.
- **Alternatives considered**: a toast library would be a dependency for about 80 lines of code.

## R-009 Command palette (FR-016, FR-019)

- **Decision**: `shared/ui/CommandPalette`, opened from the sidebar Search field or by a global
  ⌘K/Ctrl+K listener in `app/`. It is a modal dialog built on the existing `Modal` focus
  handling, so focus returns to the opener (US5 scenario 2).
  - **Transactions**: `GET /transactions?q=&limit=8`, 200 ms debounce, TanStack Query keyed by
    `q`. The result count is `total`. Account and category names come from the cached
    `listAccounts` and `listCategories` queries, joined by id as `TransactionsPage` already does.
  - **Reports and Actions**: a static list filtered on the client (routes, "New transaction",
    "New account", …).
  - **Keyboard**: ↑/↓ move through the flattened groups, Enter runs the item, Esc closes.
  - **Enter on a transaction**: opens `TransactionForm` in edit mode in a `Modal` over the
    current route, from the result row (a full `TransactionResponse`). No navigation. The
    palette closes first. When the edit modal closes, focus returns to the element that opened
    the palette, and the palette does not reopen.

## R-010 Phone layout (FR-018)

- **Decision**: the same routes and components. `@media (max-width: 767px)` hides the sidebar
  and shows `shared/ui/TabBar`. `Modal` gets a `sheet` variant (bottom-anchored), used for new
  transactions below 768 px together with `shared/ui/Keypad`. The keypad writes into the same
  string that `MoneyInput` parses with `money.ts`, so the money rules are unchanged.
  - **Swipe**: Pointer Events on the row (`touch-action: pan-y`), translate while dragging, act
    past 35% of the row width, otherwise snap back (US7 scenario 2). Left opens `TransactionForm`
    in edit mode with its delete confirmation already showing (FR-018 asks for one), right opens
    it in edit mode. Reusing the form keeps one delete path in the web, so closing the Undo on
    delete (FR-017) happens in one place. The form's own Delete button keeps its feature 001
    behaviour.
  - **More**: the tab bar's More opens a `Modal` sheet listing the routes the tab bar does not
    show (Transactions, Similar transactions, Projection, Projects, Categories), grouped as in the
    sidebar. The design leaves this screen undrawn, so it reuses the sheet and sidebar styles.
  - **Without swiping**: every row has a "⋯" row-actions button (menu button pattern) with Edit
    and Delete, which a keyboard or screen reader can reach. They open the form exactly as the
    swipes do.
  - The width check in JS (to choose between sheet and modal) is
    `matchMedia('(max-width: 767px)')`.

## R-011 Shared web helpers promoted in passing

- `localToday()` is duplicated in four features. It moves to `shared/lib/dates.ts`, together with
  the relative due label and the Upcoming horizon grouping, both as FR-011 defines them (days 0–14
  and overdue first, then the rest of this month, then later; "Today", "Tomorrow", "In N days",
  "⚠ Overdue N days"),
  all pure and unit-tested. Upcoming and Projection use it. The dashboard uses the series `to`
  from the server, not the browser date.
- **Accepted difference**: Upcoming, Overdue and the form defaults keep the browser's date, as in
  feature 001. When the browser's zone differs from `APP_TIMEZONE`, the two can disagree by one
  day near midnight. The user accepted this on 2026-09-23. Getting the server's date onto every
  screen would need a fourth new endpoint, which FR-020 does not allow.

## R-012 Testing additions (Principle VI)

- **api unit**: `balance-series.spec.ts` covers the equality with `balanceAt` for every index, a
  range before the first entry (all `"0"`), a range with no entries (flat line, edge case),
  backdated and soft-deleted entries, and `from = to`. `escapeLike` gets a spec. `accounts.service.spec.ts`
  covers the total: archived series excluded, element-wise sum, no active accounts gives zeros,
  and the default `from` taken from active accounts only. The
  `BalanceHistoryQueryDto` spec covers `to` after today, `from` after `to` and a span over
  10 years.
- **api e2e**: `balance-history.e2e-spec.ts` checks the active-only total with archived accounts
  present, `includeArchived`, the defaults of `to` and `from`, and the span and order validation.
  `transactions` e2e adds `q` (case, wildcards, deleted rows excluded, order, limit). The `ai`
  e2e adds `GET /ai/status` with the key set and empty, and confirms the provider stub gets no
  call. All
  responses are checked by ajv against the updated yaml. The global integrity test runs after
  the Undo flow.
- **web unit**: money plot and count-up helpers, due labels and grouping, the token and contrast
  script (including a fixture with an arbitrary value and a bare `duration-150`, both rejected), Toast/Undo (⌘Z inside and outside a field), palette keyboard, swipe threshold.
- **Playwright**: the existing story specs are updated to the new markup (SC-002, keyboard-only).
  New specs: `redesign-dashboard` (chart equals `getAccountBalanceAsOf` on sampled days, SC-005),
  `redesign-states` (the 8 empty and 4 error/feedback states, SC-007), `redesign-palette`,
  `redesign-undo` (including a failed Undo, two creates in a row and an edit during the window),
  and `redesign-phone` (390 px viewport, no horizontal scroll, sheet, swipe and the More sheet).
- **SC-006**: `perf:measure` gains `getBalanceHistory` for the 1Y range and "All" on the 5 000
  dataset. A timed Playwright test, `e2e/perf/dashboard.perf.spec.ts` with its own config and
  run by a new `pnpm test:perf`, loads the dashboard on that dataset. It fails when the headline
  and the 1Y chart are not drawn, or the chart does not accept an arrow key, within 2 s. It is
  not part of the normal CI run, because it needs the perf seed.

## R-013 Tailwind CSS v4 for component styling (user decision, 2026-09-23)

- **Decision**: add `tailwindcss@4.3.3` and `@tailwindcss/vite@4.3.3` as web **devDependencies**.
  Both are build-time only, with no runtime JS: they output CSS. Verified on 2026-09-23 with
  `npm view`: `@tailwindcss/vite@4.3.3` declares `vite: ^5.2.0 || ^6 || ^7 || ^8`, and the web
  uses Vite 8.3.0. TypeScript is not involved, because the plugin is plain JS.
  - `vite.config.ts` gains `tailwindcss()`.
  - `app.css` starts with `@import "tailwindcss";` and then
    `@import "../../../../design/tokens.css";`. The `tokens.css` import leaves `main.tsx`, which
    now imports only `app.css`.
  - Components style themselves with utility classes built from the tokens. `app.css` keeps only
    `@font-face`, base element rules (body, focus ring), `@keyframes` (undo progress, row flash,
    screen entry) and the reduced-motion override.
  - Class lists are plain strings or template literals. No `clsx` and no `tailwind-merge`: no
    component takes a `className` to merge. No Prettier Tailwind plugin, so the Prettier config
    stays as it is.
- **Rationale**: this is the user's choice. The reskin rewrites every component's styling
  anyway, so this is the cheapest moment to switch. `@theme` makes `tokens.css` the single source
  for both the variables and the utilities. Resetting the default theme plus the `check:tokens`
  rules keeps SC-004 enforceable: a utility that is not a token does not exist, and arbitrary
  values are rejected.
- **Scope**: every feature 001 class in `app.css` is replaced during its screen's reskin (US1,
  US3), and `app.css` is emptied down to the base listed above. Tests are unaffected: Vitest does
  not process CSS, and Playwright asserts behaviour, not class names.
- **Risk**: deadline 2026-09-25. If Foundational's switch fails (Tailwind not building under
  Vite 8 or TS7), the fallback is plain CSS on the same tokens. The `@theme` file stays valid
  CSS variables, so no token work is lost. The trigger is a failing `pnpm --filter web build`
  after the Tailwind wiring task. The user decides at the Foundational checkpoint. The switch
  changes no contract, so it is recorded in plan.md Complexity Tracking, with no plan
  amendment.
- **Alternatives considered**: plain CSS only, the earlier plan, which the user replaced. Tailwind
  v3 needs a `tailwind.config.js` separate from the tokens, so the scale would live twice.
