import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  accounts: ['accounts'] as const,
  accountsList: (includeArchived: boolean) => ['accounts', 'list', includeArchived] as const,
  balanceHistory: (from: string | undefined, to: string | undefined) =>
    ['accounts', 'history', from, to] as const,
  accountBalanceAsOf: (id: string, asOf: string) => ['accounts', 'balance', id, asOf] as const,
  transactions: ['transactions'] as const,
  transactionsList: (filters: Record<string, string | number | undefined>) =>
    ['transactions', 'list', filters] as const,
  transactionSearch: (q: string) => ['transactions', 'search', q] as const,
  categories: ['categories'] as const,
  categoriesList: (includeArchived: boolean) => ['categories', 'list', includeArchived] as const,
  projects: ['projects'] as const,
  projectsList: ['projects', 'list'] as const,
  projectTransactions: (id: string, offset: number) =>
    ['projects', 'transactions', id, offset] as const,
  reports: ['reports'] as const,
  reportMonthly: (month: string) => ['reports', 'monthly', month] as const,
  reportSimilar: (from: string, to: string) => ['reports', 'similar', from, to] as const,
  projection: ['projection'] as const,
  projectionAt: (horizon: string) => ['projection', horizon] as const,
  scheduledItems: ['scheduled-items'] as const,
  aiStatus: ['ai', 'status'] as const,
};

const ENTRY_DERIVED = [
  queryKeys.accounts,
  queryKeys.transactions,
  queryKeys.reports,
  queryKeys.projection,
  queryKeys.projects,
  queryKeys.scheduledItems,
];

export function refetchEntryDerived(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    ENTRY_DERIVED.map((queryKey) =>
      queryClient.refetchQueries({ queryKey }, { throwOnError: true }),
    ),
  ).then(() => undefined);
}
