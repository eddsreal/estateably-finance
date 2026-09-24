import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Stat } from '../../../../shared/ui/Stat/Stat';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  CARD,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
  TD_AMOUNT,
} from '../../../../shared/lib/styles';

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
  const navigate = useNavigate();

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
  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsList,
    queryFn: () => unwrap(api.GET('/projects')),
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const report = reportQuery.data;
  const label = monthLabel(month);

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Monthly report</h1>
        <div className="flex items-center gap-12 text-15 font-semibold">
          <button
            type="button"
            className={BUTTON_COMPACT}
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span aria-live="polite">{label}</span>
          <button
            type="button"
            className={BUTTON_COMPACT}
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <Stat caption={`Spent in ${label}`}>
        {report ? <Amount cents={report.grandTotal} size="large" /> : '…'}
      </Stat>
      <div className={CARD}>
        {reportQuery.isError ? (
          <div className={BANNER_WARNING} role="alert">
            <span>The report could not be loaded, so it is not shown.</span>
            <button
              type="button"
              className={BUTTON_COMPACT}
              onClick={() => void reportQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !report ? (
          <p className="text-14 text-text-2">Loading report…</p>
        ) : report.categories.length === 0 ? (
          <EmptyState
            title="No expenses this month"
            hint={`Expenses dated in ${label} will show up here by category.`}
            actionLabel="Go to transactions"
            onAction={() => void navigate('/transactions')}
          />
        ) : (
          report.categories.map((category) => (
            <details
              key={category.categoryId}
              className="group border-b border-sand-200 last:border-b-0"
            >
              <summary className="flex min-h-44 cursor-pointer items-center justify-between gap-12 rounded-lg px-12 text-14 font-semibold transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-sand-50">
                <span className="flex items-center gap-8">
                  <span
                    aria-hidden="true"
                    className="text-text-2 transition-transform duration-(--dur-hover) ease-(--ease-out) group-open:rotate-90"
                  >
                    ›
                  </span>
                  {category.categoryName}
                </span>
                <Amount cents={category.total} />
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
                    <td className="font-mono text-12 text-text-2">{transaction.date}</td>
                    <td>
                      <button
                        type="button"
                        className={ROW_ACTION_TEXT}
                        onClick={() =>
                          setEditing({
                            id: transaction.id,
                            kind: 'expense',
                            date: transaction.date,
                            description: transaction.description,
                            amount: transaction.amount,
                            accountId: transaction.accountId,
                            categoryId: transaction.categoryId,
                            projectId: transaction.projectId,
                          })
                        }
                      >
                        {transaction.description}
                      </button>
                    </td>
                    <td>{accountName(transaction.accountId)}</td>
                    <td className={TD_AMOUNT}>
                      <Amount cents={transaction.amount} />
                    </td>
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
            projects={projects}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
