# Feature Specification: UI redesign — Screens v2 and Design System v2

**Feature Branch**: `002-ui-redesign`

**Created**: 2026-09-23

**Status**: Approved

**Input**: User description: "estas son las nuevas pantallas y el nuevo design system" (these are the new
screens and the new design system). The source files are `design/screens/screens-v2.html` and
`design/screens/design-system-v2.html`.

## Overview

Feature 001 delivered a working personal finance manager. This feature changes how it looks and
adds a few new interactions. It changes no money rules. It works from two design files:

- **Screens v2**: 20 numbered screens (01–20) that cover every flow of feature 001, plus the
  empty, error and input states and three phone screens.
- **Design System v2**: the foundations (colour, type, space, radii, elevation, motion) and the
  components (actions, forms, data display, charts, feedback, navigation, overlays).

Where the two files disagree, Screens v2 wins. It is the later file, and its greens and secondary
greys were darkened to meet WCAG AA. Accent `#1a7a53` replaces `#1f8a5e`, and secondary text
`#5b6472` replaces `#8a93a1` wherever the text must be read.

Every rule of feature 001 still applies unless this spec names it as changed: the ledger, integer
cents, the single translation point, validation, the structured error with its correlation id,
and keyboard operability (FR-034).

## Clarifications

### Session 2026-09-23

- Q: Is the command palette in scope, and what does its transaction search cover? → A: In scope,
  and it searches all transactions through a new read-only server-side search (FR-016).
- Q: Undo, which feature 001 left out of scope? → A: Undo only a newly created transaction,
  through the existing delete path. Deletes and edits cannot be undone (FR-017).
- Q: Phone layout? → A: The full design of screens 09–11: tab bar, bottom sheet with numeric
  keypad, and swipe actions (FR-018).
- Q: With the archived toggle on, do archived accounts count toward the dashboard total and
  chart? → A: No. They are only listed, as cards marked archived. The total and the chart stay
  active-only (FR-006).
- Q: When the user picks a past "Balance as of" date, what happens to the chart? → A: The whole
  dashboard moves to that date. The range counts back from it, and the headline, cards and
  sparklines show the balances as of that date (FR-006).
- Q: At what viewport width does the phone layout replace the sidebar? → A: Below 768 px
  (FR-018).
- Q: What does Enter on a transaction result in the command palette open? → A: That
  transaction's edit form (screen 14), over the current screen (FR-016).
- Q: What does ⌘Z do during the Undo window when focus is in a text field? → A: The field's own
  text undo. ⌘Z undoes the transaction only when focus is outside a text field (FR-017).
- Q: US4 scenario 4 needs to know before any click whether AI is configured, but FR-020 allowed
  only two new endpoints. Which one gives way? → A: FR-020 is amended to allow a read-only
  AI availability endpoint (FR-020).

### Session 2026-09-23 (plan review)

- Q: Can the "Balance as of" date be in the future? → A: No. A date after today is rejected
  (FR-006).
- Q: How does a range map to days, and what is the headline's change measured from? → A: A range
  of N days is the N days that end on the "Balance as of" date (30D is that date minus 29
  through that date). The change is measured from the first day on the chart (FR-006).
- Q: How is a donut share rounded? → A: One decimal place with the largest-remainder method, so
  the shares always add up to exactly 100.0% (FR-009).
- Q: What if Undo fails, or two transactions are created within 5 s, or the new transaction is
  edited or deleted during its window? → A: Undo acts once. A failed Undo shows the error toast
  with the correlation id, and the transaction stays. Only the latest create can be undone: a
  new Undo toast replaces the previous one. Editing or deleting that transaction closes its
  Undo (FR-017).
- Q: With reduced motion, what happens to the 2.4 s highlight of a new row? → A: It shows for
  2.4 s without fading (FR-015).
- Q: What does "More" on the phone tab bar open? → A: A bottom sheet with the remaining routes,
  grouped as in the sidebar (FR-018).
- Q: Which "today" do Upcoming and the forms use? → A: The browser's date, as in feature 001.
  Only the dashboard uses the server's today. Near midnight the two can differ by a day, and
  this is accepted.
- Q: How is the chart exposed to assistive technology? → A: As a slider over the selected day,
  whose value text names the date, the balance and the change (FR-019).
- Q: How are SC-001, SC-003 and SC-006 verified? → A: SC-001 by the user's side-by-side review
  at each story checkpoint. SC-003 by the automated check of the text/surface pairs documented
  in the design system, plus that same review confirming no screen uses an undocumented pair.
  SC-006 by a timed Playwright test on the 5 000-transaction dataset.

### Session 2026-09-24 (analysis)

- Q: What does an account card show when "Balance as of" is in the past? → A: Its balance as of
  that date, as FR-006 already says (FR-007).
- Q: Where are the Upcoming group boundaries, and how are today and tomorrow labelled? → A:
  Overdue and days 0–14 form the first group, even across a month end. The rest of the month is
  the second group, everything later the third. Labels: "Today", "Tomorrow", "In N days",
  "⚠ Overdue N days" (FR-011).
- Q: Are the `1px` hairline and SVG geometry hard-coded sizes under SC-004? → A: No. Both are
  named exceptions (SC-004).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - New visual foundation across the app (Priority: P1)

Every screen uses the Design System v2 foundations: the Geist and Geist Mono typefaces, the warm
sand neutrals, the ink sidebar with grouped navigation (Money, Reports, Planning, Setup), the green
accent, and the new radii, shadows and motion. Amounts use tabular figures. Large amounts show the
cents in a faint grey, and every amount keeps its explicit sign.

**Why this priority**: every other story builds on these foundations. Shipping this story alone
already gives the product its new look across every existing flow.

**Independent Test**: open each existing route. Each one uses the new tokens, the grouped ink
sidebar marks the active route, and no colour, font or size appears that is not defined as a
design token.

**Acceptance Scenarios**:

1. **Given** any screen, **When** it renders, **Then** it uses only colours, sizes, radii, shadows
   and durations defined as design tokens, with no hard-coded values in components.
2. **Given** the sidebar, **When** the user is on a route, **Then** that route's item shows the
   active state (ink highlight with a green left bar). Hovered items show the hover state.
3. **Given** a negative amount, **When** it renders, **Then** it shows a minus sign and the
   negative colour, and still reads as negative in greyscale.
4. **Given** a screen that animates on entry, **When** the user has asked the system for reduced
   motion, **Then** the content appears without the animation.

---

### User Story 2 - Accounts dashboard with balance history (Priority: P2)

Screen 01 shows a large total balance for the active accounts and a balance-over-time chart with
7D, 30D, 90D, 1Y and All ranges. Hovering or dragging over the chart shows the balance and the
change on that day. Below the chart, one card per account shows its kind, balance and a trend
sparkline. A "Balance as of" control shows the balances on any past date, and a toggle shows the
archived accounts.

**Why this priority**: the dashboard is the first screen the user sees. The history chart is the
most visible new capability.

**Independent Test**: on the demo seed, open the dashboard. For each range, the chart's
end-of-range value equals the total from feature 001 (FR-010). The value on any hovered day equals
the balance as of that day (FR-011).

**Acceptance Scenarios**:

1. **Given** the dashboard with range 30D, **When** the user hovers a day, **Then** the headline
   shows that day's total balance and its change since the start of the range. A tooltip names
   the day.
2. **Given** a change of range, **When** the new series loads, **Then** the line changes from the
   old shape to the new one (400 ms), and every point equals that day's balance as of that date.
3. **Given** archived accounts exist, **When** the toggle is off, **Then** they are neither shown
   nor counted. A dashed note names how many there are and their balance. **When** the toggle is
   on, **Then** they appear as cards marked archived, and the total and the chart still count only
   active accounts.
4. **Given** keyboard use, **When** the chart has focus, **Then** the arrow keys move the selected
   day, just as hovering does.
5. **Given** a past "Balance as of" date and range 30D, **When** the dashboard renders, **Then**
   the chart covers the 30 days that end on that date, and the headline and every card show the
   balance as of that date.

---

### User Story 3 - Reskinned forms and lists for every existing flow (Priority: P3)

The existing flows move to their v2 layouts: account form (12), global transaction list (13) and
account transaction list (02), transaction form by type (14), categories with inline rename (15),
scheduling and mark-paid (16), monthly report with donut and expandable categories (03), upcoming
timeline grouped by horizon (04), projection chart (05) and payment-by-payment ledger (17),
projects cards (18) and similar transactions (19). Behaviour stays as feature 001 defines it. Only
the presentation changes.

**Why this priority**: this is the largest part of the work, but each screen can ship on its own.

**Independent Test**: run the feature 001 walkthrough (SC-001) on the new screens. Every figure
must match what feature 001 shows today.

**Acceptance Scenarios**:

1. **Given** the transaction form, **When** the user switches the type between Expense, Income and
   Transfer, **Then** the fields change to what that kind requires. Amount, date and description
   carry over.
2. **Given** a field fails validation, **When** the error appears, **Then** it sits under that
   field, the field border turns to the negative colour, and the message names the fix (for
   example "Use at most 2 decimal places, like 250.50.").
3. **Given** the categories list, **When** the user renames one to an existing name, **Then** the
   inline editor shows the duplicate-name error and does not save.
4. **Given** the projection ledger, **When** the running total first drops below $0.00, **Then**
   that row carries a "Below $0.00" marker. The summary names the date, the lowest point and every
   later period below zero.
5. **Given** a project over budget, **When** its card renders, **Then** it shows "Over budget by
   $X". A project that has expenses shows why it cannot be deleted, instead of offering Delete.
6. **Given** a scheduled item whose due date is before today, **When** Upcoming renders, **Then**
   it shows "⚠ Overdue N days". Mark paid opens pre-filled and shows the scheduled amount next to
   any edited amount.
7. **Given** a scheduled item on an archived account, **When** Upcoming renders, **Then** Mark paid
   is disabled and its reason is shown next to it.

---

### User Story 4 - States: empty, loading, errors and feedback (Priority: P4)

Every list and report has the empty state shown on screen 20. Each one names what is missing,
what would fill it, and at most one action. Loading shows skeletons that match the final layout.
A save shows a confirmation toast. A general error shows its message and correlation id with
"Try again" and "Copy ID". A failed balance refresh after a successful change shows a persistent
"Balances couldn't update" toast with a Retry button. A failed AI summary shows a dismissible
notice and leaves the report on screen.

**Why this priority**: these states are what make the product feel finished and trustworthy.
They depend on the screens of stories 1–3.

**Independent Test**: empty the database, then trigger each error (API down, AI provider
failing, AI not configured). Each case shows the state on screen 20 with the correct text and
correlation id.

**Acceptance Scenarios**:

1. **Given** a list with no rows, **When** it renders, **Then** it shows the matching empty state
   from screen 20 (dashboard, monthly report, transactions, upcoming, projects, archived
   categories, similar transactions, projection).
2. **Given** a failing request, **When** the error shows, **Then** it includes the correlation id
   from the structured error response, and "Copy ID" copies it.
3. **Given** a change saved but the balance refetch fails, **When** this happens, **Then** the
   Retry toast stays until a retry succeeds, and the saved change is not rolled back.
4. **Given** no AI key is configured, **When** the similar-transactions screen renders, **Then**
   "Summarize with AI" is disabled and its reason is written next to it.

---

### User Story 5 - Command palette (Priority: P5)

Pressing ⌘K (Ctrl+K elsewhere) opens a search over transactions, reports/screens and actions
(screen 07). The arrow keys move the highlight, Enter opens the highlighted result, and Esc
closes the palette.

**Why this priority**: it is a convenience for power users. No other story depends on it.

**Independent Test**: type "uber" on the demo seed. The matching transactions appear with date,
account, category and amount, and Enter opens the selected one in its edit form.

**Acceptance Scenarios**:

1. **Given** the palette is open, **When** the user types, **Then** the results group into
   Transactions, Reports and Actions, and show a result count.
2. **Given** the palette closes, **When** focus leaves it, **Then** focus returns to the element
   that opened it.

---

### User Story 6 - Undo after creating a transaction (Priority: P6)

After the user creates a transaction, the toast offers Undo (⌘Z) for 5 seconds, with a progress
bar. The new row is highlighted in green for 2.4 seconds. Edits and deletes show a confirmation
toast with no Undo.

**Why this priority**: it removes the fear of a mistyped entry. It reuses the existing delete, so
it adds no new ledger path.

**Independent Test**: create a transaction and press Undo within 5 seconds. The transaction
disappears from every list, every balance returns to its earlier value, and the global
sum-to-zero and reconciliation checks still pass.

**Acceptance Scenarios**:

1. **Given** a just-created transaction, **When** the user presses Undo within 5 s, **Then** the
   transaction is removed through the normal delete path and the balances refetch.
2. **Given** the 5 s window has passed, **When** the toast closes, **Then** Undo is no longer
   offered.
3. **Given** a transaction was edited or deleted, **When** the confirmation toast shows, **Then**
   it offers no Undo.
4. **Given** the Undo window is open and focus is in a text field, **When** the user presses ⌘Z,
   **Then** only the field's text is undone and the transaction stays.

---

### User Story 7 - Phone layout (Priority: P7)

Below 768 px of width (screens 09–11), a floating tab bar replaces the sidebar: Accounts,
Report, a central Add button, Upcoming, More. The dashboard stacks its hero and account list.
Swiping a row left past a threshold deletes it, and swiping right edits it. New transactions open
in a bottom sheet with a numeric keypad.

**Why this priority**: the product is desktop-first today, so the phone layout is additive.

**Independent Test**: at 390 px width, record an expense through the bottom sheet, then delete it
by swiping.

**Acceptance Scenarios**:

1. **Given** a 390 px viewport, **When** any screen renders, **Then** nothing scrolls sideways and
   the tab bar reaches every primary route.
2. **Given** a row swiped less than the threshold, **When** the user releases it, **Then** the row
   snaps back without any action.

---

### Edge Cases

- A range with no transactions still charts a flat line at the balance carried over from before
  the range. It never shows an empty chart.
- The "All" range covers years of data: the chart samples the series so it stays readable, but
  the hover value is always that day's exact balance.
- The account form is opened for an archived account: it offers Unarchive in place of Archive,
  and notes that its scheduled payments cannot be marked paid.
- Amount input: `1234.5`, `1,234.50`, `$1,234.50` and `-350` (only where a sign is allowed) are
  accepted. `12.345` is rejected with "Use at most 2 decimal places".
- A transfer where From equals To, or a transaction dated in the future, is rejected under the
  field concerned. The future-date message suggests scheduling it instead.
- Names longer than a column's width are truncated with an ellipsis, and the full name stays
  available to assistive technology.
- The Geist fonts fail to load: the UI falls back to the system font, and the layout does not
  break.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The UI MUST use the Design System v2 foundations as tokens: colours (green accent,
  ink, sand, text, semantic, 7 category colours), typography (Geist for UI, Geist Mono for data,
  dates, eyebrows and key hints), spacing, radii (5 to 28 px plus pill), elevation (card, popover,
  tooltip, toast, overlay, accent) and motion durations. Where Screens v2 and Design System v2
  differ, the Screens v2 values apply.
- **FR-002**: All text MUST meet WCAG AA contrast against its background. Colours that fail AA
  (for example `#8a93a1` on white) MAY appear only on decorative, non-text elements.
- **FR-003**: `design/tokens.css` and `design/design-system.md` MUST be updated to describe the
  new system, with `design/screens/design-system-v2.html` and `design/screens/screens-v2.html` as
  its visual reference; the v1 files stay in `design/screens/` for history. The rules in
  `design-system.md` that still hold (money formatting, the four kind glyphs, custom pickers,
  error placement, empty states) MUST be kept.
- **FR-004**: Transaction kinds MUST always show the glyph and the colour together: ↑ expense,
  ↓ income, ⇄ transfer, ● opening balance. Balance changes MUST use ▲/▼ so they are never
  confused with the kind arrows.
- **FR-005**: Navigation MUST be a sidebar grouped as Money (Accounts, Transactions), Reports
  (Monthly expenses, Similar transactions), Planning (Upcoming, Projection, Projects) and Setup
  (Categories), with the current date and currency in its footer.
- **FR-006**: The accounts dashboard MUST show the total balance of active accounts, a
  balance-over-time chart with 7D, 30D, 90D, 1Y and All ranges, and hover or keyboard inspection of
  any day's balance and change. Each value on the chart MUST equal the balance as of that day
  defined in feature 001 (FR-011). The total and the chart MUST count only active accounts,
  whether or not the archived toggle is on. The toggle only lists archived accounts as cards
  marked archived. A "Balance as of" date MUST be the end of the whole dashboard: the range counts
  back from it, and the headline, account cards and sparklines show the balances as of that date.
  The "Balance as of" date MUST NOT be after today. A range of N days covers the N days that end
  on that date. The change shown for a day is measured from the first day of the range.
- **FR-007**: Each account card MUST show its name, kind, its balance as of the dashboard's
  "Balance as of" date (today by default) and a sparkline of that account's balance over the
  selected range.
- **FR-008**: The global transaction list MUST offer the date, type, category and project filters,
  a "Clear filters" action, and page-numbered pagination on the existing limit and offset
  (feature 001 FR-009). The account-level list MUST group rows by day, with each day's net amount.
- **FR-009**: The monthly report MUST show a category donut in which hovering or focusing a
  category enlarges its segment, fades the others and shows its name, amount and share in the
  centre. Shares MUST show one decimal place and add up to exactly 100.0%. Category rows MUST
  expand to show the transactions behind them.
- **FR-010**: The projection MUST offer any end date up to 24 months ahead with 3M, 6M, 12M and
  24M shortcuts. It MUST show a chart and a payment-by-payment ledger with the balance after each
  payment, and MUST mark the first payment that takes the total below $0.00.
- **FR-011**: The Upcoming screen MUST group scheduled items into overdue and the next 2 weeks,
  later this month, and later months. Overdue items and items due 0 to 14 days after today form
  the first group, even when those 14 days cross into the next month. The rest of the current
  month forms the second group, and everything later the third. Each item MUST show a relative
  due label: "Today", "Tomorrow", "In N days", "⚠ Overdue 1 day" or "⚠ Overdue N days".
- **FR-012**: Every list and report MUST render the empty state defined for it on screen 20.
  Loading MUST render skeletons that match the final layout.
- **FR-013**: Every request error shown to the user MUST show the correlation id from the
  structured error response and offer to copy it. A failed balance refresh after a successful
  change MUST show a persistent toast with Retry, and MUST NOT roll back the change.
- **FR-014**: Every disabled control MUST state its reason in visible text next to it, not only in
  a tooltip.
- **FR-015**: Motion MUST follow the tokens: 100 ms press, 150 ms hover, 200 ms dialog, 320 ms
  screen entry with a 40 ms stagger, 400 ms chart morph and 700 ms count-up, all eased out with no
  bounce. All of it MUST be disabled when the user prefers reduced motion. The Undo window and
  the 2.4 s new-row highlight are durations, not motion: under reduced motion the highlight shows
  for its full duration without fading.
- **FR-016**: The UI MUST provide a command palette on ⌘K/Ctrl+K that searches transactions,
  screens and actions. The transaction search MUST cover every non-deleted transaction, not only
  the rows loaded on screen. It MUST match descriptions case-insensitively, return the matches
  newest first with a capped result count, and be read-only. Enter on a transaction result MUST
  open that transaction's edit form (screen 14) over the current screen. The sidebar's Search
  field opens the same palette.
- **FR-017**: After a transaction is created, the UI MUST offer Undo for 5 seconds. Undo MUST
  delete that transaction through the existing delete path of feature 001 and refetch the
  balances. The ⌘Z (Ctrl+Z) shortcut MUST trigger Undo only when focus is outside a text field.
  Inside a text field it keeps the field's own text undo. Undo MUST act at most once: its first
  activation closes the toast. If the delete fails, the error toast with the correlation id
  MUST show and the transaction stays. Only the latest create can be undone: a new Undo toast
  replaces the previous one. Editing or deleting that transaction during its window closes its
  Undo. Edits and deletes MUST NOT offer Undo, and no restore of a deleted transaction is added.
- **FR-018**: Below 768 px of viewport width the UI MUST use the layout of screens 09–11 (drawn
  at 390 px): a floating tab
  bar in place of the sidebar, a bottom sheet with a numeric keypad for new transactions, and
  swipe actions on transaction rows (left to delete, right to edit). Because a delete cannot be
  undone (FR-017), a swipe delete MUST ask for confirmation. The tab bar's "More" opens a bottom
  sheet with the remaining routes, grouped as in the sidebar. Every swipe action MUST also be
  reachable without swiping, through a row action a keyboard or screen-reader user can operate.
- **FR-019**: Every new interaction (chart inspection, donut focus, palette, swipe alternatives,
  inline rename) MUST be operable by keyboard with a visible focus indicator, as feature 001
  FR-034 requires. The balance chart MUST expose the selected day to assistive technology as a
  slider whose value text names the date, the balance and the change.
- **FR-020**: The redesign MUST NOT change any existing API behaviour or any figure the UI shows:
  every amount, balance and report total MUST equal what feature 001 shows for the same data.
  New API surface is limited to read-only endpoints: the transaction search of FR-016, the
  daily balance series if the plan chooses to serve it, and an AI availability read
  (`configured: true | false`, never the key) so that "Summarize with AI" can render disabled
  from the start (US4 scenario 4).

### Key Entities

No new domain entities. The command palette reads a **transaction search result**: the same
transaction fields the lists already show, filtered by description. The dashboard chart and the sparklines read a **daily balance series**: a
derived, read-only list of (date, balance) for the total or for one account over a range. Each
value is the feature 001 balance as of that date. It is never stored as a source of truth.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 20 screens of Screens v2 in scope are implemented. A side-by-side review against
  the design file finds no mismatch in layout, token usage or copy on the demo seed. The review is
  the user's, done screen by screen at each story checkpoint.
- **SC-002**: The feature 001 walkthrough (its SC-001) passes on the new UI with every figure
  unchanged, and can still be completed with the keyboard only.
- **SC-003**: Every text/background pair in the implemented screens meets WCAG AA (4.5:1 for body
  text, 3:1 for large text). The pairs are documented in the design system and checked
  automatically. The SC-001 review confirms that no screen uses an undocumented pair.
- **SC-004**: Components contain no hard-coded colour, size, radius, shadow or duration values.
  Every such value comes from a design token. Exceptions: the `1px` hairline, and SVG user-space
  geometry (the `viewBox` and the coordinates inside it). Stroke widths, font sizes and colours
  on SVG elements still use tokens.
- **SC-005**: Every value on the dashboard chart and in the sparklines, over every range, equals
  the independently computed balance as of that date on the demo seed.
- **SC-006**: The dashboard, including its chart for the 1Y range, is usable within 2 seconds on
  the generated 5 000-transaction dataset of feature 001 FR-032. Usable means the headline and
  the 1Y chart are drawn and the chart accepts arrow keys.
- **SC-007**: Each of the 8 empty states and the 4 error or feedback states on screen 20 can be
  triggered and shows the specified text.

## Assumptions

- Screens v2 overrides Design System v2 wherever they conflict (accent `#1a7a53`, AA-safe greys).
  Design System v2's `#1f8a5e` and `#8a93a1` are kept only where AA does not apply.
- The theme is light only. There is no dark mode, as in the current design system.
- The Geist and Geist Mono font files are served with the app (both are open-source, SIL OFL), so
  the app loads them with no network access.
- The daily balance series is derived from the feature 001 ledger. Whether it is computed on the
  server or assembled from existing balance reads is a plan decision. It adds no new entry path
  (Constitution I–III).
- The chart and donut are drawn with inline SVG, as the design files do. No charting library is
  assumed.
- Mark paid, projection, reports and project rules keep their feature 001 behaviour. The screens
  show them and do not redefine them.
- Delivery follows the story priority order. The feature 001 deadline (2026-09-25) is tight, so
  stories 5–7 are the first to slip if time runs out.

## Out of Scope

- Dark mode.
- Any change to ledger rules, money representation, validation rules or the API error shape.
- New domain entities, and any change to the rules for accounts, categories, scheduled items or
  projects.
- The "Search" field in the sidebar as a separate feature: it opens the command palette of FR-016.
- Undoing an edit or a delete, and restoring a deleted transaction.
