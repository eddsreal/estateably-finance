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
      projectId: '5',
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

const projects = [
  { id: '5', name: 'Trip to France', status: 'active', spent: '4250', overBudget: false },
];

function stubAll(extra: Record<string, unknown> = {}) {
  stubApi({
    'GET /accounts': accounts,
    'GET /categories': categories,
    'GET /projects': projects,
    'GET /transactions': transactions,
    ...extra,
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
    expect(screen.getByText('1–50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
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

  it('offers a project only on expenses and keeps it on edit (FR-020)', async () => {
    let sent: { projectId?: string } | undefined;
    stubAll({
      'PUT /transactions/100': (_url: URL, init?: RequestInit) => {
        sent = JSON.parse(init?.body as string);
        return { body: transactions.items[0] };
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Market' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('combobox', { name: /Project/ })).toHaveTextContent('Trip to France');
    await user.click(dialog.getByRole('radio', { name: 'Income' }));
    expect(dialog.queryByRole('combobox', { name: /Project/ })).not.toBeInTheDocument();
    await user.click(dialog.getByRole('radio', { name: 'Expense' }));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(sent?.projectId).toBe('5'));
  });

  it('filters by type and project, then clears every filter at once (FR-008)', async () => {
    const seen: URLSearchParams[] = [];
    stubAll({
      'GET /transactions': (url: URL) => {
        seen.push(url.searchParams);
        return { body: transactions };
      },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('-$42.50');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Expense' }));
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Trip to France' }));
    await vi.waitFor(() => {
      const last = seen.at(-1)!;
      expect(last.get('kind')).toBe('expense');
      expect(last.get('projectId')).toBe('5');
    });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await vi.waitFor(() => {
      const last = seen.at(-1)!;
      expect(last.has('kind')).toBe(false);
      expect(last.has('projectId')).toBe(false);
    });
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('numbers the pages from the total and moves between them on limit/offset (FR-008)', async () => {
    const offsets: string[] = [];
    stubAll({
      'GET /transactions': (url: URL) => {
        const offset = url.searchParams.get('offset') ?? '0';
        offsets.push(offset);
        return { body: { ...transactions, total: 340, offset: Number(offset) } };
      },
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('340 results · newest first')).toBeInTheDocument();
    const pager = within(screen.getByRole('navigation', { name: 'Pagination' }));
    expect(pager.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(pager.getByRole('button', { name: 'Page 7' })).toBeInTheDocument();
    expect(pager.queryByRole('button', { name: 'Page 4' })).not.toBeInTheDocument();
    expect(pager.queryByRole('button', { name: /Previous/ })).not.toBeInTheDocument();

    await user.click(pager.getByRole('button', { name: /Next/ }));
    expect(await pager.findByText('51–100')).toBeInTheDocument();
    expect(offsets.at(-1)).toBe('50');
    expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    await user.click(pager.getByRole('button', { name: 'Page 7' }));
    expect(await pager.findByText('301–340')).toBeInTheDocument();
    expect(offsets.at(-1)).toBe('300');
    expect(pager.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();

    await user.click(pager.getByRole('button', { name: /Previous/ }));
    expect(await pager.findByText('251–300')).toBeInTheDocument();
    expect(offsets.at(-1)).toBe('250');
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
