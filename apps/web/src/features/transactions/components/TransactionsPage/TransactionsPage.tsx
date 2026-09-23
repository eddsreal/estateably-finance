import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Picker } from '../../../../shared/ui/Picker/Picker';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
  TransactionKindChoice,
} from '../../../../shared/ui/TransactionForm/TransactionForm';

const PAGE_SIZE = 50;

const KIND_META: Record<string, { glyph: string; chip: string; label: string }> = {
  expense: { glyph: '↑', chip: 'expense', label: 'Expense' },
  income: { glyph: '↓', chip: 'income', label: 'Income' },
  transfer: { glyph: '⇄', chip: 'transfer', label: 'Transfer' },
  opening: { glyph: '●', chip: '', label: 'Opening' },
};

function TransactionAmount({ kind, amount }: { kind: string; amount: string }) {
  const cents = amount as Cents;
  if (kind === 'expense') {
    return <span className="amount negative">-{formatCents(cents)}</span>;
  }
  if (kind === 'income') {
    return <span className="amount positive">+{formatCents(cents)}</span>;
  }
  return <span className="amount">{formatCents(cents)}</span>;
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
    <div className="page">
      <div className="page-header">
        <h1>Transactions</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          New transaction
        </button>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="filter-from">From</label>
            <input
              id="filter-from"
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => setFilter({ from: event.target.value || undefined })}
            />
          </div>
          <div className="field">
            <label htmlFor="filter-to">To</label>
            <input
              id="filter-to"
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => setFilter({ to: event.target.value || undefined })}
            />
          </div>
          <div className="field">
            <label htmlFor="filter-kind">Kind</label>
            <Picker
              id="filter-kind"
              value={filters.kind ?? null}
              onChange={(value) => setFilter({ kind: value ?? undefined })}
              options={Object.entries(KIND_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              placeholder="All kinds"
            />
          </div>
          <div className="field">
            <label htmlFor="filter-category">Category</label>
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
      <div className="card">
        {transactionsQuery.isError ? (
          <div className="info-banner" role="alert">
            <span>The transaction list could not be refreshed, so it is not shown.</span>
            <button
              type="button"
              className="btn compact"
              onClick={() => void transactionsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !page ? (
          <p>Loading transactions…</p>
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
                const meta = KIND_META[transaction.kind];
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
                    className={editable ? 'clickable' : undefined}
                    onClick={editable ? open : undefined}
                  >
                    <td>{transaction.date}</td>
                    <td>
                      <span className={`chip ${meta.chip}`}>
                        <span aria-hidden="true">{meta.glyph}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      {editable ? (
                        <button type="button" className="row-action" onClick={open}>
                          {transaction.description}
                        </button>
                      ) : (
                        transaction.description
                      )}
                    </td>
                    <td>
                      {transaction.kind === 'transfer'
                        ? `${accountName(transaction.accountId)} → ${accountName(transaction.counterAccountId)}`
                        : accountName(transaction.accountId)}
                    </td>
                    <td>{categoryName(transaction.categoryId)}</td>
                    <td className="amount">
                      <TransactionAmount kind={transaction.kind} amount={transaction.amount} />
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className="pagination">
              <span>
                {page.total === 0
                  ? '0 of 0'
                  : `${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} of ${page.total}`}
              </span>
              <span>
                <button
                  type="button"
                  className="btn compact"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>{' '}
                <button
                  type="button"
                  className="btn compact"
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
