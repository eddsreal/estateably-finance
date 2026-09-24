# Design system v2

Rules the tokens can't express. Values live in [`tokens.css`](./tokens.css), a Tailwind v4
`@theme static` block: every token is a CSS variable and generates its utility (`bg-accent`,
`text-text-2`, `p-14`, `rounded-lg`, `shadow-overlay`). The visual reference is
[`screens/screens-v2.html`](./screens/screens-v2.html) and
[`screens/design-system-v2.html`](./screens/design-system-v2.html). Where the two differ,
Screens v2 wins. The v1 files in `screens/` are kept for history only.

Light theme only. No dark mode until a spec asks for one.

## Foundations

- **Colour.** Green is the only accent (`--color-accent`), ink is for dark surfaces (sidebar,
  toasts, tooltips, active chips), sand is for the warm neutrals (canvas, cards, borders). Text
  uses `--color-text-1…3` and `--color-text-strong`. Semantic colours carry meaning, never
  decoration. The seven `--color-cat-*` colours are assigned to categories by rank in reports.
- **Decor only.** `--color-decor-*` (`#1f8a5e`, `#25a06d`, `#8a93a1`, `#a3aab6`) fail AA as text.
  They may fill chart areas, dots, bars and hairlines, never text. `check:tokens` rejects any
  pair below that uses one.
- **Type.** Geist (`font-ui`) sets the UI. Geist Mono (`font-mono`) sets table amounts, dates,
  eyebrows and key hints. Sizes are named by pixel value (`text-13`) because Screens v2 uses
  one-off sizes that must not be snapped to a coarser scale. Figures are always tabular.
- **Space.** Spacing and control heights are named by pixel value (`p-14`, `h-42`). There is no
  `--spacing` multiplier: a bare number that is not a token produces no CSS.
- **Shape.** Radii `--radius-xs` (5) to `--radius-5xl` (28) plus `--radius-pill`. Elevation is
  one of card, popover, tooltip, toast, overlay or accent.
- **Hairline.** `1px` borders are the one literal size allowed in components.

## Motion

All motion eases out with `--ease-out` (`cubic-bezier(.2,.8,.2,1)`). No bounces.

| Token          | Value  | Use                                            |
| -------------- | ------ | ---------------------------------------------- |
| `--dur-press`  | 100 ms | buttons scale to .97                           |
| `--dur-hover`  | 150 ms | colour, border, background                     |
| `--dur-dialog` | 200 ms | dialog in: scale .96 → 1 and fade              |
| `--dur-enter`  | 320 ms | screen entry: fade up, `--stagger` 40 ms apart |
| `--dur-morph`  | 400 ms | chart range or horizon change                  |
| `--dur-count`  | 700 ms | totals count up                                |
| `--dur-flash`  | 2.4 s  | a saved row glows green                        |
| `--dur-undo`   | 5 s    | the Undo window and its toast progress bar     |

Components write `duration-(--dur-hover) ease-(--ease-out)`, never a bare `duration-150`. Under
`prefers-reduced-motion: reduce` every `--dur-*` and `--stagger` becomes `0ms`, except
`--dur-undo` and `--dur-flash`: those are time limits, not motion. The row highlight then shows
for its full 2.4 s without fading.

## Money

- Amounts render in Geist Mono, tabular, right-aligned in tables.
- **Sign and colour, both — never colour alone.** A negative amount keeps its minus sign, so it
  still reads as negative in greyscale and in print.
- Large amounts render their cents in a fainter tone than the dollars, so the eye reads dollars
  first. The cents stay a documented text pair below.
- Cents → `$1,234.56` only in the presentation layer, through one shared helper
  (Constitution II).

## Transaction kinds — glyph and colour, always both

Exactly four, matching the ledger intents (Constitution III). Never show debits, credits or
system accounts.

| Kind            | Glyph | Colour             | Chip background         |
| --------------- | ----- | ------------------ | ----------------------- |
| Expense         | `↑`   | `--color-negative` | `--color-negative-soft` |
| Income          | `↓`   | `--color-accent`   | `--color-accent-soft`   |
| Transfer        | `⇄`   | `--color-transfer` | `--color-transfer-soft` |
| Opening balance | `●`   | `--color-text-2`   | `--color-neutral-soft`  |

Balance changes use `▲` (up) and `▼` (down) with the signed amount, so they never collide with
the kind arrows. Keep the glyphs rather than an icon set: kind has to read at a glance in a
dense table.

## Icons

24×24 viewBox, 1.6–1.7 stroke, round caps and joins, `currentColor`, no fill. Inline SVG, no
icon dependency. The viewBox and the coordinates inside it are user units, not tokens; stroke
widths, sizes and colours on the element are tokens.

## Components

- **Sidebar.** Ink, grouped as Money (Accounts, Transactions), Reports (Monthly expenses,
  Similar transactions), Planning (Upcoming, Projection, Projects) and Setup (Categories). The
  active item is an ink highlight with a green left bar. The footer shows the date and currency.
- **Buttons.** Primary is green with `--shadow-accent`; secondary is a sand card with a
  hairline; destructive is negative text on a negative hairline.
- **Segmented controls and chips.** Pill-shaped; the selected segment is ink on light surfaces.
- **Cards.** `--color-sand-0` on the sand canvas, a `--color-sand-350` hairline, `--shadow-card`.
- **Tables.** Row hairlines, Geist Mono eyebrow headers, text truncates with an ellipsis and
  keeps the full text for assistive technology.
- **Charts.** Area chart with a dashed crosshair, a green dot and an ink tooltip. Donut by
  category share. Sparklines are decorative.
- **Toasts.** Ink with `--shadow-toast`. The Undo toast carries a progress bar over `--dur-undo`.
- **Dialogs and the command palette.** Sand card on the scrim with `--shadow-overlay`.

## Pickers — ours, never the browser's

A trigger button plus a floating panel, so chrome, type and focus ring match everything else and
behave identically on every OS.

- `position: fixed`, portalled out of the card, so the panel escapes overflow clipping.
- Keyboard: opening moves focus into the panel; arrow keys move the active option (or day),
  `Enter` selects and closes, `Escape` closes without selecting; either way focus returns to
  the trigger. `Tab` leaves the picker entirely.
- Closes on outside click, on `Escape`, and on scroll.
- Flips above the trigger when there is no room below.
- **Date**: the title is a button — one tap gives the month grid, two the 12-year grid, and the
  arrows then step by year and by decade, so a date years back is three taps away. Days past a
  field's max are inert, not merely greyed.
- **Select**: matches trigger width, minimum 190px. Archived entries are unselectable; the
  placeholder row clears the value.

## Validation and errors

- Field errors inline under the field, field border in `--color-negative`, and the message names
  the fix ("Use at most 2 decimal places, like 250.50.").
- Request errors show the human message and the correlation id with a Copy ID action — the
  API's structured error shape surfaced directly (Constitution V).
- A disabled control states its reason in visible text next to it, not only in a tooltip.
  Disabled with no explanation is a bug.

## Empty states

One sentence naming what is missing, one on what fills it, at most one action. Nothing else.

## Text on surface pairs

Every text colour on every surface it appears on. This table is the source of truth for SC-003:
`check:tokens` computes the WCAG contrast of each row and fails below 4.5:1, or 3:1 for rows
marked `large` (at least 18.66 px bold or 24 px regular). A pair missing from this table must not
be used.

| Text                      | Surface                    | Size |
| ------------------------- | -------------------------- | ---- |
| `--color-text-1`          | `--color-sand-0`           | body |
| `--color-text-1`          | `--color-sand-50`          | body |
| `--color-text-1`          | `--color-sand-100`         | body |
| `--color-text-1`          | `--color-sand-150`         | body |
| `--color-text-1`          | `--color-sand-200`         | body |
| `--color-text-1`          | `--color-accent-highlight` | body |
| `--color-text-2`          | `--color-sand-0`           | body |
| `--color-text-2`          | `--color-sand-50`          | body |
| `--color-text-2`          | `--color-sand-100`         | body |
| `--color-text-2`          | `--color-sand-150`         | body |
| `--color-text-2`          | `--color-sand-200`         | body |
| `--color-text-2`          | `--color-neutral-soft`     | body |
| `--color-text-3`          | `--color-sand-0`           | body |
| `--color-text-3`          | `--color-sand-50`          | body |
| `--color-text-3`          | `--color-sand-150`         | body |
| `--color-text-strong`     | `--color-sand-0`           | body |
| `--color-text-strong`     | `--color-neutral-soft`     | body |
| `--color-text-on-ink`     | `--color-ink-900`          | body |
| `--color-text-on-ink`     | `--color-ink-850`          | body |
| `--color-text-on-ink`     | `--color-ink-800`          | body |
| `--color-text-on-ink`     | `--color-ink-700`          | body |
| `--color-text-on-ink`     | `--color-accent`           | body |
| `--color-text-on-ink`     | `--color-accent-hover`     | body |
| `--color-text-on-ink`     | `--color-negative`         | body |
| `--color-ink-300`         | `--color-ink-900`          | body |
| `--color-ink-300`         | `--color-ink-850`          | body |
| `--color-ink-400`         | `--color-ink-900`          | body |
| `--color-ink-200`         | `--color-ink-700`          | body |
| `--color-accent-on-ink`   | `--color-ink-900`          | body |
| `--color-accent`          | `--color-sand-0`           | body |
| `--color-accent`          | `--color-sand-150`         | body |
| `--color-accent`          | `--color-accent-soft`      | body |
| `--color-accent-hover`    | `--color-accent-soft`      | body |
| `--color-negative`        | `--color-sand-0`           | body |
| `--color-negative`        | `--color-sand-150`         | body |
| `--color-negative`        | `--color-negative-soft`    | body |
| `--color-negative-strong` | `--color-negative-soft`    | body |
| `--color-warning`         | `--color-sand-0`           | body |
| `--color-warning`         | `--color-warning-soft`     | body |
| `--color-warning-strong`  | `--color-warning-soft`     | body |
| `--color-warning-ink`     | `--color-warning-surface`  | body |
| `--color-transfer`        | `--color-sand-0`           | body |
