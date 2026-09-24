import { Cents, formatCents, isNegative } from '../../lib/money';

type AmountProps = {
  cents: string;
  sign?: 'auto' | 'always';
  size?: 'regular' | 'large';
};

export function Amount({ cents, sign = 'auto', size = 'regular' }: AmountProps) {
  const value = cents as Cents;
  const negative = isNegative(value);
  const plus = sign === 'always' && !negative && BigInt(value) > 0n;
  const text = `${plus ? '+' : ''}${formatCents(value)}`;
  const tone = negative ? 'text-negative' : plus ? 'text-accent' : '';
  if (size === 'large') {
    const point = text.lastIndexOf('.');
    return (
      <span className={`font-ui font-semibold tracking-tighter tabular-nums ${tone}`}>
        {text.slice(0, point)}
        <span className="text-text-3">{text.slice(point)}</span>
      </span>
    );
  }
  return <span className={`font-mono font-medium tabular-nums ${tone}`}>{text}</span>;
}
