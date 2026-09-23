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
