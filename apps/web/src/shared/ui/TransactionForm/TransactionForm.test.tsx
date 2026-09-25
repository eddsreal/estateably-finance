import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, localToday } from '../../lib/dates';
import { Routes, stubApi } from '../../../test-api-stub';
import { ToastProvider, useToast } from '../Toast/Toast';
import { EditableTransaction, TransactionForm } from './TransactionForm';

const accounts = [
  { id: 'a1', name: 'Checking', archived: false },
  { id: 'a2', name: 'Savings', archived: false },
  { id: 'a3', name: 'Old Bank', archived: true },
];
const categories = [
  { id: 'c1', name: 'Groceries', type: 'expense' as const, archived: false },
  { id: 'c2', name: 'Salary', type: 'income' as const, archived: false },
];

let sent: Record<string, unknown> | null = null;

function renderForm(transaction: EditableTransaction | null = null) {
  sent = null;
  stubApi({
    'POST /transactions': (_url: URL, init?: RequestInit) => {
      sent = JSON.parse(init?.body as string);
      return { status: 201, body: {} };
    },
  });
  const onDone = vi.fn<() => void>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransactionForm
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        projects={[]}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onDone };
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  await user.click(screen.getByRole('combobox', { name }));
  await user.click(screen.getByRole('option', { name: option }));
}

async function amountMessage(value: string) {
  const { user } = renderForm();
  await user.type(screen.getByLabelText('Amount'), value);
  await user.click(screen.getByRole('button', { name: 'Record transaction' }));
  expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
  return screen.getByLabelText('Amount').getAttribute('aria-describedby');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TransactionForm', () => {
  it('leaves archived accounts out of both account pickers of a new transaction', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    expect(screen.queryByRole('option', { name: /Old Bank/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('radio', { name: 'Transfer' }));
    await user.click(screen.getByRole('combobox', { name: 'To account' }));
    expect(screen.queryByRole('option', { name: /Old Bank/ })).not.toBeInTheDocument();
  });

  it('shows the fields each type requires and carries amount, date and description over', async () => {
    const { user } = renderForm();
    const date = addDays(localToday(), -3);
    await user.type(screen.getByLabelText('Amount'), '42.5');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), date);
    await user.type(screen.getByLabelText('Description'), 'Market');
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Project/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Transfer' }));
    expect(screen.getByRole('combobox', { name: 'From account' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'To account' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Project/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByRole('combobox', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Project/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('42.50');
    expect(screen.getByLabelText('Date')).toHaveValue(date);
    expect(screen.getByLabelText('Description')).toHaveValue('Market');

    await pick(user, 'Account', 'Checking');
    await pick(user, 'Category', 'Salary');
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    await vi.waitFor(() =>
      expect(sent).toEqual({
        kind: 'income',
        date,
        description: 'Market',
        amount: '4250',
        accountId: 'a1',
        categoryId: 'c2',
      }),
    );
  });

  it.each(['1234.5', '1,234.50', '$1,234.50'])('accepts %s as 1,234.50', async (value) => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Amount'), value);
    await user.type(screen.getByLabelText('Description'), 'Rent');
    await pick(user, 'Account', 'Checking');
    await pick(user, 'Category', 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    await vi.waitFor(() => expect(sent).toMatchObject({ kind: 'expense', amount: '123450' }));
  });

  it.each([
    ['1,250.505', 'Use at most 2 decimal places, like 250.50.'],
    ['-350', 'Leave out the sign. The type sets which way the money moves.'],
    ['0', 'Enter an amount greater than 0.00.'],
    ['not money', 'Enter a dollar amount like 1,234.50.'],
  ])('rejects the amount %s under Amount with a message naming the fix', async (value, message) => {
    const describedBy = await amountMessage(value);
    const error = screen.getByText(message);
    expect(error.closest('p')).toHaveAttribute('id', describedBy);
    expect(sent).toBeNull();
  });

  it('asks for an amount and a description when they are empty', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(screen.getByText('Enter an amount, like 42.50.')).toBeInTheDocument();
    expect(screen.getByText('Add a description.')).toBeInTheDocument();
    expect(screen.getByText('Choose an account.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a future date under Date and suggests scheduling it', async () => {
    const { user } = renderForm();
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), addDays(localToday(), 5));
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText("Date can't be in the future. Schedule it instead.").closest('p'),
    ).toHaveAttribute('id', 'transaction-date-error');
  });

  it('rejects a transfer whose To account equals From under To', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Transfer' }));
    await pick(user, 'To account', 'Savings');
    await pick(user, 'From account', 'Savings');
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.type(screen.getByLabelText('Description'), 'To savings');
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(screen.getByRole('combobox', { name: 'To account' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByText('Choose a different account than From account.').closest('p'),
    ).toHaveAttribute('id', 'transaction-counter-account-error');
    expect(sent).toBeNull();
  });

  it('rejects a description over 120 characters', async () => {
    const { user } = renderForm();
    await user.click(screen.getByLabelText('Description'));
    await user.paste('x'.repeat(121));
    expect(screen.getByText('121/120')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    expect(
      screen.getByText('Shorten the description to 120 characters or fewer.'),
    ).toBeInTheDocument();
  });
});

describe('TransactionForm undo', () => {
  const existing: EditableTransaction = {
    id: 't9',
    kind: 'expense',
    date: '2026-09-10',
    description: 'Market',
    amount: '4250',
    accountId: 'a1',
    categoryId: 'c1',
  };

  function HoldUndo() {
    const { show } = useToast();
    return (
      <button
        type="button"
        onClick={() =>
          show({
            kind: 'undo',
            message: 'Transaction recorded.',
            transactionId: 't9',
            onUndo: () => Promise.resolve(),
          })
        }
      >
        hold t9
      </button>
    );
  }

  function renderWithToasts(
    transaction: EditableTransaction | null,
    routes: Routes,
    confirmDelete = false,
  ) {
    document.documentElement.style.setProperty('--dur-undo', '5s');
    const deletes: string[] = [];
    stubApi({
      'POST /transactions': () => ({ status: 201, body: existing }),
      'PUT /transactions/t9': { ...existing },
      'DELETE /transactions/t9': (url: URL) => {
        deletes.push(url.pathname);
        return { status: 204, body: null };
      },
      ...routes,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <HoldUndo />
          <TransactionForm
            transaction={transaction}
            accounts={accounts}
            categories={categories}
            projects={[]}
            onDone={() => undefined}
            confirmDelete={confirmDelete}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    return { user: userEvent.setup(), deletes };
  }

  async function record(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Amount'), '42.50');
    await user.type(screen.getByLabelText('Description'), 'Market');
    await pick(user, 'Account', 'Checking');
    await pick(user, 'Category', 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
  }

  afterEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('offers Undo on a create, which deletes the new id through the delete path', async () => {
    const { user, deletes } = renderWithToasts(null, {});
    await record(user);
    await user.click(await screen.findByRole('button', { name: /^Undo/ }));
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Transaction removed.')).toBeInTheDocument();
    expect(deletes).toEqual(['/transactions/t9']);
  });

  it('shows the error toast with its correlation id when the Undo delete fails', async () => {
    const { user } = renderWithToasts(null, {
      'DELETE /transactions/t9': () => ({
        status: 404,
        body: { code: 'NOT_FOUND', message: 'Transaction not found.', correlationId: 'C-42' },
      }),
    });
    await record(user);
    await user.click(await screen.findByRole('button', { name: /^Undo/ }));
    expect(await screen.findByText('Transaction not found.')).toBeInTheDocument();
    expect(screen.getByText('Correlation ID C-42')).toBeInTheDocument();
    expect(screen.queryByText('Transaction removed.')).not.toBeInTheDocument();
  });

  it('closes the held Undo on a save of that id and offers no Undo for the edit', async () => {
    const { user } = renderWithToasts(existing, {});
    await user.click(screen.getByRole('button', { name: 'hold t9' }));
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Transaction saved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
  });

  it('opens with the delete confirmation showing when confirmDelete is set, and Keep it keeps it', async () => {
    const { user, deletes } = renderWithToasts(existing, {}, true);
    const confirm = screen.getByRole('group', {
      name: "Delete “Market”? This can't be undone.",
    });
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toHaveAttribute(
      'data-autofocus',
    );
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(confirm).not.toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Market');
    expect(deletes).toEqual([]);
  });

  it('deletes through the form delete path on confirm, closing a held Undo of that id', async () => {
    const { user, deletes } = renderWithToasts(existing, {}, true);
    await user.click(screen.getByRole('button', { name: 'hold t9' }));
    await user.click(screen.getByRole('button', { name: 'Delete transaction' }));
    expect(await screen.findByText('Transaction deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    expect(deletes).toEqual(['/transactions/t9']);
  });

  it('never shows the confirmation without confirmDelete, keeping the feature 001 Delete', () => {
    renderWithToasts(existing, {});
    expect(screen.queryByRole('button', { name: 'Delete transaction' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('closes the held Undo on a delete of that id and offers no Undo for the delete', async () => {
    const { user, deletes } = renderWithToasts(existing, {});
    await user.click(screen.getByRole('button', { name: 'hold t9' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Transaction deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    expect(deletes).toHaveLength(1);
  });
});

describe('TransactionForm on a phone', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubPhone() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.startsWith('(width <'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  it('drives the amount of a new transaction with the keypad and sends the same cents', async () => {
    stubPhone();
    const { user } = renderForm();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'none');
    for (const name of ['1', '8', 'Decimal point', '4', '0', '7']) {
      await user.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByLabelText('Amount')).toHaveValue('18.40');
    await user.type(screen.getByLabelText('Description'), 'Uber');
    await pick(user, 'Account', 'Checking');
    await pick(user, 'Category', 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Record transaction' }));
    await vi.waitFor(() => expect(sent).toMatchObject({ kind: 'expense', amount: '1840' }));
  });

  it('keeps the typed amount field when editing, even on a phone', () => {
    stubPhone();
    renderForm({
      id: 't1',
      kind: 'expense',
      date: '2026-09-10',
      description: 'Market',
      amount: '4250',
      accountId: 'a1',
      categoryId: 'c1',
    });
    expect(screen.queryByRole('group', { name: 'Keypad' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'decimal');
  });

  it('shows no keypad at desktop width', () => {
    renderForm();
    expect(screen.queryByRole('group', { name: 'Keypad' })).not.toBeInTheDocument();
  });
});
