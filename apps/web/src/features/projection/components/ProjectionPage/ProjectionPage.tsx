import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { addDays, formatDay, localToday } from '../../../../shared/lib/dates';
import { Cents, compareCents, formatCents, isNegative } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import { Stat } from '../../../../shared/ui/Stat/Stat';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  BUTTON_COMPACT,
  CARD,
  CHIP_WARNING,
  FIELD,
  FIELD_ERROR,
  HINT,
  INPUT,
  LABEL,
  PAGE,
  PAGE_TITLE,
  TD_AMOUNT,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const LineChart = lazy(() =>
  import('../../../../shared/ui/LineChart/LineChart').then((module) => ({
    default: module.LineChart,
  })),
);

const SHORTCUTS = [3, 6, 12, 24] as const;

const SHORTCUT = `${BUTTON_COMPACT} font-mono aria-pressed:border-ink-900 aria-pressed:bg-ink-900 aria-pressed:text-text-on-ink aria-pressed:hover:bg-ink-900`;

type Occurrence = { date: string; runningBalance: string };

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function endOfNextMonth(today: string): string {
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

function dailySeries(
  from: string,
  to: string,
  starting: string,
  occurrences: Occurrence[],
): string[] {
  const series: string[] = [];
  let balance = starting;
  let next = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    while (next < occurrences.length && occurrences[next].date <= day) {
      balance = occurrences[next].runningBalance;
      next += 1;
    }
    series.push(balance);
  }
  return series;
}

function shortfall(occurrences: Occurrence[], horizon: string) {
  const first = occurrences.findIndex((row) => isNegative(row.runningBalance as Cents));
  if (first < 0) return null;
  let lowest = occurrences[first];
  const periods: { start: string; end: string }[] = [];
  let below = true;
  let open: string | null = null;
  for (const row of occurrences.slice(first + 1)) {
    const negative = isNegative(row.runningBalance as Cents);
    if (compareCents(row.runningBalance as Cents, lowest.runningBalance as Cents) < 0) {
      lowest = row;
    }
    if (negative && !below) open = row.date;
    if (!negative && below && open !== null) {
      const end = addDays(row.date, -1);
      periods.push({ start: open, end: end < open ? open : end });
      open = null;
    }
    below = negative;
  }
  if (open !== null) periods.push({ start: open, end: horizon });
  return { first, lowest, periods };
}

function period({ start, end }: { start: string; end: string }): string {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

export function ProjectionPage() {
  const today = localToday();
  const latest = addMonths(today, 24);
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState(() => endOfNextMonth(today));
  const [draft, setDraft] = useState(horizon);
  const [selected, setSelected] = useState<number | null>(null);

  const projectionQuery = useQuery({
    queryKey: queryKeys.projectionAt(horizon),
    queryFn: () => unwrap(api.GET('/projection', { params: { query: { horizon } } })),
  });

  const projection = projectionQuery.data;
  const series = useMemo(
    () =>
      projection
        ? dailySeries(today, projection.horizon, projection.startingBalance, projection.occurrences)
        : [],
    [projection, today],
  );
  const summary = projection ? shortfall(projection.occurrences, projection.horizon) : null;
  const invalid = draft !== '' && (draft < today || draft > latest);

  const choose = (value: string) => {
    setDraft(value);
    if (value === '' || value < today || value > latest) return;
    setHorizon(value);
    setSelected(null);
  };

  return (
    <div className={PAGE}>
      <div className="grid items-start gap-20 lg:grid-cols-(--projection-grid)">
        <div className="flex flex-col gap-14">
          <div className="flex flex-col gap-2">
            <h1 className={PAGE_TITLE}>Projection</h1>
            <p className="text-14 text-text-2">
              Total of active accounts plus every scheduled payment
            </p>
          </div>
          <div className={FIELD}>
            <label className={LABEL} htmlFor="projection-horizon">
              Project up to
            </label>
            <input
              id="projection-horizon"
              type="date"
              className={INPUT}
              value={draft}
              min={today}
              max={latest}
              aria-invalid={invalid}
              aria-describedby="projection-horizon-hint"
              onChange={(event) => choose(event.target.value)}
            />
            <span id="projection-horizon-hint" className={invalid ? FIELD_ERROR : HINT}>
              {invalid
                ? `Choose a date from today to ${formatDay(latest)}.`
                : `Up to 24 months ahead (${formatDay(latest)}).`}
            </span>
            <fieldset className="flex gap-6" aria-label="Shortcuts">
              {SHORTCUTS.map((months) => {
                const date = addMonths(today, months);
                return (
                  <button
                    key={months}
                    type="button"
                    className={SHORTCUT}
                    aria-pressed={horizon === date}
                    onClick={() => choose(date)}
                  >
                    {months}M
                  </button>
                );
              })}
            </fieldset>
          </div>
          {projection && (
            <>
              <Stat caption="Current total">
                <Amount cents={projection.startingBalance} size="large" />
              </Stat>
              <Stat caption={`Projected on ${formatDay(projection.horizon)}`}>
                <Amount cents={projection.finalBalance} size="large" />
              </Stat>
            </>
          )}
          {projection && summary && (
            <section
              aria-label="Shortfall"
              className="flex flex-col gap-4 rounded-2xl bg-negative p-16 text-13 text-text-on-ink"
            >
              <span>
                <span aria-hidden="true">⚠ </span>Goes below $0.00 on{' '}
                {formatDay(projection.occurrences[summary.first].date)}
              </span>
              <span className="text-22 font-semibold tracking-tight tabular-nums">
                {formatCents(projection.occurrences[summary.first].runningBalance as Cents)}
              </span>
              <span>
                Lowest {formatCents(summary.lowest.runningBalance as Cents)} on{' '}
                {formatDay(summary.lowest.date)}.
              </span>
              {summary.periods.map((range) => (
                <span key={range.start}>Below zero again {period(range)}.</span>
              ))}
            </section>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-20">
          {projection && series.length > 0 && (
            <section className={CARD} aria-label="Projected balance">
              <Suspense fallback={<div className="h-190" />}>
                <LineChart
                  label="Projected balance by day"
                  from={today}
                  series={series}
                  selected={selected ?? series.length - 1}
                  onSelect={setSelected}
                />
              </Suspense>
            </section>
          )}
          {projectionQuery.isError ? (
            <ErrorNotice
              title="The projection couldn't load, so it is not shown."
              error={projectionQuery.error}
              onRetry={() => void projectionQuery.refetch()}
            />
          ) : !projection ? (
            <Skeleton label="Loading projection…" shapes={['block', 'row', 'row', 'row']} />
          ) : projection.occurrences.length === 0 ? (
            <EmptyState
              icon={ICONS.projection}
              title={`Nothing scheduled before ${formatDay(projection.horizon)}`}
              hint={`The balance stays at ${formatCents(projection.finalBalance as Cents)}. Schedule a payment or pick a later date.`}
              action={{ label: 'Schedule payment', onClick: () => void navigate('/upcoming') }}
            />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-sand-350 bg-sand-0 shadow-card">
              <Table
                caption={`Scheduled payments up to ${formatDay(projection.horizon)}`}
                columns={[
                  { label: 'Date' },
                  { label: 'Payment' },
                  { label: 'Amount', align: 'right' },
                  { label: 'Balance after', align: 'right' },
                ]}
              >
                {projection.occurrences.map((occurrence, index) => {
                  const first = index === summary?.first;
                  return (
                    <tr
                      key={`${occurrence.scheduledItemId}-${occurrence.date}-${index}`}
                      className={first ? 'bg-negative-soft' : ''}
                    >
                      <td>
                        <span className="flex items-center gap-8 font-mono text-12 whitespace-nowrap text-text-strong">
                          {formatDay(occurrence.date)}
                          {occurrence.overdue && <span className={CHIP_WARNING}>Overdue</span>}
                        </span>
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-8 font-medium">
                          <span className={TRUNCATE}>{occurrence.description}</span>
                          {first && (
                            <span className="inline-flex h-24 shrink-0 items-center rounded-pill bg-negative px-10 text-12 font-semibold text-text-on-ink">
                              Below $0.00
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={TD_AMOUNT}>
                        <Amount
                          cents={
                            occurrence.kind === 'bill' ? `-${occurrence.amount}` : occurrence.amount
                          }
                          sign="always"
                        />
                      </td>
                      <td className={`${TD_AMOUNT} font-semibold`}>
                        <Amount cents={occurrence.runningBalance} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
              <div className="flex h-56 items-center justify-between gap-12 bg-ink-900 px-22">
                <span className="text-14 text-ink-300">
                  {projection.occurrences.length} payment
                  {projection.occurrences.length === 1 ? '' : 's'} · final balance on{' '}
                  {formatDay(projection.horizon)}
                </span>
                <span className="text-20 font-semibold text-text-on-ink tabular-nums">
                  {formatCents(projection.finalBalance as Cents)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
