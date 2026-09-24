import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { refetchEntryDerived } from '../../../../shared/lib/query-keys';
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
  it('shows a busy skeleton, then the error with its correlation id and Try again', async () => {
    stubApi({
      'GET /projection': () => ({
        status: 500,
        body: { code: 'INTERNAL', message: 'Something broke.', correlationId: 'c-proj' },
      }),
    });
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent('Loading projection…');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correlation ID c-proj');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

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
    expect(screen.queryByText('Below $0.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Shortfall' })).not.toBeInTheDocument();
    expect(screen.getByText(/^2 payments · final balance on /)).toBeInTheDocument();
  });

  it('flags below-zero and overdue occurrences with text, not colour alone (FR-026/FR-034)', async () => {
    stubProjection({
      startingBalance: '100000',
      finalBalance: '-20000',
      occurrences: [occurrence({ date: '2026-08-15', overdue: true, runningBalance: '-20000' })],
    });
    renderPage();
    expect(await screen.findByText('Below $0.00')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getAllByText('-$200.00').length).toBeGreaterThanOrEqual(1);
  });

  it('marks only the first payment below $0.00 and summarises the lowest point and later periods (FR-010)', async () => {
    stubProjection({
      startingBalance: '100000',
      finalBalance: '175500',
      occurrences: [
        occurrence({ date: '2026-10-01', runningBalance: '-20000' }),
        occurrence({
          date: '2026-10-05',
          scheduledItemId: '8',
          description: 'Salary',
          kind: 'income',
          amount: '300000',
          runningBalance: '280000',
        }),
        occurrence({
          date: '2026-11-01',
          scheduledItemId: '9',
          description: 'Tuition',
          amount: '400000',
          runningBalance: '-120000',
        }),
        occurrence({
          date: '2026-11-03',
          scheduledItemId: '10',
          description: 'Gym',
          amount: '4500',
          runningBalance: '-124500',
        }),
        occurrence({
          date: '2026-11-05',
          scheduledItemId: '8',
          description: 'Salary',
          kind: 'income',
          amount: '300000',
          runningBalance: '175500',
        }),
      ],
    });
    renderPage();
    expect(await screen.findByRole('row', { name: /Rent/ })).toHaveTextContent('Below $0.00');
    expect(screen.getAllByText('Below $0.00')).toHaveLength(1);
    expect(screen.getByRole('row', { name: /Tuition/ })).not.toHaveTextContent('Below $0.00');
    expect(screen.getByRole('row', { name: /Tuition/ })).toHaveTextContent('-$1,200.00');
    expect(screen.getAllByRole('row', { name: /Salary/ })[0]).toHaveTextContent('+$3,000.00');

    const summary = screen.getByRole('region', { name: 'Shortfall' });
    expect(summary).toHaveTextContent('Goes below $0.00 on 1 Oct 2026');
    expect(within(summary).getByText('-$200.00')).toBeInTheDocument();
    expect(summary).toHaveTextContent('Lowest -$1,245.00 on 3 Nov 2026.');
    expect(summary).toHaveTextContent('Below zero again 1 Nov 2026 – 4 Nov 2026.');

    const chart = await screen.findByRole('slider', { name: 'Projected balance by day' });
    expect(chart.getAttribute('aria-valuetext')).toContain('$2,800.00');
  });

  it('offers 3M/6M/12M/24M shortcuts and rejects dates beyond 24 months', async () => {
    const requested: string[] = [];
    stubApi({
      'GET /projection': (url: URL) => {
        const horizon = url.searchParams.get('horizon')!;
        requested.push(horizon);
        return {
          body: { horizon, startingBalance: '445750', finalBalance: '445750', occurrences: [] },
        };
      },
    });
    renderPage();
    const input = await screen.findByLabelText('Project up to');
    expect(screen.getAllByRole('button', { name: /^\d+M$/ }).map((b) => b.textContent)).toEqual([
      '3M',
      '6M',
      '12M',
      '24M',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '24M' }));
    expect(screen.getByRole('button', { name: '24M' })).toHaveAttribute('aria-pressed', 'true');
    expect(input).toHaveValue(input.getAttribute('max'));
    await screen.findByText(/^Projected on /);
    expect(requested).toContain(input.getAttribute('max'));

    const count = requested.length;
    fireEvent.change(input, { target: { value: '2099-01-01' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/^Choose a date from today to /)).toBeInTheDocument();
    expect(requested).toHaveLength(count);
    expect(requested).not.toContain('2099-01-01');
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
    expect(await screen.findByText('Projected on 31 Dec 2026')).toBeInTheDocument();
  });

  it('shows the empty state and refetches when entry-derived queries are invalidated (FR-028)', async () => {
    stubProjection({ startingBalance: '445750', finalBalance: '445750', occurrences: [] });
    const { queryClient } = renderPage();
    expect(await screen.findByText(/^Nothing scheduled before /)).toBeInTheDocument();
    expect(
      screen.getByText('The balance stays at $4,457.50. Schedule a payment or pick a later date.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule payment' })).toBeInTheDocument();

    stubProjection({
      startingBalance: '345750',
      finalBalance: '225750',
      occurrences: [occurrence({ runningBalance: '225750' })],
    });
    await refetchEntryDerived(queryClient);
    expect((await screen.findAllByText('$2,257.50')).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^Nothing scheduled before /)).not.toBeInTheDocument();
  });
});
