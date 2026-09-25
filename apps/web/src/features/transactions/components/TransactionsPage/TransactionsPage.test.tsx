import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { ToastProvider, useToast } from '../../../../shared/ui/Toast/Toast';
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
      'GET /transactions': () => ({
        status: 500,
        body: { code: 'INTERNAL', message: 'Something broke.', correlationId: 'c-tx' },
      }),
    });
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent(
      'Loading transactions…',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Correlation ID c-tx');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('-$42.50')).not.toBeInTheDocument();
  });

  it('offers Clear filters as the one action when filters match nothing', async () => {
    stubAll({
      'GET /transactions': (url: URL) => ({
        body: url.searchParams.has('kind')
          ? { items: [], total: 0, limit: 50, offset: 0 }
          : transactions,
      }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('-$42.50');
    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(await screen.findByText('No transactions match these filters')).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('-$42.50')).toBeInTheDocument();
  });
});

function Flash() {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        show({
          kind: 'undo',
          message: 'Transaction recorded.',
          transactionId: '100',
          onUndo: () => Promise.resolve(),
        })
      }
    >
      flash
    </button>
  );
}

describe('TransactionsPage new-row highlight', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('highlights only the flashed row for --dur-flash, fading only when motion is allowed', async () => {
    document.documentElement.style.setProperty('--dur-undo', '5s');
    document.documentElement.style.setProperty('--dur-flash', '0.05s');
    stubAll();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <Flash />
          <TransactionsPage />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const row = (name: string) => screen.getByRole('button', { name }).closest('tr');
    await screen.findByRole('button', { name: 'Market' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'flash' }));
    expect(row('Market')?.className).toContain('motion-safe:animate-flash');
    expect(row('Market')?.className).toContain('motion-reduce:bg-accent-highlight');
    expect(screen.getByText('To savings').closest('tr')?.className).not.toContain('animate-flash');
    await vi.waitFor(() => expect(row('Market')?.className).not.toContain('animate-flash'));
  });
});

describe('TransactionsPage row actions and phone layout', () => {
  function stubPhone() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.startsWith('(width <'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  function swipe(row: HTMLElement, from: number, to: number) {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 64));
    fireEvent.pointerDown(row, { clientX: from });
    fireEvent.pointerMove(row, { clientX: to });
    fireEvent.pointerUp(row, { clientX: to });
  }

  it('gives every editable row a ⋯ menu whose Delete opens the edit form with its confirmation', async () => {
    stubAll();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Actions for Market' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Actions for To savings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByLabelText('Description')).toHaveValue('To savings');
    expect(screen.queryByRole('button', { name: 'Delete transaction' })).not.toBeInTheDocument();
  });

  it('lists rows on a phone, where a long left swipe asks to delete and a right swipe edits', async () => {
    stubPhone();
    stubAll();
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole('list', { name: 'Transactions' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const row = within(list).getByRole('button', { name: 'Market' }).closest('.touch-pan-y');
    swipe(row as HTMLElement, 300, 250);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    swipe(row as HTMLElement, 350, 150);
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    swipe(row as HTMLElement, 50, 250);
    expect(screen.getByLabelText('Description')).toHaveValue('Market');
    expect(screen.queryByRole('button', { name: 'Delete transaction' })).not.toBeInTheDocument();
  });

  it('opens New transaction as a sheet with the keypad on a phone', async () => {
    stubPhone();
    stubAll();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'New transaction' }));
    const sheet = screen.getByRole('dialog', { name: 'New transaction' });
    expect(sheet.className).toContain('open:animate-sheet');
    expect(within(sheet).getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });
});
