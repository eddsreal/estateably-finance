const EASE = 'duration-(--dur-hover) ease-(--ease-out)';
const PRESSABLE = `cursor-pointer transition ${EASE} active:scale-97 active:duration-(--dur-press) disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100`;

export const PAGE = 'flex flex-col gap-20 px-32 py-28';
export const PAGE_HEADER = 'flex flex-wrap items-center justify-between gap-16';
export const PAGE_TITLE = 'flex items-center gap-10 text-28 font-semibold tracking-tight';
export const SECTION_TITLE = 'mb-12 text-17 font-semibold';

export const CARD = 'rounded-3xl border border-sand-350 bg-sand-0 p-24 shadow-card';
export const STAT = `${CARD} flex flex-col gap-6`;
export const STAT_CAPTION = 'text-13 text-text-2';
export const STAT_VALUE = 'text-28 font-semibold tracking-tight';

export const BUTTON = `inline-flex h-40 items-center justify-center gap-8 rounded-lg border border-sand-500 bg-sand-0 px-16 text-14 font-medium text-text-1 hover:bg-sand-50 ${PRESSABLE}`;
export const BUTTON_PRIMARY = `inline-flex h-40 items-center justify-center gap-8 rounded-lg bg-accent px-16 text-14 font-semibold text-text-on-ink shadow-accent hover:bg-accent-hover ${PRESSABLE}`;
export const BUTTON_DANGER = `inline-flex h-40 items-center justify-center gap-8 rounded-lg border border-negative bg-sand-0 px-16 text-14 font-medium text-negative ${PRESSABLE}`;
export const BUTTON_COMPACT = `inline-flex h-32 items-center justify-center gap-6 rounded-sm border border-sand-700 bg-sand-0 px-12 text-13 font-medium text-text-1 hover:bg-sand-50 ${PRESSABLE}`;
const ROW_ACTION_BASE = `h-32 max-w-280 rounded-sm px-8 text-14 font-medium text-accent hover:text-accent-hover hover:underline ${PRESSABLE}`;
export const ICON_BUTTON = `inline-flex size-32 items-center justify-center rounded-sm text-text-2 hover:bg-sand-200 hover:text-text-1 ${PRESSABLE}`;
export const ROW_ACTION = `inline-flex items-center ${ROW_ACTION_BASE}`;
export const ROW_ACTION_TEXT = `block truncate text-left leading-(--spacing-32) ${ROW_ACTION_BASE}`;
export const LINK = `font-medium text-accent transition-colors ${EASE} hover:text-accent-hover hover:underline`;

export const FORM = 'flex flex-col gap-14';
export const FIELD = 'flex flex-col gap-6';
export const LABEL = 'text-13 font-medium text-text-1';
export const OPTIONAL = 'font-regular text-text-2';
export const INPUT = `h-42 w-full rounded-lg border border-sand-700 bg-sand-0 px-14 text-15 text-text-1 transition-colors ${EASE} focus-visible:border-accent focus-visible:shadow-focus aria-invalid:border-negative aria-invalid:shadow-focus-negative`;
export const FIELD_ERROR = 'text-12 text-negative';
export const FORM_ACTIONS = 'mt-4 flex justify-end gap-8 border-t border-sand-200 pt-16';
export const SEGMENTED = 'grid auto-cols-fr grid-flow-col gap-2 rounded-lg bg-sand-200 p-3';
export const SEGMENT = `flex h-36 cursor-pointer items-center justify-center rounded-sm text-14 font-medium text-text-strong transition-colors ${EASE} has-checked:bg-sand-0 has-checked:font-semibold has-checked:text-text-1 has-checked:shadow-card has-focus-visible:shadow-focus`;
export const CHECKBOX_LABEL = 'inline-flex items-center gap-8 text-14 text-text-2';
export const TOOLBAR = 'flex flex-wrap items-end gap-12';
export const TOOLBAR_FIELD = `${FIELD} min-w-190`;
export const HINT = 'text-12 text-text-2';

export const BANNER_ERROR =
  'rounded-lg border border-negative-line bg-negative-soft px-12 py-10 text-13 text-negative-strong';
export const BANNER_WARNING =
  'flex flex-wrap items-center gap-12 rounded-lg border border-warning-line bg-warning-surface px-12 py-10 text-13 text-warning-ink';

const CHIP = 'inline-flex h-24 items-center gap-4 rounded-pill px-10 text-12 font-medium';
export const CHIP_NEUTRAL = `${CHIP} bg-neutral-soft text-text-2`;
export const CHIP_WARNING = `${CHIP} bg-warning-soft text-warning-strong`;
export const CHIP_CATEGORY = `${CHIP} bg-sand-200 text-text-strong`;

export const TD_AMOUNT = 'text-right';
export const TRUNCATE = 'block max-w-280 truncate';
export const PAGINATION = 'flex items-center justify-between gap-12 pt-16 text-13 text-text-strong';
