import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { Cents, formatCents, isNegative } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';

function Amount({ cents }: { cents: string }) {
  return (
    <span className={`amount ${isNegative(cents as Cents) ? 'negative' : ''}`}>
      {formatCents(cents as Cents)}
    </span>
  );
}

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
    return <p className="page">Loading account…</p>;
  }
  if (accountsQuery.isError) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>The account could not be loaded, so no balance is shown.</span>
          <button
            type="button"
            className="btn compact"
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
      <div className="page">
        <div className="info-banner" role="alert">
          <span>This account does not exist.</span>
          <Link className="page-link" to="/">
            Back to accounts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {account.name}
          {account.archived && <span className="chip warning">archived</span>}
        </h1>
        <Link className="page-link" to="/">
          Back to accounts
        </Link>
      </div>
      <div className="card stat">
        <span className="caption">Current balance</span>
        <span className="value">
          <Amount cents={account.balance} />
        </span>
      </div>
      <div className="card">
        <div className="field">
          <label htmlFor="balance-as-of-date">Balance as of</label>
          <input
            id="balance-as-of-date"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </div>
        {asOf === '' ? (
          <p>Pick a date to see the balance at that day.</p>
        ) : balanceQuery.isError ? (
          <div className="info-banner" role="alert">
            <span>The as-of balance could not be loaded.</span>
            <button
              type="button"
              className="btn compact"
              onClick={() => void balanceQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : balanceQuery.isPending ? (
          <p>Computing balance…</p>
        ) : (
          <div className="stat">
            <span className="caption">Balance on {balanceQuery.data.asOf}</span>
            <span className="value">
              <Amount cents={balanceQuery.data.balance} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
