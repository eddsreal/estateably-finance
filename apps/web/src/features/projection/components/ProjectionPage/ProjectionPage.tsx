import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents, isNegative } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Table } from '../../../../shared/ui/Table/Table';

const KIND_META: Record<'bill' | 'income', { glyph: string; chip: string; label: string }> = {
  bill: { glyph: '↑', chip: 'expense', label: 'Bill' },
  income: { glyph: '↓', chip: 'income', label: 'Income' },
};

function localToday(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

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
  const [horizon, setHorizon] = useState(() => endOfNextMonth(today));

  const projectionQuery = useQuery({
    queryKey: queryKeys.projectionAt(horizon),
    queryFn: () => unwrap(api.GET('/projection', { params: { query: { horizon } } })),
  });

  const projection = projectionQuery.data;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projection</h1>
        <div className="field">
          <label htmlFor="projection-horizon">Project up to</label>
          <input
            id="projection-horizon"
            type="date"
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
        <div className="toolbar">
          <div className="card stat">
            <span className="caption">Current total</span>
            <span className="value">
              <span className="amount">{formatCents(projection.startingBalance as Cents)}</span>
            </span>
          </div>
          <div className="card stat">
            <span className="caption">Projected on {projection.horizon}</span>
            <span className="value">
              <span className="amount">{formatCents(projection.finalBalance as Cents)}</span>
            </span>
          </div>
        </div>
      )}
      <div className="card">
        {projectionQuery.isError ? (
          <div className="info-banner" role="alert">
            <span>The projection could not be loaded, so it is not shown.</span>
            <button
              type="button"
              className="btn compact"
              onClick={() => void projectionQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !projection ? (
          <p>Loading projection…</p>
        ) : projection.occurrences.length === 0 ? (
          <EmptyState
            title="Nothing scheduled before this date"
            hint="Scheduled bills and income due by the chosen date will appear here with a running balance."
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
                    {occurrence.date}
                    {occurrence.overdue && <span className="chip warning">Overdue</span>}
                  </td>
                  <td>{occurrence.description}</td>
                  <td>
                    <span className={`chip ${meta.chip}`}>
                      <span aria-hidden="true">{meta.glyph}</span> {meta.label}
                    </span>
                  </td>
                  <td className="amount">
                    {formatCents(
                      (occurrence.kind === 'bill'
                        ? `-${occurrence.amount}`
                        : occurrence.amount) as Cents,
                    )}
                  </td>
                  <td className="amount">
                    {formatCents(occurrence.runningBalance as Cents)}
                    {belowZero && <span className="chip warning">Below zero</span>}
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
