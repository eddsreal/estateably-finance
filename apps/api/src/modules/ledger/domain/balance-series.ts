import { addDays } from '../../../common/dates/dates';
import { balanceAt, DatedAmount } from './balance-at';

export function balanceSeries(entries: readonly DatedAmount[], from: string, to: string): bigint[] {
  const byDay = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.date > from && entry.date <= to) {
      byDay.set(entry.date, (byDay.get(entry.date) ?? 0n) + entry.amount);
    }
  }
  const series: bigint[] = [];
  let balance = balanceAt(entries, from);
  for (let day = from; day <= to; day = addDays(day, 1)) {
    balance += byDay.get(day) ?? 0n;
    series.push(balance);
  }
  return series;
}
