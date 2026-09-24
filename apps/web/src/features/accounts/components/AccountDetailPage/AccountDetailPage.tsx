import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { Cents, change } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  CARD,
  CHIP_WARNING,
  FIELD,
  INPUT,
  LABEL,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  STAT_CAPTION,
  STAT_VALUE,
} from '../../../../shared/lib/styles';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { Delta } from '../../../../shared/ui/Delta/Delta';
import { Stat } from '../../../../shared/ui/Stat/Stat';

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [asOf, setAsOf] = useState(localToday());

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

  const account = accountsQuery.data.items.find((item) => item.id === accountId);
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

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>
          {account.name}
          {account.archived && <span className={CHIP_WARNING}>archived</span>}
        </h1>
        <Link className={LINK} to="/">
          Back to accounts
        </Link>
      </div>
      <Stat caption="Current balance">
        <Amount cents={account.balance} size="large" />
      </Stat>
      <div className={CARD}>
        <div className={`${FIELD} max-w-232`}>
          <label className={LABEL} htmlFor="balance-as-of-date">
            Balance as of
          </label>
          <input
            id="balance-as-of-date"
            type="date"
            className={INPUT}
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </div>
        {asOf === '' ? (
          <p className="mt-16 text-14 text-text-2">Pick a date to see the balance at that day.</p>
        ) : balanceQuery.isError ? (
          <div className={`${BANNER_WARNING} mt-16`} role="alert">
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
          <p className="mt-16 text-14 text-text-2">Computing balance…</p>
        ) : (
          <div className="mt-16 flex flex-wrap items-center gap-x-12 gap-y-6">
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
    </div>
  );
}
