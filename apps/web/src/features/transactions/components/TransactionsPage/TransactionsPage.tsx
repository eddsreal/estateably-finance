import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Picker } from '../../../../shared/ui/Picker/Picker';
import { Kind, KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
  TransactionKindChoice,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_CATEGORY,
  INPUT,
  LABEL,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  PAGINATION,
  ROW_ACTION_TEXT,
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
};

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
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
              limit: PAGE_SIZE,
              offset,
            },
          },
        }),
      ),
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const categoryName = (id?: string) =>
    categories.find((category) => category.id === id)?.name ?? '';

  function setFilter(patch: Filters) {
    setFilters((current) => ({ ...current, ...patch }));
    setOffset(0);
  }

  const page = transactionsQuery.data;
  const hasFilters = Boolean(filters.from || filters.to || filters.kind || filters.categoryId);

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Transactions</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New transaction
        </button>
      </div>
      <div className={CARD}>
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
          <div className={TOOLBAR_FIELD}>
            <label className={LABEL} htmlFor="filter-kind">
              Kind
            </label>
            <Picker
              id="filter-kind"
              value={filters.kind ?? null}
              onChange={(value) => setFilter({ kind: value ?? undefined })}
              options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
              placeholder="All kinds"
            />
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
        </div>
      </div>
      <div className={CARD}>
        {transactionsQuery.isError ? (
          <div className={BANNER_WARNING} role="alert">
            <span>The transaction list could not be refreshed, so it is not shown.</span>
            <button
              type="button"
              className={BUTTON_COMPACT}
              onClick={() => void transactionsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !page ? (
          <p className="text-14 text-text-2">Loading transactions…</p>
        ) : page.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No transactions match these filters' : 'No transactions yet'}
            hint={
              hasFilters
                ? 'Loosen the date range or clear the filters.'
                : 'Record your first expense, income or transfer.'
            }
            actionLabel={hasFilters ? undefined : 'New transaction'}
            onAction={hasFilters ? undefined : () => setCreating(true)}
          />
        ) : (
          <>
            <Table
              caption="Transactions"
              columns={[
                { label: 'Date' },
                { label: 'Kind' },
                { label: 'Description' },
                { label: 'Account' },
                { label: 'Category' },
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
                    className={
                      editable
                        ? 'cursor-pointer transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-sand-50'
                        : undefined
                    }
                    onClick={editable ? open : undefined}
                  >
                    <td className="font-mono text-12 text-text-2">{transaction.date}</td>
                    <td>
                      <KindGlyph
                        kind={transaction.kind as Kind}
                        label={KIND_LABEL[transaction.kind as Kind]}
                        showLabel
                      />
                    </td>
                    <td>
                      {editable ? (
                        <button type="button" className={ROW_ACTION_TEXT} onClick={open}>
                          {transaction.description}
                        </button>
                      ) : (
                        <span className={TRUNCATE}>{transaction.description}</span>
                      )}
                    </td>
                    <td>
                      {transaction.kind === 'transfer'
                        ? `${accountName(transaction.accountId)} → ${accountName(transaction.counterAccountId)}`
                        : accountName(transaction.accountId)}
                    </td>
                    <td>
                      {transaction.categoryId && (
                        <span className={CHIP_CATEGORY}>
                          {categoryName(transaction.categoryId)}
                        </span>
                      )}
                    </td>
                    <td className={TD_AMOUNT}>
                      <TransactionAmount kind={transaction.kind} amount={transaction.amount} />
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className={PAGINATION}>
              <span>
                {page.total === 0
                  ? '0 of 0'
                  : `${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} of ${page.total}`}
              </span>
              <span>
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>{' '}
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  disabled={page.offset + PAGE_SIZE >= page.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </span>
            </div>
          </>
        )}
      </div>
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
