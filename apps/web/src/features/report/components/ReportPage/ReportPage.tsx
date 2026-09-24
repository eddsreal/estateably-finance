import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { formatDay } from '../../../../shared/lib/dates';
import { Cents, compareCents, share, toPlotNumber } from '../../../../shared/lib/money';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Donut, categoryColor } from '../../../../shared/ui/Donut/Donut';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import {
  CARD,
  ICON_BUTTON,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
} from '../../../../shared/lib/styles';

const EASE = 'duration-(--dur-hover) ease-(--ease-out)';

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
  const [active, setActive] = useState<string | null>(null);
  const spentId = useId();

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
  const rows = report?.categories ?? [];
  const totals = rows.map((category) => category.total as Cents);
  const shares = share(totals);
  const max = totals.reduce<Cents>(
    (high, total) => (compareCents(total, high) > 0 ? total : high),
    '0' as Cents,
  );
  const count = rows.reduce((sum, category) => sum + category.transactions.length, 0);

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Monthly report</h1>
        <div className="flex items-center gap-2 rounded-lg border border-sand-500 bg-sand-0 p-3">
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span aria-live="polite" className="px-12 text-center text-14 font-semibold">
            {label}
          </span>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid gap-16 md:grid-cols-(--report-grid)">
        <div className={`${CARD} flex flex-col items-center gap-24`}>
          {report && (
            <Donut
              label="Spending by category"
              segments={rows.map((category) => ({
                id: category.categoryId,
                name: category.categoryName,
                total: category.total,
              }))}
              active={active}
              onActive={setActive}
            />
          )}
          <div className="grid w-full grid-cols-2 gap-10">
            <div className="flex flex-col gap-2 rounded-xl bg-sand-100 p-14">
              <span id={spentId} className="text-12 text-text-2">
                {`Spent in ${label}`}
              </span>
              <output aria-labelledby={spentId} className="text-20 font-semibold tabular-nums">
                {report ? <Amount cents={report.grandTotal} /> : '…'}
              </output>
            </div>
            <div className="flex flex-col gap-2 rounded-xl bg-sand-100 p-14">
              <span className="text-12 text-text-2">
                {`Expenses · ${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}`}
              </span>
              <span className="text-20 font-semibold tabular-nums">{report ? count : '…'}</span>
            </div>
          </div>
        </div>
        {reportQuery.isError ? (
          <ErrorNotice
            title="The report couldn't load, so it is not shown."
            error={reportQuery.error}
            onRetry={() => void reportQuery.refetch()}
          />
        ) : !report ? (
          <Skeleton label="Loading report…" shapes={['row', 'row', 'row', 'row', 'row']} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ICONS.report}
            title="No expenses this month"
            hint={`Expenses recorded in ${label} will appear here by category.`}
          />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-3xl border border-sand-350 bg-sand-0 shadow-card">
            {rows.map((category, index) => (
              <details
                key={category.categoryId}
                data-active={category.categoryId === active}
                className={`border-b border-sand-200 transition ${EASE} ${
                  category.categoryId === active
                    ? 'bg-sand-50'
                    : active === null
                      ? ''
                      : 'opacity-70'
                }`}
              >
                <summary
                  className={`flex min-h-56 cursor-pointer list-none items-center gap-14 px-22 transition-colors ${EASE} hover:bg-sand-50 md:grid md:grid-cols-(--report-row-grid)`}
                  onMouseEnter={() => setActive(category.categoryId)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(category.categoryId)}
                  onBlur={() => setActive(null)}
                >
                  <span
                    aria-hidden="true"
                    className={`size-12 shrink-0 rounded-xs ${categoryColor(index).swatch}`}
                  />
                  <span className="flex flex-1 items-baseline gap-4 overflow-hidden text-15 font-medium">
                    <span className="truncate">{category.categoryName}</span>
                    <span className="shrink-0 text-13 font-regular text-text-3">
                      {`· ${category.transactions.length} ${category.transactions.length === 1 ? 'item' : 'items'}`}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-8 overflow-hidden rounded-xs bg-sand-200 md:block"
                  >
                    <span
                      className={`block h-full rounded-xs ${categoryColor(index).swatch}`}
                      style={{
                        width: `${toPlotNumber(totals[index], '0' as Cents, max, 100)}%`,
                      }}
                    />
                  </span>
                  <span className="text-right font-mono text-12 text-text-3">{`${shares[index]}%`}</span>
                  <span className="text-right text-14">
                    <Amount cents={category.total} />
                  </span>
                </summary>
                <ul className="flex flex-col gap-6 px-22 pb-12 md:pl-50">
                  {category.transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex min-h-40 items-center gap-12 rounded-md border border-sand-350 bg-sand-0 px-14 text-14 md:grid md:grid-cols-(--report-item-grid)"
                    >
                      <span className="shrink-0 font-mono text-12 text-text-3 uppercase">
                        {formatDay(transaction.date)}
                      </span>
                      <span className="flex flex-1 items-center gap-4 overflow-hidden">
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
                        <span className="truncate text-text-3">
                          {`· ${accountName(transaction.accountId)}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <Amount cents={transaction.amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <div className="mt-auto flex min-h-56 items-center justify-between gap-12 bg-ink-900 px-22">
              <span className="text-14 text-ink-300">{`Total for ${label}`}</span>
              <span className="text-20 font-semibold text-text-on-ink tabular-nums">
                <Amount cents={report.grandTotal} />
              </span>
            </div>
          </div>
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
