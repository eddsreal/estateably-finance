import { useQuery } from '@tanstack/react-query';
import type { components } from 'contract/src/types';
import { KeyboardEvent, ReactNode, useEffect, useId, useState } from 'react';
import { api, unwrap } from '../../lib/api';
import { formatDay } from '../../lib/dates';
import { queryKeys } from '../../lib/query-keys';
import { Amount } from '../Amount/Amount';
import { Icon, ICONS } from '../Icon/Icon';
import { Kind, KindGlyph } from '../KindGlyph/KindGlyph';
import { Modal } from '../Modal/Modal';

export type TransactionResult = components['schemas']['TransactionResponse'];

export type PaletteCommand = {
  group: 'Reports' | 'Actions';
  label: string;
  hint: string;
  glyph: ReactNode;
  run: () => void;
};

type PaletteItem = {
  group: 'Transactions' | PaletteCommand['group'];
  key: string;
  run: (() => void) | null;
  row: {
    glyph: ReactNode;
    label: string;
    hint: string;
    right: ReactNode;
  };
};

const GROUPS = ['Transactions', 'Reports', 'Actions'] as const;

const SEARCH_LIMIT = 8;
const DEBOUNCE = 200;

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  onOpenTransaction: (transaction: TransactionResult) => void;
};

export function CommandPalette({ open, onClose, ...rest }: CommandPaletteProps) {
  return (
    <Modal title="Command palette" open={open} onClose={onClose} variant="palette">
      <PaletteBody onClose={onClose} {...rest} />
    </Modal>
  );
}

function TransactionAmount({ kind, amount }: { kind: string; amount: string }) {
  if (kind === 'expense') return <Amount cents={`-${amount}`} />;
  if (kind === 'income') return <Amount cents={amount} sign="always" />;
  return <Amount cents={amount} />;
}

function PaletteBody({ onClose, commands, onOpenTransaction }: Omit<CommandPaletteProps, 'open'>) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const search = debounced.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE);
    return () => clearTimeout(timer);
  }, [query]);

  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });
  const searchQuery = useQuery({
    queryKey: queryKeys.transactionSearch(search),
    queryFn: () =>
      unwrap(api.GET('/transactions', { params: { query: { q: search, limit: SEARCH_LIMIT } } })),
    enabled: search !== '',
  });

  const accountName = (id?: string) =>
    accountsQuery.data?.items.find((account) => account.id === id)?.name ?? '';
  const categoryName = (id?: string) =>
    categoriesQuery.data?.find((category) => category.id === id)?.name;

  const found = search !== '' ? searchQuery.data : undefined;
  const needle = query.trim().toLowerCase();

  const transactionItems: PaletteItem[] = (found?.items ?? []).map((transaction) => ({
    group: 'Transactions' as const,
    key: `transaction-${transaction.id}`,
    run: transaction.kind === 'opening' ? null : () => onOpenTransaction(transaction),
    row: {
      glyph: <KindGlyph kind={transaction.kind as Kind} />,
      label: transaction.description,
      hint: [
        formatDay(transaction.date),
        transaction.kind === 'transfer'
          ? `${accountName(transaction.accountId)} → ${accountName(transaction.counterAccountId)}`
          : accountName(transaction.accountId),
        categoryName(transaction.categoryId),
      ]
        .filter(Boolean)
        .join(' · '),
      right: <TransactionAmount kind={transaction.kind} amount={transaction.amount} />,
    },
  }));
  const commandItems: PaletteItem[] = commands
    .filter((command) => command.label.toLowerCase().includes(needle))
    .map((command) => ({
      group: command.group,
      key: `${command.group}-${command.label}`,
      run: () => {
        onClose();
        command.run();
      },
      row: {
        glyph: (
          <span
            aria-hidden="true"
            className="grid size-28 flex-none place-items-center rounded-sm bg-sand-200 text-14 font-semibold"
          >
            {command.glyph}
          </span>
        ),
        label: command.label,
        hint: command.hint,
        right: null,
      },
    }));
  const ordered = GROUPS.flatMap((group) =>
    [...transactionItems, ...commandItems].filter((item) => item.group === group),
  );
  const count = (found?.total ?? 0) + commandItems.length;
  const current = Math.min(active, ordered.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (ordered.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + ordered.length) % ordered.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      ordered[current]?.run?.();
    }
  }

  return (
    <div>
      <div className="flex h-62 items-center gap-12 border-b border-sand-200 px-20">
        <span className="text-text-3">
          <Icon path={ICONS.search} size="size-19" />
        </span>
        <input
          data-autofocus
          type="text"
          role="combobox"
          aria-label="Search transactions, reports and actions"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={ordered.length > 0 ? optionId(current) : undefined}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-18 text-text-1 outline-none placeholder:text-text-3"
          placeholder="Search transactions, reports and actions"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="rounded-sm border border-sand-500 px-7 py-3 font-mono text-11 text-text-3">
          ESC
        </kbd>
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Results"
        className="m-0 flex list-none flex-col gap-4 p-8"
      >
        {GROUPS.map((group) => {
          const members = ordered.filter((item) => item.group === group);
          if (members.length === 0) return null;
          const headingId = `${listId}-${group}`;
          return (
            <li key={group} role="presentation">
              <ul role="group" aria-labelledby={headingId} className="m-0 list-none p-0">
                <li
                  id={headingId}
                  role="presentation"
                  className="px-12 pt-10 pb-4 font-mono text-10 tracking-widest text-text-3 uppercase"
                >
                  {group}
                </li>
                {members.map((item) => {
                  const index = ordered.indexOf(item);
                  const selected = index === current;
                  return (
                    <li
                      key={item.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={item.run === null || undefined}
                      className={`flex h-52 items-center gap-12 rounded-lg px-12 ${item.run ? 'cursor-pointer' : 'cursor-default'} ${selected ? 'bg-accent-highlight shadow-selected' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        item.run?.();
                      }}
                    >
                      {item.row.glyph}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-14 font-medium">{item.row.label}</span>
                        <span className="truncate text-12 text-text-3">{item.row.hint}</span>
                      </span>
                      {item.row.right && <span className="text-13">{item.row.right}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      {ordered.length === 0 && (
        <p className="m-0 px-20 pb-16 text-14 text-text-2">
          {searchQuery.isError ? "The search couldn't run. Try again." : 'No results.'}
        </p>
      )}
      <div className="flex gap-16 border-t border-sand-200 bg-sand-50 px-20 py-10 text-12 text-text-3">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
        <output className="ml-auto">{count === 1 ? '1 result' : `${count} results`}</output>
      </div>
    </div>
  );
}
