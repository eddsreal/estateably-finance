export type Cents = string & { readonly __brand: 'Cents' };

const CENTS_PATTERN = /^-?[0-9]{1,16}$/;
const DOLLARS_PATTERN = /^(-)?\$?((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?$/;
const LIMIT = 10n ** 15n;

export function toCents(value: string): Cents | null {
  if (!CENTS_PATTERN.test(value)) return null;
  const cents = BigInt(value);
  if (cents > LIMIT || cents < -LIMIT) return null;
  return cents.toString() as Cents;
}

export function parseDollars(input: string): Cents | null {
  const match = DOLLARS_PATTERN.exec(input.trim());
  if (!match) return null;
  const [, sign, wholePart, fraction] = match;
  const whole = BigInt(wholePart.replaceAll(',', ''));
  const cents = whole * 100n + BigInt((fraction ?? '').padEnd(2, '0'));
  return toCents(sign === '-' ? (-cents).toString() : cents.toString());
}

function split(cents: Cents): { sign: string; whole: string; fraction: string } {
  const value = BigInt(cents);
  const absolute = (value < 0n ? -value : value).toString().padStart(3, '0');
  const whole = absolute.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { sign: value < 0n ? '-' : '', whole, fraction: absolute.slice(-2) };
}

export function formatCents(cents: Cents): string {
  const { sign, whole, fraction } = split(cents);
  return `${sign}$${whole}.${fraction}`;
}

export function formatPlain(cents: Cents): string {
  const { sign, whole, fraction } = split(cents);
  return `${sign}${whole}.${fraction}`;
}

export function addCents(a: Cents, b: Cents): Cents {
  return (BigInt(a) + BigInt(b)).toString() as Cents;
}

export function compareCents(a: Cents, b: Cents): -1 | 0 | 1 {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isNegative(cents: Cents): boolean {
  return BigInt(cents) < 0n;
}

export function change(from: Cents, to: Cents): Cents {
  return (BigInt(to) - BigInt(from)).toString() as Cents;
}

export function toPlotNumber(cents: Cents, min: Cents, max: Cents, height: number): number {
  const span = BigInt(max) - BigInt(min);
  if (span === 0n) return height / 2;
  return (Number(BigInt(cents) - BigInt(min)) / Number(span)) * height;
}

export function toPlotSeries(series: Cents[]): number[] {
  const values = series.map((value) => BigInt(value));
  const min = values.reduce((low, value) => (value < low ? value : low)).toString() as Cents;
  const max = values.reduce((high, value) => (value > high ? value : high)).toString() as Cents;
  return series.map((value) => toPlotNumber(value, min, max, 1));
}

export function countUpFrames(start: Cents, end: Cents): Cents[] {
  const from = BigInt(start);
  const distance = BigInt(end) - from;
  return Array.from(
    { length: 61 },
    (_, k) => (from + (distance * BigInt(k)) / 60n).toString() as Cents,
  );
}

export function share(totals: Cents[]): string[] {
  const values = totals.map((total) => BigInt(total));
  const grand = values.reduce((sum, value) => sum + value, 0n);
  if (grand === 0n) return totals.map(() => '0.0');
  const tenths = values.map((value) => (value * 1000n) / grand);
  const order = values
    .map((value, index) => ({ index, remainder: (value * 1000n) % grand }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  let left = 1000n - tenths.reduce((sum, value) => sum + value, 0n);
  for (const { index } of order) {
    if (left === 0n) break;
    tenths[index] += 1n;
    left -= 1n;
  }
  return tenths.map((value) => `${value / 10n}.${value % 10n}`);
}
