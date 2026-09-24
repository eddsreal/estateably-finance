import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../test-api-stub';
import { CommandPalette, PaletteCommand, TransactionResult } from './CommandPalette';

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '0',
    },
    {
      id: '2',
      name: 'Visa Platinum',
      kind: 'card',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '0',
    },
  ],
  totalBalance: '0',
};

const categories = [{ id: '7', name: 'Transport', type: 'expense', archived: false }];

const found: TransactionResult[] = [
  {
    id: '30',
    kind: 'expense',
    date: '2026-09-20',
    description: 'Uber transfer fee',
    amount: '1290',
    accountId: '2',
    categoryId: '7',
  },
  {
    id: '29',
    kind: 'transfer',
    date: '2026-09-19',
    description: 'Transfer to card',
    amount: '5000',
    accountId: '1',
    counterAccountId: '2',
  },
];

function stubAll() {
  const searches: URLSearchParams[] = [];
  stubApi({
    'GET /accounts': accounts,
    'GET /categories': categories,
    'GET /transactions': (url: URL) => {
      searches.push(url.searchParams);
      const hit = url.searchParams.get('q') === 'trans';
      return { body: { items: hit ? found : [], total: hit ? 11 : 0, limit: 8, offset: 0 } };
    },
  });
  return searches;
}

function commandsWith(run: () => void): PaletteCommand[] {
  return [
    { group: 'Reports', label: 'Transactions', hint: 'Screen', glyph: '≡', run },
    { group: 'Reports', label: 'Similar transactions', hint: 'Screen', glyph: '≋', run },
    { group: 'Reports', label: 'Projection', hint: 'Screen', glyph: '↗', run },
    { group: 'Actions', label: 'New transaction', hint: 'Record one', glyph: '+', run },
  ];
}

function Harness({
  commands,
  onOpenTransaction,
}: {
  commands: PaletteCommand[];
  onOpenTransaction: (transaction: TransactionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Search
      </button>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        commands={commands}
        onOpenTransaction={(transaction) => {
          setOpen(false);
          onOpenTransaction(transaction);
        }}
      />
    </>
  );
}

function renderPalette(
  run = vi.fn<() => void>(),
  onOpenTransaction = vi.fn<(transaction: TransactionResult) => void>(),
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness commands={commandsWith(run)} onOpenTransaction={onOpenTransaction} />
    </QueryClientProvider>,
  );
  return { run, onOpenTransaction };
}

async function openAndType(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Search' }));
  const input = screen.getByRole('combobox');
  expect(input).toHaveFocus();
  await user.keyboard(text);
  await screen.findByText('Uber transfer fee');
  return { user, input };
}

function expectActive(input: HTMLElement, name: RegExp) {
  const option = screen.getByRole('option', { name });
  expect(input).toHaveAttribute('aria-activedescendant', option.id);
  expect(option).toHaveAttribute('aria-selected', 'true');
}

afterEach(() => vi.unstubAllGlobals());

describe('CommandPalette', () => {
  it('groups results as Transactions, Reports and Actions with the total count', async () => {
    const searches = stubAll();
    renderPalette();
    await openAndType('trans');
    expect(searches.at(-1)?.get('q')).toBe('trans');
    expect(searches.at(-1)?.get('limit')).toBe('8');
    const listbox = screen.getByRole('listbox');
    const groups = within(listbox).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-labelledby')?.split('-').at(-1))).toEqual(
      ['Transactions', 'Reports', 'Actions'],
    );
    const [fee, transfer] = within(groups[0]).getAllByRole('option');
    expect(fee).toHaveTextContent(
      'Uber transfer fee20 Sep 2026 · Visa Platinum · Transport-$12.90',
    );
    expect(transfer).toHaveTextContent(
      'Transfer to card19 Sep 2026 · Checking → Visa Platinum$50.00',
    );
    expect(within(groups[1]).getAllByRole('option')).toHaveLength(2);
    expect(within(groups[2]).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('14 results');
  });

  it('moves through the flattened groups with the arrows, wrapping at both ends', async () => {
    stubAll();
    renderPalette();
    const { user, input } = await openAndType('trans');
    expect(screen.getAllByRole('option')).toHaveLength(5);
    expectActive(input, /Uber transfer fee/);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expectActive(input, /^Transactions/);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expectActive(input, /Uber transfer fee/);
    await user.keyboard('{ArrowUp}');
    expectActive(input, /New transaction/);
  });

  it('opens the highlighted transaction on Enter and returns focus to the opener', async () => {
    stubAll();
    const { onOpenTransaction } = renderPalette();
    const { user } = await openAndType('trans');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onOpenTransaction).toHaveBeenCalledWith(found[1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('closes, then runs a command on Enter', async () => {
    stubAll();
    const { run } = renderPalette();
    const { user } = await openAndType('trans');
    await user.keyboard('{ArrowUp}{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    stubAll();
    renderPalette();
    const { user } = await openAndType('trans');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('filters reports and actions on the client and searches nothing while empty', async () => {
    const searches = stubAll();
    renderPalette();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('status')).toHaveTextContent('4 results');
    await user.keyboard('proj');
    expect(screen.getAllByRole('option')).toEqual([
      screen.getByRole('option', { name: /Projection/ }),
    ]);
    await vi.waitFor(() => expect(searches.map((params) => params.get('q'))).toEqual(['proj']));
    expect(screen.getByRole('status')).toHaveTextContent('1 result');
  });
});
