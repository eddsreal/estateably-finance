import { normalise } from './normalise';

export type SimilarRow = {
  description: string;
  entries: readonly { systemAccountId: bigint | null; amount: bigint }[];
};

export type SimilarGroup<T extends SimilarRow> = {
  key: string;
  count: number;
  total: bigint;
  transactions: T[];
};

export type SimilarReport<T extends SimilarRow> = {
  groups: SimilarGroup<T>[];
  topTransactions: T[];
  topGroupKey: string | null;
};

function amountOf(row: SimilarRow): bigint {
  const amount = row.entries.find((entry) => entry.systemAccountId !== null)?.amount ?? 0n;
  return amount < 0n ? -amount : amount;
}

export function similarReport<T extends SimilarRow>(rows: readonly T[]): SimilarReport<T> {
  const byKey = new Map<string, SimilarGroup<T>>();
  for (const row of rows) {
    const key = normalise(row.description);
    const group = byKey.get(key) ?? { key, count: 0, total: 0n, transactions: [] };
    group.count += 1;
    group.total += amountOf(row);
    group.transactions.push(row);
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].sort((a, b) => {
    if (a.total !== b.total) return a.total < b.total ? 1 : -1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const topTransactions = [...rows]
    .sort((a, b) => {
      const left = amountOf(a);
      const right = amountOf(b);
      return left === right ? 0 : left < right ? 1 : -1;
    })
    .slice(0, 5);
  return { groups, topTransactions, topGroupKey: groups[0]?.key ?? null };
}
