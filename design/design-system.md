# Design system

Rules the tokens can't express. Values live in [`tokens.css`](./tokens.css); what it all looks
like is [`reference.html`](./reference.html) — open it in a browser, no dependencies, no network.
Its pickers are drawn open rather than interactive, so their behaviour below is the part you
implement. Keep this document free of anything `tokens.css` or `reference.html` already carries.

Light theme only. No dark mode until a spec asks for one.

## Money

- Amounts render tabular, right-aligned in tables (`.amount`).
- **Sign and colour, both — never colour alone.** Colour alone fails for colour-blind readers
  and in print.
- Cents → `$1,234.56` only in the presentation layer, through one shared helper
  (Constitution II).

## Transaction kinds — icon and colour, always both

Exactly four, matching the ledger intents (Constitution III). Never show debits, credits or
system accounts.

| Kind | Glyph | Colour | Chip background |
|---|---|---|---|
| Expense | `↑` | `--negative` | `--negative-soft` |
| Income | `↓` | `--accent` | `--accent-soft` |
| Transfer | `⇄` | `--transfer` | `--transfer-soft` |
| Opening balance | `●` | `--ink-2` | `--neutral-soft` |

Keep the arrow glyphs rather than swapping in an icon set — kind has to read at a glance in a
dense table.

## Icons

24×24 viewBox, 1.6–1.7 stroke, round caps and joins, `currentColor`, no fill. 17px in nav, 18px
in rows, 22px in empty states. Inline SVG — no icon dependency.

## Pickers — ours, never the browser's

A trigger button plus a floating panel, so chrome, type and focus ring match everything else and
behave identically on every OS.

- `position: fixed`, portalled out of the card, so the panel escapes overflow clipping.
- Closes on outside click, on `Escape`, and on scroll.
- Flips above the trigger when there is no room below.
- **Date**: the title is a button — one tap gives the month grid, two the 12-year grid, and the
  arrows then step by year and by decade, so a date years back is three taps away. Days past a
  field's max are inert, not merely greyed.
- **Select**: matches trigger width, minimum 190px. Archived entries are unselectable; the
  placeholder row clears the value.

## Validation and errors

- Field errors inline under the field, field border in `--negative`.
- Request errors in a banner above the form, naming the error code alongside the human message —
  the API's structured error shape surfaced directly (Constitution V).
- A disabled control must say why, via tooltip. Disabled with no explanation is a bug.

## Empty states

One sentence naming what is missing, one on what fills it, one primary action. Nothing else.
Variants needed: no accounts yet · no transactions match these filters · nothing scheduled ·
no projects.

## Four border greys in the source

The preview uses `#e4e7eb`, `#dfe3e9`, `#e2e6ec` and `#e7e9ee` interchangeably. Noise, not
intent — implement everything with `--border`.
