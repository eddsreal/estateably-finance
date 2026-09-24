import { Cents, formatCents, isNegative } from '../../lib/money';

export function Delta({ cents }: { cents: string }) {
  const value = cents as Cents;
  const down = isNegative(value);
  const text = `${!down && BigInt(value) > 0n ? '+' : ''}${formatCents(value)}`;
  const tone = down ? 'bg-negative-soft text-negative-strong' : 'bg-accent-soft text-accent-hover';
  return (
    <span
      className={`inline-flex h-26 items-center gap-4 rounded-pill px-10 text-13 font-semibold tabular-nums ${tone}`}
    >
      <span aria-hidden="true">{down ? '▼' : '▲'}</span>
      <span className="sr-only">{down ? 'Down' : 'Up'}</span>
      {text}
    </span>
  );
}
