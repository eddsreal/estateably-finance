export type DatedAmount = { date: string; amount: bigint };

export function balanceAt(entries: readonly DatedAmount[], asOf: string): bigint {
  let sum = 0n;
  for (const entry of entries) {
    if (entry.date <= asOf) {
      sum += entry.amount;
    }
  }
  return sum;
}
