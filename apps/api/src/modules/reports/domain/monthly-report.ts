export type ReportEntry = {
  accountId: bigint | null;
  systemAccountId: bigint | null;
  amount: bigint;
  systemAccount?: { categoryId: bigint | null } | null;
};

export type ReportRow = {
  kind: string;
  entries: readonly ReportEntry[];
};

export type MonthlyReportGroup<T extends ReportRow> = {
  categoryId: bigint;
  total: bigint;
  transactions: T[];
};

export type MonthlyReport<T extends ReportRow> = {
  grandTotal: bigint;
  groups: MonthlyReportGroup<T>[];
};

export function monthlyReport<T extends ReportRow>(rows: readonly T[]): MonthlyReport<T> {
  const byCategory = new Map<bigint, MonthlyReportGroup<T>>();
  for (const row of rows) {
    if (row.kind !== 'expense') continue;
    const system = row.entries.find((entry) => entry.systemAccountId !== null);
    const categoryId = system?.systemAccount?.categoryId;
    if (system === undefined || categoryId === null || categoryId === undefined) continue;
    const group = byCategory.get(categoryId) ?? { categoryId, total: 0n, transactions: [] };
    group.total += system.amount;
    group.transactions.push(row);
    byCategory.set(categoryId, group);
  }
  const groups = [...byCategory.values()].sort((a, b) => {
    if (a.total !== b.total) return a.total < b.total ? 1 : -1;
    return a.categoryId < b.categoryId ? -1 : 1;
  });
  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0n);
  return { grandTotal, groups };
}
