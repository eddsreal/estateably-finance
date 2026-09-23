import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date()).slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function ReportPage() {
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<EditableTransaction | null>(null);

  const reportQuery = useQuery({
    queryKey: queryKeys.reportMonthly(month),
    queryFn: () => unwrap(api.GET('/reports/monthly', { params: { query: { month } } })),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const report = reportQuery.data;
  const label = monthLabel(month);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Monthly report</h1>
        <div className="month-switcher">
          <button
            type="button"
            className="btn compact"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span aria-live="polite">{label}</span>
          <button
            type="button"
            className="btn compact"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="card stat">
        <span className="caption">Spent in {label}</span>
        <span className="value">
          {report ? <span className="amount">{formatCents(report.grandTotal as Cents)}</span> : '…'}
        </span>
      </div>
      <div className="card">
        {reportQuery.isError ? (
          <div className="info-banner" role="alert">
            <span>The report could not be loaded, so it is not shown.</span>
            <button
              type="button"
              className="btn compact"
              onClick={() => void reportQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !report ? (
          <p>Loading report…</p>
        ) : report.categories.length === 0 ? (
          <EmptyState
            title="No expenses this month"
            hint={`Expenses dated in ${label} will show up here by category.`}
          />
        ) : (
          report.categories.map((category) => (
            <details key={category.categoryId} className="report-category">
              <summary>
                <span>{category.categoryName}</span>
                <span className="amount">{formatCents(category.total as Cents)}</span>
              </summary>
              <Table
                caption={`${category.categoryName} expenses in ${label}`}
                columns={[
                  { label: 'Date' },
                  { label: 'Description' },
                  { label: 'Account' },
                  { label: 'Amount', align: 'right' },
                ]}
              >
                {category.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.date}</td>
                    <td>
                      <button
                        type="button"
                        className="row-action"
                        onClick={() =>
                          setEditing({
                            id: transaction.id,
                            kind: 'expense',
                            date: transaction.date,
                            description: transaction.description,
                            amount: transaction.amount,
                            accountId: transaction.accountId,
                            categoryId: transaction.categoryId,
                          })
                        }
                      >
                        {transaction.description}
                      </button>
                    </td>
                    <td>{accountName(transaction.accountId)}</td>
                    <td className="amount">{formatCents(transaction.amount as Cents)}</td>
                  </tr>
                ))}
              </Table>
            </details>
          ))
        )}
      </div>
      <Modal title="Edit transaction" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <TransactionForm
            transaction={editing}
            accounts={accounts}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
