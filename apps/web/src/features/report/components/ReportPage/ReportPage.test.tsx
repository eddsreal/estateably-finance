import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { ReportPage } from './ReportPage';

const month = new Intl.DateTimeFormat('en-CA').format(new Date()).slice(0, 7);

const septemberReport = {
  month,
  grandTotal: '19250',
  categories: [
    {
      categoryId: '6',
      categoryName: 'Rent',
      total: '12000',
      transactions: [
        {
          id: '3',
          kind: 'expense',
          date: `${month}-01`,
          description: 'Monthly rent',
          amount: '12000',
          accountId: '1',
          categoryId: '6',
        },
      ],
    },
    {
      categoryId: '5',
      categoryName: 'Groceries',
      total: '7250',
      transactions: [
        {
          id: '1',
          kind: 'expense',
          date: `${month}-10`,
          description: 'Farmers market',
          amount: '3000',
          accountId: '1',
          categoryId: '5',
        },
        {
          id: '2',
          kind: 'expense',
          date: `${month}-05`,
          description: 'Market run',
          amount: '4250',
          accountId: '1',
          categoryId: '5',
        },
      ],
    },
  ],
};

const emptyReport = (reportMonth: string) => ({
  month: reportMonth,
  grandTotal: '0',
  categories: [],
});

function stubRoutes() {
  stubApi({
    'GET /reports/monthly': (url: URL) => {
      const requested = url.searchParams.get('month') ?? '';
      return { body: requested === month ? septemberReport : emptyReport(requested) };
    },
    'GET /accounts': {
      items: [
        {
          id: '1',
          name: 'Checking',
          kind: 'bank',
          openingBalance: '150000',
          openingDate: '2026-01-01',
          archived: false,
          balance: '445750',
        },
      ],
      totalBalance: '445750',
    },
    'GET /categories': [
      { id: '5', name: 'Groceries', type: 'expense', archived: false },
      { id: '6', name: 'Rent', type: 'expense', archived: false },
    ],
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ReportPage', () => {
  it('shows per-category totals and the grand total in dollars only (US3 #1, SC-009)', async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText('$192.50')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getAllByText('$120.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('$72.50')).toBeInTheDocument();
    expect(screen.queryByText('19250')).not.toBeInTheDocument();
    expect(screen.queryByText('7250')).not.toBeInTheDocument();
  });

  it('expands a category to the expenses behind its total (US3 #3)', async () => {
    stubRoutes();
    renderPage();
    await userEvent.click(await screen.findByText('Groceries'));
    expect(screen.getByRole('button', { name: 'Farmers market' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Market run' })).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$42.50')).toBeInTheDocument();
  });

  it('switches month in page state and shows the empty state for a month without expenses (US3 #2, #4)', async () => {
    stubRoutes();
    renderPage();
    await screen.findByText('$192.50');
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByText('No expenses this month')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByText('$192.50')).toBeInTheDocument();
  });

  it('opens the edit form when a drill-down expense is clicked', async () => {
    stubRoutes();
    renderPage();
    await userEvent.click(await screen.findByText('Groceries'));
    await userEvent.click(screen.getByRole('button', { name: 'Market run' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit transaction');
    expect(screen.getByLabelText('Description')).toHaveValue('Market run');
    expect(screen.getByLabelText('Amount')).toHaveValue('42.50');
  });
});
