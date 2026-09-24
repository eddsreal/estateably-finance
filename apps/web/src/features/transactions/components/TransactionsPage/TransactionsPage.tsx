import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Picker } from '../../../../shared/ui/Picker/Picker';
import { Kind, KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import { Table } from '../../../../shared/ui/Table/Table';
import { useToast } from '../../../../shared/ui/Toast/Toast';
import {
  EditableTransaction,
  TransactionForm,
  TransactionKindChoice,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import {
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CHIP_CATEGORY,
  FIELD,
  INPUT,
  LABEL,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
  ROW_FLASH,
  SEGMENT,
  SEGMENTED,
  TD_AMOUNT,
  TOOLBAR,
  TOOLBAR_FIELD,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const PAGE_SIZE = 50;

const KIND_LABEL: Record<Kind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  opening: 'Opening',
};

const KIND_FILTERS = [
  { value: '', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'opening', label: 'Opening' },
];

const PAGE_BUTTON =
  'grid size-32 cursor-pointer place-items-center rounded-sm font-mono transition-colors duration-(--dur-hover) ease-(--ease-out) active:scale-97 active:duration-(--dur-press)';

function pageNumbers(current: number, count: number): (number | null)[] {
  const wanted = [...new Set([1, current - 1, current, current + 1, count])]
    .filter((number) => number >= 1 && number <= count)
    .sort((a, b) => a - b);
  return wanted.flatMap((number, index) =>
    index > 0 && number - wanted[index - 1] > 1 ? [null, number] : [number],
  );
}

function TransactionAmount({ kind, amount }: { kind: string; amount: string }) {
  if (kind === 'expense') return <Amount cents={`-${amount}`} />;
  if (kind === 'income') return <Amount cents={amount} sign="always" />;
  return <Amount cents={amount} />;
}

type Filters = {
  from?: string;
  to?: string;
  kind?: string;
  categoryId?: string;
  projectId?: string;
};

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const { flashId } = useToast();
  const [editing, setEditing] = useState<EditableTransaction | null>(null);

  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsList,
    queryFn: () => unwrap(api.GET('/projects')),
  });
  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactionsList({ ...filters, offset }),
    queryFn: () =>
      unwrap(
        api.GET('/transactions', {
          params: {
            query: {
              ...(filters.from ? { from: filters.from } : {}),
              ...(filters.to ? { to: filters.to } : {}),
              ...(filters.kind ? { kind: filters.kind as TransactionKindChoice } : {}),
              ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
              ...(filters.projectId ? { projectId: filters.projectId } : {}),
              limit: PAGE_SIZE,
              offset,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const categoryName = (id?: string) =>
    categories.find((category) => category.id === id)?.name ?? '';

  const projectName = (id?: string) => projects.find((project) => project.id === id)?.name;

  function setFilter(patch: Filters) {
    setFilters((current) => ({ ...current, ...patch }));
    setOffset(0);
  }

  function clearFilters() {
    setFilters({});
    setOffset(0);
  }

  const page = transactionsQuery.data;
  const hasFilters = Boolean(
    filters.from || filters.to || filters.kind || filters.categoryId || filters.projectId,
  );
  const pageCount = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <div>
          <h1 className={PAGE_TITLE}>Transactions</h1>
          {page && (
            <p className="text-14 text-text-2">
              {page.total === 1 ? '1 result' : `${page.total} results`} · newest first
            </p>
          )}
        </div>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New transaction
        </button>
      </div>
      <div className={TOOLBAR}>
        <div className={TOOLBAR_FIELD}>
          <label className={LABEL} htmlFor="filter-from">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            className={INPUT}
            value={filters.from ?? ''}
            onChange={(event) => setFilter({ from: event.target.value || undefined })}
          />
        </div>
        <div className={TOOLBAR_FIELD}>
          <label className={LABEL} htmlFor="filter-to">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            className={INPUT}
            value={filters.to ?? ''}
            onChange={(event) => setFilter({ to: event.target.value || undefined })}
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL} id="filter-kind">
            Type
          </span>
          <div role="radiogroup" aria-labelledby="filter-kind" className={SEGMENTED}>
            {KIND_FILTERS.map((choice) => (
              <label key={choice.label} className={`${SEGMENT} px-12`}>
                <input
                  type="radio"
                  name="filter-kind"
                  className="sr-only"
                  checked={(filters.kind ?? '') === choice.value}
                  onChange={() => setFilter({ kind: choice.value || undefined })}
                />
                {choice.label}
              </label>
            ))}
          </div>
        </div>
        <div className={TOOLBAR_FIELD}>
          <label className={LABEL} htmlFor="filter-category">
            Category
          </label>
          <Picker
            id="filter-category"
            value={filters.categoryId ?? null}
            onChange={(value) => setFilter({ categoryId: value ?? undefined })}
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            placeholder="All categories"
          />
        </div>
        <div className={TOOLBAR_FIELD}>
          <label className={LABEL} htmlFor="filter-project">
            Project
          </label>
          <Picker
            id="filter-project"
            value={filters.projectId ?? null}
            onChange={(value) => setFilter({ projectId: value ?? undefined })}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            placeholder="All projects"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            className={`${LINK} ml-auto h-42 cursor-pointer text-13`}
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>
      {transactionsQuery.isError ? (
        <ErrorNotice
          title="The transactions couldn't load."
          error={transactionsQuery.error}
          onRetry={() => void transactionsQuery.refetch()}
        />
      ) : !page ? (
        <Skeleton
          label="Loading transactions…"
          shapes={['row', 'row', 'row', 'row', 'row', 'row']}
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={ICONS.transactions}
          title={hasFilters ? 'No transactions match these filters' : 'No transactions yet'}
          hint={
            hasFilters
              ? 'Try a wider date range or clear the type, category and project filters.'
              : 'Record your first expense, income or transfer.'
          }
          action={
            hasFilters
              ? { label: 'Clear filters', onClick: clearFilters }
              : { label: 'New transaction', onClick: () => setCreating(true) }
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-sand-350 bg-sand-0 shadow-card">
          <Table
            caption="Transactions"
            columns={[
              { label: 'Date' },
              { label: 'Description' },
              { label: 'Account' },
              { label: 'Category' },
              { label: 'Project' },
              { label: 'Amount', align: 'right' },
            ]}
          >
            {page.items.map((transaction) => {
              const editable = transaction.kind !== 'opening';
              const open = () =>
                setEditing({
                  id: transaction.id,
                  kind: transaction.kind as TransactionKindChoice,
                  date: transaction.date,
                  description: transaction.description,
                  amount: transaction.amount,
                  accountId: transaction.accountId,
                  categoryId: transaction.categoryId,
                  counterAccountId: transaction.counterAccountId,
                  projectId: transaction.projectId,
                });
              return (
                <tr
                  key={transaction.id}
                  className={`${editable ? 'cursor-pointer transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-sand-50' : ''} ${transaction.id === flashId ? ROW_FLASH : ''}`}
                  onClick={editable ? open : undefined}
                >
                  <td className="font-mono text-12 whitespace-nowrap text-text-2">
                    {transaction.date}
                  </td>
                  <td>
                    <span className="flex min-w-0 items-center gap-10">
                      <KindGlyph
                        kind={transaction.kind as Kind}
                        label={KIND_LABEL[transaction.kind as Kind]}
                      />
                      {editable ? (
                        <button type="button" className={ROW_ACTION_TEXT} onClick={open}>
                          {transaction.description}
                        </button>
                      ) : (
                        <span className={`${TRUNCATE} font-medium`}>{transaction.description}</span>
                      )}
                    </span>
                  </td>
                  <td className="text-13 text-text-strong">
                    {transaction.kind === 'transfer'
                      ? `${accountName(transaction.accountId)} → ${accountName(transaction.counterAccountId)}`
                      : accountName(transaction.accountId)}
                  </td>
                  <td>
                    {transaction.categoryId && (
                      <span className={CHIP_CATEGORY}>{categoryName(transaction.categoryId)}</span>
                    )}
                  </td>
                  <td className="text-13 text-text-strong">
                    {projectName(transaction.projectId) ?? '—'}
                  </td>
                  <td className={`${TD_AMOUNT} font-mono font-medium`}>
                    <TransactionAmount kind={transaction.kind} amount={transaction.amount} />
                  </td>
                </tr>
              );
            })}
          </Table>
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-12 border-t border-sand-350 px-20 py-12 text-13 text-text-strong"
          >
            <span>
              <strong className="font-semibold text-text-1">
                {page.total === 0
                  ? '0'
                  : `${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)}`}
              </strong>{' '}
              of {page.total}
            </span>
            <span className="flex items-center gap-4">
              {currentPage > 1 && (
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <span aria-hidden="true">‹</span> Previous
                </button>
              )}
              {pageNumbers(currentPage, pageCount).map((number, index) =>
                number === null ? (
                  <span
                    key={`gap-${index}`}
                    aria-hidden="true"
                    className="grid size-32 place-items-center font-mono text-text-2"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={number}
                    type="button"
                    aria-label={`Page ${number}`}
                    aria-current={number === currentPage ? 'page' : undefined}
                    className={`${PAGE_BUTTON} ${number === currentPage ? 'bg-ink-900 text-text-on-ink' : 'text-text-1 hover:bg-sand-200'}`}
                    onClick={() => setOffset((number - 1) * PAGE_SIZE)}
                  >
                    {number}
                  </button>
                ),
              )}
              {currentPage < pageCount && (
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next <span aria-hidden="true">›</span>
                </button>
              )}
            </span>
          </nav>
        </div>
      )}
      <Modal title="New transaction" open={creating} onClose={() => setCreating(false)}>
        <TransactionForm
          transaction={null}
          accounts={accounts}
          categories={categories}
          projects={projects}
          onDone={() => setCreating(false)}
        />
      </Modal>
      <Modal title="Edit transaction" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <TransactionForm
            transaction={editing}
            accounts={accounts}
            categories={categories}
            projects={projects}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
