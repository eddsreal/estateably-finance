import { KeyboardEvent, useRef } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { Cents, formatCents, share, toPlotNumber } from '../../lib/money';

export const CATEGORY_COLORS = [
  { fill: 'var(--color-cat-1)', swatch: 'bg-cat-1' },
  { fill: 'var(--color-cat-2)', swatch: 'bg-cat-2' },
  { fill: 'var(--color-cat-3)', swatch: 'bg-cat-3' },
  { fill: 'var(--color-cat-4)', swatch: 'bg-cat-4' },
  { fill: 'var(--color-cat-5)', swatch: 'bg-cat-5' },
  { fill: 'var(--color-cat-6)', swatch: 'bg-cat-6' },
  { fill: 'var(--color-cat-7)', swatch: 'bg-cat-7' },
] as const;

export function categoryColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export type DonutSegment = { id: string; name: string; total: string };

type DonutProps = {
  label: string;
  segments: DonutSegment[];
  active: string | null;
  onActive: (id: string | null) => void;
};

export function Donut({ label, segments, active, onActive }: DonutProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const totals = segments.map((segment) => segment.total as Cents);
  const grand = totals.reduce((sum, total) => sum + BigInt(total), 0n).toString() as Cents;
  if (BigInt(grand) === 0n) return null;
  const shares = share(totals);
  const data = segments.map((segment, index) => ({
    id: segment.id,
    plot: toPlotNumber(totals[index], '0' as Cents, grand, 1),
  }));
  const current = segments.findIndex((segment) => segment.id === active);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    buttons.current[(index + step + segments.length) % segments.length]?.focus();
  };

  return (
    <fieldset
      aria-label={label}
      className="relative size-280 rounded-pill has-focus-visible:shadow-focus"
    >
      <PieChart width={280} height={280} accessibilityLayer={false} aria-hidden="true">
        <Pie
          data={data}
          dataKey="plot"
          startAngle={90}
          endAngle={-270}
          innerRadius={89}
          outerRadius={(point: { id: string }) => (point.id === active ? 124 : 119)}
          paddingAngle={1}
          stroke="none"
          rootTabIndex={-1}
          isAnimationActive={false}
          onMouseEnter={(_, index) => onActive(segments[index].id)}
          onMouseLeave={() => onActive(null)}
        >
          {data.map((point, index) => (
            <Cell
              key={point.id}
              data-segment={point.id}
              fill={categoryColor(index).fill}
              opacity={active === null || point.id === active ? 1 : 0.3}
            />
          ))}
        </Pie>
      </PieChart>
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
      >
        <span className="font-mono text-11 tracking-wider text-text-3 uppercase">
          {current >= 0 ? segments[current].name : 'Total'}
        </span>
        <span className="text-28 font-semibold tracking-tight tabular-nums">
          {formatCents(current >= 0 ? totals[current] : grand)}
        </span>
        <span className="text-13 text-text-2">
          {current >= 0
            ? `${shares[current]}% of spend`
            : `${segments.length} categor${segments.length === 1 ? 'y' : 'ies'}`}
        </span>
      </div>
      <ul className="sr-only">
        {segments.map((segment, index) => (
          <li key={segment.id}>
            <button
              type="button"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              aria-pressed={segment.id === active}
              onFocus={() => onActive(segment.id)}
              onBlur={() => onActive(null)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {`${segment.name}, ${formatCents(totals[index])}, ${shares[index]}%`}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
