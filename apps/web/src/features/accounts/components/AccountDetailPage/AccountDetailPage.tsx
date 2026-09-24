import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { addCents, Cents, change } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import {
  BANNER_WARNING,
  BUTTON,
  BUTTON_COMPACT,
  CARD,
  CHIP_CATEGORY,
  CHIP_WARNING,
  FIELD,
  INPUT,
  LABEL,
  LINK,
  PAGE,
  PAGINATION,
  STAT_CAPTION,
  STAT_VALUE,
  TRUNCATE,
} from '../../../../shared/lib/styles';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { Delta } from '../../../../shared/ui/Delta/Delta';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Icon, ICONS } from '../../../../shared/ui/Icon/Icon';
import { Kind, KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { AccountForm } from '../AccountForm/AccountForm';

const PAGE_SIZE = 50;

const KIND_LABEL: Record<string, string> = { bank: 'Bank', cash: 'Cash', card: 'Card' };

type Row = {
  id: string;
  kind: string;
  date: string;
  description: string;
  amount: string;
  accountId: string;
  counterAccountId?: string;
  categoryId?: string;
};

export function signedAmount(row: Row, accountId: string): Cents {
  const amount = row.amount as Cents;
  const outflow =
    row.kind === 'expense' || (row.kind === 'transfer' && row.accountId === accountId);
  return outflow ? change(amount, '0' as Cents) : amount;
}

export function dayLabel(date: string, today: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(day);
  const monthDay = format({ month: 'short', day: 'numeric' });
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  const prefix = date === today ? 'Today' : format({ weekday: 'short' });
  return `${prefix} · ${monthDay}${year}`;
}

export function groupByDay<T extends Row>(rows: T[], accountId: string) {
  const days: { date: string; net: Cents; rows: T[] }[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    const signed = signedAmount(row, accountId);
    if (last?.date === row.date) {
      last.rows.push(row);
      last.net = addCents(last.net, signed);
    } else {
      days.push({ date: row.date, net: signed, rows: [row] });
    }
  }
  return days;
}

function formatOpened(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [asOf, setAsOf] = useState(localToday());
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  const today = localToday();

  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });

  const balanceQuery = useQuery({
    queryKey: queryKeys.accountBalanceAsOf(accountId, asOf),
    queryFn: () =>
      unwrap(
        api.GET('/accounts/{id}/balance', { params: { path: { id: accountId }, query: { asOf } } }),
      ),
    enabled: asOf !== '',
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });

  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactionsList({ accountId, offset }),
    queryFn: () =>
      unwrap(
        api.GET('/transactions', {
          params: { query: { accountId, limit: PAGE_SIZE, offset } },
        }),
      ),
  });

  if (accountsQuery.isPending) {
    return <p className={PAGE}>Loading account…</p>;
  }
  if (accountsQuery.isError) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>The account could not be loaded, so no balance is shown.</span>
          <button
            type="button"
            className={BUTTON_COMPACT}
            onClick={() => void accountsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const accounts = accountsQuery.data.items;
  const account = accounts.find((item) => item.id === accountId);
  if (!account) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>This account does not exist.</span>
          <Link className={BUTTON_COMPACT} to="/">
            Back to accounts
          </Link>
        </div>
      </div>
    );
  }

  const accountName = (id?: string) => accounts.find((item) => item.id === id)?.name ?? '';
  const categoryName = (id?: string) =>
    categoriesQuery.data?.find((category) => category.id === id)?.name ?? '';
  const page = transactionsQuery.data;

  return (
    <div className={PAGE}>
      <div className="flex flex-col gap-14">
        <nav aria-label="Breadcrumb" className="flex items-center gap-6 text-13 text-text-3">
          <Link className={LINK} to="/" aria-label="Back to accounts">
            Accounts
          </Link>
          <span aria-hidden="true">/</span>
          <span className={`${TRUNCATE} text-text-1`}>{account.name}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-16">
          <div className="flex min-w-0 items-center gap-16">
            <span className="grid size-56 flex-none place-items-center rounded-xl bg-ink-900 text-text-on-ink">
              <Icon path={ICONS[account.kind]} size="size-19" />
            </span>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-center gap-6 text-14 text-text-2">
                <h1 className={`${TRUNCATE} font-regular`}>{account.name}</h1>
                <span className="flex-none">
                  · {KIND_LABEL[account.kind]} · opened {formatOpened(account.openingDate)}
                </span>
                {account.archived && <span className={CHIP_WARNING}>Archived</span>}
              </div>
              <output aria-label="Current balance" className="text-44 leading-none">
                <Amount cents={account.balance} size="large" />
              </output>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <label className={`${FIELD} w-190`}>
              <span className={LABEL}>Balance as of</span>
              <input
                type="date"
                className={INPUT}
                max={today}
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
              />
            </label>
            <button type="button" className={BUTTON} onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        </div>
      </div>
      <div className={`${CARD} py-16`}>
        {asOf === '' ? (
          <p className="text-14 text-text-2">Pick a date to see the balance at that day.</p>
        ) : balanceQuery.isError ? (
          <div className={BANNER_WARNING} role="alert">
            <span>The as-of balance could not be loaded.</span>
            <button
              type="button"
              className={BUTTON_COMPACT}
              onClick={() => void balanceQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : balanceQuery.isPending ? (
          <p className="text-14 text-text-2">Computing balance…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
            <span id="balance-as-of-caption" className={`${STAT_CAPTION} basis-full`}>
              Balance on {balanceQuery.data.asOf}
            </span>
            <output aria-labelledby="balance-as-of-caption" className={STAT_VALUE}>
              <Amount cents={balanceQuery.data.balance} />
            </output>
            <Delta cents={change(balanceQuery.data.balance as Cents, account.balance as Cents)} />
            <span className="text-13 text-text-2">from then to today</span>
          </div>
        )}
      </div>
      {page && (
        <span className="self-end font-mono text-12 text-text-3 uppercase">
          {page.total} {page.total === 1 ? 'transaction' : 'transactions'}
        </span>
      )}
      <section
        aria-label="Transactions on this account"
        className="overflow-hidden rounded-3xl border border-sand-350 bg-sand-0"
      >
        {transactionsQuery.isError ? (
          <div className={`${BANNER_WARNING} m-16`} role="alert">
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
          <p className="p-22 text-14 text-text-2">Loading transactions…</p>
        ) : page.items.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            hint="Expenses, income and transfers on this account will show here."
          />
        ) : (
          groupByDay(page.items, accountId).map((day) => (
            <section key={day.date} aria-label={dayLabel(day.date, today)}>
              <h2 className="flex justify-between px-22 pt-14 pb-6 font-mono text-11 tracking-wide text-text-3 uppercase">
                <span>{dayLabel(day.date, today)}</span>
                <Amount
                  cents={day.net}
                  sign={day.rows.every((row) => row.kind === 'opening') ? 'auto' : 'always'}
                />
              </h2>
              <ul>
                {day.rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-14 px-22 py-12">
                    <KindGlyph kind={row.kind as Kind} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`${TRUNCATE} text-15 font-medium`}>{row.description}</span>
                      {row.kind === 'transfer' && (
                        <span className="text-12 text-text-3">
                          {row.accountId === accountId
                            ? `→ ${accountName(row.counterAccountId)}`
                            : `← ${accountName(row.accountId)}`}
                        </span>
                      )}
                    </span>
                    {row.categoryId && (
                      <span className={CHIP_CATEGORY}>{categoryName(row.categoryId)}</span>
                    )}
                    <span className="text-14">
                      <Amount
                        cents={signedAmount(row, accountId)}
                        sign={row.kind === 'opening' ? 'auto' : 'always'}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
      {page && page.total > PAGE_SIZE && (
        <div className={PAGINATION}>
          <span>{`${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} of ${page.total}`}</span>
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
      )}
      <Modal title="Edit account" open={editing} onClose={() => setEditing(false)}>
        {editing && (
          <AccountForm
            account={{
              id: account.id,
              name: account.name,
              kind: account.kind,
              openingBalance: account.openingBalance,
              openingDate: account.openingDate,
              archived: account.archived,
              balance: account.balance,
            }}
            onDone={() => setEditing(false)}
          />
        )}
      </Modal>
    </div>
  );
}
