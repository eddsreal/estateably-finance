import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, localToday } from '../../lib/dates';
import { stubApi } from '../../../test-api-stub';
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
