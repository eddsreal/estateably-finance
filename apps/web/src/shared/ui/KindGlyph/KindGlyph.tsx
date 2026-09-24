export type Kind = 'expense' | 'income' | 'transfer' | 'opening';

const KINDS: Record<Kind, { glyph: string; label: string; tone: string }> = {
  expense: { glyph: '↑', label: 'Expense', tone: 'bg-negative-soft text-negative' },
  income: { glyph: '↓', label: 'Income', tone: 'bg-accent-soft text-accent' },
  transfer: { glyph: '⇄', label: 'Transfer', tone: 'bg-transfer-soft text-transfer-strong' },
  opening: { glyph: '●', label: 'Opening balance', tone: 'bg-neutral-soft text-text-2' },
};

type KindGlyphProps = {
  kind: Kind;
  label?: string;
  showLabel?: boolean;
};

export function KindGlyph({ kind, label, showLabel = false }: KindGlyphProps) {
  const meta = KINDS[kind];
  const name = label ?? meta.label;
  const tile = `grid size-28 flex-none place-items-center rounded-sm text-12 font-bold ${meta.tone}`;
  if (!showLabel) {
    return (
      <span className={tile}>
        <span aria-hidden="true">{meta.glyph}</span>
        <span className="sr-only">{name}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-8 text-14 font-medium">
      <span aria-hidden="true" className={tile}>
        {meta.glyph}
      </span>
      {name}
    </span>
  );
}
