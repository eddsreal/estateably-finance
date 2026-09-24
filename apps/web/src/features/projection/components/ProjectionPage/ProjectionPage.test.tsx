import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { invalidateEntryDerived } from '../../../../shared/lib/query-keys';
import { ProjectionPage } from './ProjectionPage';

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-10-01',
    scheduledItemId: '7',
    description: 'Rent',
    kind: 'bill',
    amount: '120000',
    runningBalance: '325750',
    overdue: false,
    ...overrides,
  };
}

function stubProjection(body: Record<string, unknown>) {
  stubApi({
    'GET /projection': (url: URL) => ({
      body: { horizon: url.searchParams.get('horizon'), ...body },
    }),
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectionPage', () => {
  it('shows the running series in dollars only, with the final balance (SC-009)', async () => {
    stubProjection({
      startingBalance: '445750',
      finalBalance: '545750',
      occurrences: [
        occurrence(),
        occurrence({
          date: '2026-10-05',
          scheduledItemId: '8',
          description: 'Salary',
          kind: 'income',
          amount: '300000',
          runningBalance: '625750',
        }),
      ],
    });
    renderPage();
    expect(await screen.findByRole('status', { name: 'Current total' })).toHaveTextContent(
      '$4,457.50',
    );
    expect(screen.getByRole('status', { name: /^Projected on / })).toHaveTextContent('$5,457.50');
    expect(screen.getByText('-$1,200.00')).toBeInTheDocument();
    expect(screen.getByText('$3,257.50')).toBeInTheDocument();
    expect(screen.getByText('$6,257.50')).toBeInTheDocument();
    expect(screen.queryByText('445750')).not.toBeInTheDocument();
    expect(screen.queryByText('Below zero')).not.toBeInTheDocument();
  });

  it('flags below-zero and overdue occurrences with text, not colour alone (FR-026/FR-034)', async () => {
    stubProjection({
      startingBalance: '100000',
      finalBalance: '-20000',
      occurrences: [occurrence({ date: '2026-08-15', overdue: true, runningBalance: '-20000' })],
    });
    renderPage();
    expect(await screen.findByText('Below zero')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getAllByText('-$200.00').length).toBeGreaterThanOrEqual(1);
  });

  it('bounds the horizon picker to 24 months and refetches on change', async () => {
    stubProjection({ startingBalance: '445750', finalBalance: '445750', occurrences: [] });
    renderPage();
    const input = await screen.findByLabelText('Project up to');
    const max = input.getAttribute('max');
    const min = input.getAttribute('min');
    expect(min).toBeTruthy();
    expect(max).toBeTruthy();
    const monthsAhead =
      (Number(max!.slice(0, 4)) - Number(min!.slice(0, 4))) * 12 +
      (Number(max!.slice(5, 7)) - Number(min!.slice(5, 7)));
    expect(monthsAhead).toBe(24);

    fireEvent.change(input, { target: { value: '2026-12-31' } });
    expect(await screen.findByText('Projected on 2026-12-31')).toBeInTheDocument();
  });

  it('shows the empty state and refetches when entry-derived queries are invalidated (FR-028)', async () => {
    stubProjection({ startingBalance: '445750', finalBalance: '445750', occurrences: [] });
    const { queryClient } = renderPage();
    expect(await screen.findByText('Nothing scheduled before this date')).toBeInTheDocument();

    stubProjection({
      startingBalance: '345750',
      finalBalance: '225750',
      occurrences: [occurrence({ runningBalance: '225750' })],
    });
    await invalidateEntryDerived(queryClient);
    expect((await screen.findAllByText('$2,257.50')).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Nothing scheduled before this date')).not.toBeInTheDocument();
  });
});
