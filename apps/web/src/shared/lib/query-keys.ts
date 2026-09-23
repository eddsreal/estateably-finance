import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  accounts: ['accounts'] as const,
  accountsList: (includeArchived: boolean) => ['accounts', 'list', includeArchived] as const,
  transactions: ['transactions'] as const,
  transactionsList: (filters: Record<string, string | number | undefined>) =>
    ['transactions', 'list', filters] as const,
  categories: ['categories'] as const,
  categoriesList: (includeArchived: boolean) => ['categories', 'list', includeArchived] as const,
  projects: ['projects'] as const,
  reports: ['reports'] as const,
  projection: ['projection'] as const,
};

const ENTRY_DERIVED = [
  queryKeys.accounts,
  queryKeys.transactions,
  queryKeys.reports,
  queryKeys.projection,
  queryKeys.projects,
];

export function invalidateEntryDerived(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    ENTRY_DERIVED.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}
