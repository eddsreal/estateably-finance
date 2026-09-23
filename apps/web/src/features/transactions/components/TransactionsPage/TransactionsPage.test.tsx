import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { TransactionsPage } from './TransactionsPage';

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '150000',
      openingDate: '2026-09-01',
      archived: false,
      balance: '445750',
    },
    {
      id: '2',
      name: 'Savings',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '50000',
    },
  ],
  totalBalance: '495750',
};

const categories = [
  { id: '1', name: 'Groceries', type: 'expense', archived: false },
  { id: '10', name: 'Salary', type: 'income', archived: false },
];

const transactions = {
  items: [
    {
      id: '100',
      kind: 'expense',
      date: '2026-09-10',
      description: 'Market',
      amount: '4250',
      accountId: '1',
      categoryId: '1',
    },
    {
      id: '101',
      kind: 'transfer',
      date: '2026-09-11',
      description: 'To savings',
      amount: '50000',
      accountId: '1',
      counterAccountId: '2',
    },
  ],
  total: 87,
  limit: 50,
  offset: 0,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionsPage />
    </QueryClientProvider>,
  );
}

function stubAll() {
  stubApi({
    'GET /accounts': accounts,
    'GET /categories': categories,
    'GET /transactions': transactions,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('TransactionsPage', () => {
  it('renders amounts in dollars with sign and kind chips, never raw cents (SC-009)', async () => {
    stubAll();
    renderPage();
    expect(await screen.findByText('-$42.50')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.queryByText('4250')).not.toBeInTheDocument();
    expect(screen.getByText('Checking → Savings')).toBeInTheDocument();
    expect(screen.getByText('1–50 of 87')).toBeInTheDocument();
  });

  it('switches the form fields with the kind: transfer drops the category and requires a destination', async () => {
    stubAll();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('-$42.50');
    await user.click(screen.getByRole('button', { name: 'New transaction' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Category')).toBeInTheDocument();
    expect(dialog.getByLabelText('Amount')).toHaveFocus();
    await user.click(dialog.getByRole('radio', { name: 'Transfer' }));
    expect(dialog.queryByLabelText('Category')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('To account')).toBeInTheDocument();
    expect(dialog.getByLabelText('From account')).toBeInTheDocument();
  });

  it('opens the edit form pre-filled when a row is clicked', async () => {
    stubAll();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Market' }));
    expect(screen.getByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Market');
    expect(screen.getByLabelText('Amount')).toHaveValue('42.50');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('keeps the report honest on refetch failure: no stale rows, an explanation and a retry', async () => {
    stubApi({
      'GET /accounts': accounts,
      'GET /categories': categories,
      'GET /transactions': () => ({ status: 500, body: { message: 'down' } }),
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('-$42.50')).not.toBeInTheDocument();
  });
});
