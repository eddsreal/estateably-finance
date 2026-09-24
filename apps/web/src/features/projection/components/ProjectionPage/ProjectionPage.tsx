import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { Cents, isNegative } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Stat } from '../../../../shared/ui/Stat/Stat';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  CARD,
  CHIP_WARNING,
  INPUT,
  LABEL,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  TD_AMOUNT,
  TOOLBAR_FIELD,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const KIND_META = {
  bill: { kind: 'expense', label: 'Bill' },
  income: { kind: 'income', label: 'Income' },
} as const;

function shiftMonths(date: string, months: number): { year: number; month: number } {
  const [year, month] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() };
}

function endOfNextMonth(today: string): string {
  const { year, month } = shiftMonths(today, 1);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

function maxHorizon(today: string): string {
  const { year, month } = shiftMonths(today, 24);
  const [, , day] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function ProjectionPage() {
  const today = localToday();
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState(() => endOfNextMonth(today));

  const projectionQuery = useQuery({
    queryKey: queryKeys.projectionAt(horizon),
    queryFn: () => unwrap(api.GET('/projection', { params: { query: { horizon } } })),
  });

  const projection = projectionQuery.data;

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Projection</h1>
        <div className={TOOLBAR_FIELD}>
          <label className={LABEL} htmlFor="projection-horizon">
            Project up to
          </label>
          <input
            id="projection-horizon"
            type="date"
            className={INPUT}
            value={horizon}
            min={today}
            max={maxHorizon(today)}
            onChange={(event) => {
              if (event.target.value) setHorizon(event.target.value);
            }}
          />
        </div>
      </div>
      {projection && (
        <div className="grid grid-cols-2 gap-14">
          <Stat caption="Current total">
            <Amount cents={projection.startingBalance} size="large" />
          </Stat>
          <Stat caption={`Projected on ${projection.horizon}`}>
            <Amount cents={projection.finalBalance} size="large" />
          </Stat>
        </div>
      )}
      <div className={CARD}>
        {projectionQuery.isError ? (
          <div className={BANNER_WARNING} role="alert">
            <span>The projection could not be loaded, so it is not shown.</span>
            <button
              type="button"
              className={BUTTON_COMPACT}
              onClick={() => void projectionQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !projection ? (
          <p className="text-14 text-text-2">Loading projection…</p>
        ) : projection.occurrences.length === 0 ? (
          <EmptyState
            title="Nothing scheduled before this date"
            hint="Scheduled bills and income due by the chosen date will appear here with a running balance."
            actionLabel="Go to upcoming"
            onAction={() => void navigate('/upcoming')}
          />
        ) : (
          <Table
            caption={`Scheduled occurrences up to ${projection.horizon}`}
            columns={[
              { label: 'Date' },
              { label: 'Description' },
              { label: 'Kind' },
              { label: 'Amount', align: 'right' },
              { label: 'Balance after', align: 'right' },
            ]}
          >
            {projection.occurrences.map((occurrence, index) => {
              const meta = KIND_META[occurrence.kind];
              const belowZero = isNegative(occurrence.runningBalance as Cents);
              return (
                <tr key={`${occurrence.scheduledItemId}-${occurrence.date}-${index}`}>
                  <td>
                    <span className="flex items-center gap-8 font-mono text-12 text-text-2">
                      {occurrence.date}
                      {occurrence.overdue && <span className={CHIP_WARNING}>Overdue</span>}
                    </span>
                  </td>
                  <td>
                    <span className={TRUNCATE}>{occurrence.description}</span>
                  </td>
                  <td>
                    <KindGlyph kind={meta.kind} label={meta.label} showLabel />
                  </td>
                  <td className={TD_AMOUNT}>
                    <Amount
                      cents={
                        occurrence.kind === 'bill' ? `-${occurrence.amount}` : occurrence.amount
                      }
                    />
                  </td>
                  <td className={TD_AMOUNT}>
                    <span className="inline-flex items-center gap-8">
                      <Amount cents={occurrence.runningBalance} />
                      {belowZero && <span className={CHIP_WARNING}>Below zero</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </div>
  );
}
