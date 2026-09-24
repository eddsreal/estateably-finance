import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys, refetchEntryDerived } from './query-keys';

function seeded(failing: readonly unknown[] | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls: unknown[] = [];
  let armed = false;
  const seed = (queryKey: readonly unknown[]) =>
    queryClient.fetchQuery({
      queryKey,
      queryFn: () => {
        calls.push(queryKey[0]);
        if (armed && queryKey === failing) throw new Error('refetch failed');
        return 1;
      },
    });
  const arm = () => {
    armed = true;
    calls.length = 0;
  };
  return { queryClient, calls, seed, arm };
}

describe('refetchEntryDerived', () => {
  it('refetches every entry-derived query and resolves', async () => {
    const { queryClient, calls, seed, arm } = seeded(null);
    await seed(queryKeys.accountsList(false));
    await seed(queryKeys.reportMonthly('2026-09'));
    arm();
    await expect(refetchEntryDerived(queryClient)).resolves.toBeUndefined();
    expect(calls.sort()).toEqual(['accounts', 'reports']);
  });

  it('rejects when any refetch fails', async () => {
    const projection = queryKeys.projectionAt('2027-03-01');
    const { queryClient, seed, arm } = seeded(projection);
    await seed(queryKeys.accountsList(false));
    await seed(projection);
    arm();
    await expect(refetchEntryDerived(queryClient)).rejects.toThrow('refetch failed');
  });
});
