import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { addDays, formatDay, localToday } from '../../../../shared/lib/dates';
import { addCents, Cents, change, countUpFrames, formatCents } from '../../../../shared/lib/money';
import { animate, durationMs } from '../../../../shared/lib/motion';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { Delta } from '../../../../shared/ui/Delta/Delta';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Icon, ICONS } from '../../../../shared/ui/Icon/Icon';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import { useSavedFeedback, useToast } from '../../../../shared/ui/Toast/Toast';
import { AccountForm, EditableAccount } from '../AccountForm/AccountForm';
import {
  BUTTON_PRIMARY,
  CARD,
  CHIP_WARNING,
  FIELD,
  INPUT,
  LABEL,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ICON_BUTTON,
  SEGMENT,
  SEGMENTED,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const LineChart = lazy(() =>
  import('../../../../shared/ui/LineChart/LineChart').then((module) => ({
    default: module.LineChart,
  })),
);
const Sparkline = lazy(() =>
  import('../../../../shared/ui/Sparkline/Sparkline').then((module) => ({
    default: module.Sparkline,
  })),
);

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: null },
] as const;

type Range = (typeof RANGES)[number]['label'];

function useCountUp(target: Cents): { value: Cents; busy: boolean } {
  const [value, setValue] = useState<Cents>(() =>
    durationMs('--dur-count') > 0 ? ('0' as Cents) : target,
  );
  const shown = useRef<Cents | null>(null);
  useEffect(() => {
    const frames = countUpFrames(shown.current ?? ('0' as Cents), target);
    return animate(durationMs('--dur-count'), (eased) => {
      shown.current = frames[Math.round(eased * 60)];
      setValue(shown.current);
    });
  }, [target]);
  return { value, busy: value !== target };
}

export function AccountsPage() {
  const saved = useSavedFeedback();
  const { showError } = useToast();
  const [range, setRange] = useState<Range>('30D');
  const [asOf, setAsOf] = useState<string | null>(null);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const end = asOf ?? serverToday ?? localToday();
  const days = RANGES.find((choice) => choice.label === range)?.days ?? null;
  const from = days === null ? undefined : addDays(end, -(days - 1));
  const to = asOf ?? undefined;

  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.balanceHistory(from, to),
    queryFn: () =>
      unwrap(
        api.GET('/accounts/balance-history', {
          params: { query: { from, to, includeArchived: true } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const history = historyQuery.data;
  if (
    history &&
    !historyQuery.isPlaceholderData &&
    to === undefined &&
    history.to !== serverToday
  ) {
    setServerToday(history.to);
  }

  const total = (history?.total ?? ['0']) as Cents[];
  const last = total.length - 1;
  const index = Math.min(selected ?? last, last);
  const counted = useCountUp(total[last]);

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      unwrap(
        archive
          ? api.POST('/accounts/{id}/archive', { params: { path: { id } } })
          : api.POST('/accounts/{id}/unarchive', { params: { path: { id } } }),
      ),
    onSuccess: (_, { archive }) => saved(archive ? 'Account archived.' : 'Account restored.'),
    onError: showError,
  });

  if (accountsQuery.isPending || historyQuery.isPending) {
    return (
      <div className={PAGE}>
        <Skeleton label="Loading accounts…" shapes={['line', 'block', 'row', 'row', 'row']} />
      </div>
    );
  }
  if (accountsQuery.isError || historyQuery.isError) {
    return (
      <div className={PAGE}>
        <ErrorNotice
          title="The account balances couldn't load, so none are shown."
          error={accountsQuery.error ?? historyQuery.error}
          onRetry={() => {
            void accountsQuery.refetch();
            void historyQuery.refetch();
          }}
        />
      </div>
    );
  }

  const { items } = accountsQuery.data;
  const series = new Map(history!.accounts.map((account) => [account.accountId, account.balances]));
  const cards = items.flatMap((account) => {
    const balances = series.get(account.id);
    return balances ? [{ account, balances }] : [];
  });
  const archived = cards.filter(({ account }) => account.archived);
  const activeCount = cards.length - archived.length;
  const archivedSum = archived.reduce(
    (sum, { balances }) => addCents(sum, balances[balances.length - 1] as Cents),
    '0' as Cents,
  );
  const plural = archived.length === 1 ? '' : 's';
  const day = addDays(history!.from, index);
  const headline = selected === null ? counted.value : total[index];

  const selectRange = (next: Range) => {
    setRange(next);
    setSelected(null);
  };
  const selectAsOf = (value: string) => {
    if (value !== '' && serverToday !== null && value > serverToday) return;
    setAsOf(value === '' || value === serverToday ? null : value);
    setSelected(null);
  };

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Accounts</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New account
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={ICONS.accounts}
          title="No accounts yet"
          hint="Add a bank account, cash or a card to start tracking balances."
          action={{ label: 'Add account', onClick: () => setCreating(true) }}
        />
      ) : (
        <>
          <section className={`${CARD} flex flex-col gap-12`} aria-label="Balance over time">
            <div className="flex flex-wrap items-start justify-between gap-16">
              <div className="flex flex-col gap-6">
                <span className="text-13 text-text-2">
                  Balance on <strong className="font-semibold text-text-1">{formatDay(day)}</strong>
                </span>
                <output
                  aria-label="Total across accounts"
                  aria-busy={selected === null && counted.busy}
                  className="text-56 leading-none"
                >
                  <Amount cents={headline} size="large" />
                </output>
                <span className="flex flex-wrap items-center gap-10 text-13 text-text-3">
                  <Delta cents={change(total[0], total[index])} />
                  since {formatDay(history!.from)} · total of {activeCount} active account
                  {activeCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-10">
                <label className={`${FIELD} w-190`}>
                  <span className={LABEL}>Balance as of</span>
                  <input
                    className={INPUT}
                    type="date"
                    max={serverToday ?? undefined}
                    value={asOf ?? serverToday ?? ''}
                    onChange={(event) => selectAsOf(event.target.value)}
                  />
                </label>
                <div className={SEGMENTED} role="radiogroup" aria-label="Range">
                  {RANGES.map((choice) => (
                    <label key={choice.label} className={`${SEGMENT} px-12`}>
                      <input
                        className="sr-only"
                        type="radio"
                        name="range"
                        checked={range === choice.label}
                        onChange={() => selectRange(choice.label)}
                      />
                      {choice.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <Suspense fallback={<div className="h-190" />}>
              <LineChart
                label="Total balance by day"
                from={history!.from}
                series={total}
                selected={index}
                onSelect={setSelected}
              />
            </Suspense>
          </section>
          <ul aria-label="Accounts" className="grid grid-cols-(--cards-grid) gap-14">
            {cards
              .filter(({ account }) => showArchived || !account.archived)
              .map(({ account, balances }) => (
                <li key={account.id} className={`${CARD} flex flex-col gap-18 p-18`}>
                  <div className="flex items-center justify-between gap-8">
                    <span className="grid size-38 place-items-center rounded-lg bg-sand-200 text-text-1">
                      <Icon path={ICONS[account.kind]} size="size-19" />
                    </span>
                    <span className="font-mono text-11 tracking-wide text-text-3 uppercase">
                      {account.kind}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="flex min-w-0 items-center gap-8">
                      <Link
                        className={`${LINK} ${TRUNCATE} text-14`}
                        to={`/accounts/${account.id}`}
                      >
                        {account.name}
                      </Link>
                      {account.archived && <span className={CHIP_WARNING}>Archived</span>}
                    </span>
                    <span className="text-24 leading-none">
                      <Amount cents={balances[balances.length - 1]} size="large" />
                    </span>
                  </div>
                  <Suspense fallback={<div className="h-28" />}>
                    <Sparkline series={balances} />
                  </Suspense>
                  <div className="-my-6 -mr-6 flex justify-end gap-4">
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`Edit ${account.name}`}
                      title="Edit"
                      onClick={() =>
                        setEditing({
                          id: account.id,
                          name: account.name,
                          kind: account.kind,
                          openingBalance: account.openingBalance,
                          openingDate: account.openingDate,
                          archived: account.archived,
                          balance: account.balance,
                        })
                      }
                    >
                      <Icon path={ICONS.edit} size="size-17" />
                    </button>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`${account.archived ? 'Unarchive' : 'Archive'} ${account.name}`}
                      title={account.archived ? 'Unarchive' : 'Archive'}
                      onClick={() =>
                        archiveMutation.mutate({ id: account.id, archive: !account.archived })
                      }
                    >
                      <Icon
                        path={account.archived ? ICONS.unarchive : ICONS.archive}
                        size="size-17"
                      />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          {archived.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-12 rounded-xl border border-dashed border-sand-600 px-16 py-12 text-13 text-text-2">
              <span>
                {showArchived
                  ? `${archived.length} archived account${plural} shown · not counted in total`
                  : `${archived.length} archived account${plural} · ${formatCents(archivedSum)} · not counted in total`}
              </span>
              <label className="inline-flex items-center gap-8 text-14 font-medium text-text-1">
                <input
                  className="accent-accent"
                  type="checkbox"
                  role="switch"
                  aria-checked={showArchived}
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Show archived
              </label>
            </div>
          )}
        </>
      )}
      <Modal title="New account" open={creating} onClose={() => setCreating(false)}>
        <AccountForm account={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit account" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <AccountForm account={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
