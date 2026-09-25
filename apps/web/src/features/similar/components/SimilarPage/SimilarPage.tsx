import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { formatDay, localToday } from '../../../../shared/lib/dates';
import { isApiError, NETWORK_ERROR } from '../../../../shared/lib/form-errors';
import { Cents, compareCents, toPlotNumber } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import {
  BANNER_WARNING,
  BUTTON,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  HINT,
  ICON_BUTTON,
  INPUT,
  LABEL,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
  SECTION_TITLE,
  TOOLBAR,
  TOOLBAR_FIELD,
  TRUNCATE,
} from '../../../../shared/lib/styles';
import { NarrativeStatus, useNarrative } from '../../hooks/useNarrative';

type Range = { from: string; to: string };

const CAPTION =
  'flex justify-between gap-12 border-b border-sand-350 px-18 pt-14 pb-10 font-mono text-11 tracking-wide text-text-2 uppercase';

const AI_DISABLED_REASON = 'Disabled until an AI key is configured.';

const NARRATIVE_ANNOUNCEMENT: Partial<Record<NarrativeStatus, string>> = {
  streaming: 'Generating summary…',
  complete: 'Summary complete.',
};

export function SimilarPage() {
  const [from, setFrom] = useState(`${localToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(localToday());
  const [range, setRange] = useState<Range | null>(null);
  const [aiRejected, setAiRejected] = useState(false);
  const [aiError, setAiError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const fromRef = useRef<HTMLInputElement>(null);

  const aiStatusQuery = useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => unwrap(api.GET('/ai/status')),
  });
  const aiDisabled = aiRejected || aiStatusQuery.data?.configured === false;

  const reportQuery = useQuery({
    queryKey: queryKeys.reportSimilar(range?.from ?? '', range?.to ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/reports/similar', { params: { query: { from: range!.from, to: range!.to } } }),
      ),
    enabled: range !== null,
    retry: false,
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
  const narrative = useNarrative({
    onError: (error) => {
      if (isApiError(error) && error.code === 'AI_NOT_CONFIGURED') setAiRejected(true);
      else {
        setCopied(false);
        setAiError(error);
      }
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const report = reportQuery.data;
  const groups = report?.groups ?? [];
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  const max = groups.reduce<Cents>(
    (high, group) => (compareCents(group.total as Cents, high) > 0 ? (group.total as Cents) : high),
    '0' as Cents,
  );

  function generate() {
    narrative.clear();
    setAiError(null);
    setRange({ from, to });
    if (range?.from === from && range.to === to) void reportQuery.refetch();
  }

  function requestNarrative() {
    if (!range) return;
    setAiError(null);
    void narrative.start(range);
  }

  return (
    <div className={PAGE}>
      <div className={`${PAGE_HEADER} items-end`}>
        <div className="flex flex-col">
          <h1 className={PAGE_TITLE}>Similar transactions</h1>
          <p className="text-14 text-text-2">
            {report && report.groups.length > 0
              ? `Expenses only · ${count} in ${report.groups.length} group${report.groups.length === 1 ? '' : 's'}`
              : 'Expenses only'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-8">
          <div className={TOOLBAR}>
            <div className={TOOLBAR_FIELD}>
              <label className={LABEL} htmlFor="similar-from">
                From
              </label>
              <input
                id="similar-from"
                ref={fromRef}
                type="date"
                className={INPUT}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className={TOOLBAR_FIELD}>
              <label className={LABEL} htmlFor="similar-to">
                To
              </label>
              <input
                id="similar-to"
                type="date"
                className={INPUT}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={from === '' || to === ''}
              aria-describedby={from === '' || to === '' ? 'generate-disabled-reason' : undefined}
              onClick={generate}
            >
              Generate report
            </button>
            <button
              type="button"
              className={BUTTON}
              disabled={aiDisabled || !report || narrative.status === 'streaming'}
              title={aiDisabled ? AI_DISABLED_REASON : undefined}
              aria-describedby={aiDisabled || !report ? 'ai-disabled-reason' : undefined}
              onClick={requestNarrative}
            >
              {narrative.status === 'streaming' ? 'Summarizing…' : '✦ Summarize with AI'}
            </button>
          </div>
          {(from === '' || to === '') && (
            <p id="generate-disabled-reason" className={HINT}>
              Pick both dates to generate a report.
            </p>
          )}
          {(aiDisabled || !report) && (
            <p id="ai-disabled-reason" className={HINT}>
              {aiDisabled ? AI_DISABLED_REASON : 'Generate a report to summarize it with AI.'}
            </p>
          )}
        </div>
      </div>
      {aiError !== null && (
        <div className={`${BANNER_WARNING} rounded-xl px-14 py-12`} role="alert">
          <span
            aria-hidden="true"
            className="grid size-24 flex-none place-items-center rounded-pill bg-warning text-13 font-bold text-text-on-ink"
          >
            !
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-14 font-semibold">
              The AI summary couldn&apos;t be generated. The report below is unaffected.
            </span>
            <span className="text-13">{isApiError(aiError) ? aiError.message : NETWORK_ERROR}</span>
            {isApiError(aiError) && (
              <span className="font-mono text-12 break-all">
                Correlation ID {aiError.correlationId}
              </span>
            )}
          </span>
          {isApiError(aiError) && (
            <button
              type="button"
              className={`${BUTTON_COMPACT} border-warning-line bg-warning-surface text-warning-ink`}
              onClick={() => {
                void navigator.clipboard
                  .writeText(aiError.correlationId)
                  .then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy ID'}
            </button>
          )}
          <button
            type="button"
            className={`${BUTTON_COMPACT} border-warning-line bg-warning-surface text-warning-ink`}
            onClick={requestNarrative}
          >
            Try again
          </button>
          <button
            type="button"
            className={`${ICON_BUTTON} text-18 text-warning-ink`}
            aria-label="Dismiss"
            onClick={() => setAiError(null)}
          >
            ×
          </button>
        </div>
      )}
      <output className="sr-only">{NARRATIVE_ANNOUNCEMENT[narrative.status] ?? ''}</output>
      {narrative.text !== '' && (
        <div className={CARD} aria-busy={narrative.status === 'streaming'}>
          <h2 className={SECTION_TITLE}>Narrative</h2>
          <p className="text-15 whitespace-pre-wrap text-text-1">{narrative.text}</p>
        </div>
      )}
      {range === null ? (
        <EmptyState
          icon={ICONS.similar}
          title="No report yet"
          hint="Generate a report to group repeated merchants and surface the five most expensive transactions of the period."
        />
      ) : reportQuery.isError ? (
        <ErrorNotice
          title="The report couldn't load."
          error={reportQuery.error}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : !report ? (
        <Skeleton label="Loading report…" shapes={['row', 'row', 'row', 'row']} />
      ) : report.groups.length === 0 ? (
        <EmptyState
          icon={ICONS.similar}
          title="No similar expenses in this range"
          hint={`No two expenses between ${formatDay(report.from)} and ${formatDay(report.to)} have a similar description.`}
          action={{ label: 'Change dates', onClick: () => fromRef.current?.focus() }}
        />
      ) : (
        <div className="grid gap-16 md:grid-cols-(--similar-grid)">
          <section
            aria-labelledby="similar-groups"
            className="overflow-hidden rounded-3xl border border-sand-350 bg-sand-0 shadow-card"
          >
            <h2 id="similar-groups" className={CAPTION}>
              <span>Groups by description</span>
              <span aria-hidden="true">Total</span>
            </h2>
            <ul aria-label={`Groups from ${report.from} to ${report.to}, by total descending`}>
              {report.groups.map((group) => {
                const top = group.key === report.topGroupKey;
                const width = Math.max(
                  2,
                  toPlotNumber(group.total as Cents, '0' as Cents, max, 100),
                );
                return (
                  <li
                    key={group.key}
                    className={`flex flex-col gap-8 border-b border-sand-200 px-18 py-14 last:border-b-0 ${top ? 'border-l-3 border-l-warning bg-warning-surface' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-12">
                      <span className="flex min-w-0 items-center gap-8">
                        <span className={`${TRUNCATE} text-15 font-semibold text-text-1`}>
                          {group.key}
                        </span>
                        <span className="flex-none text-13 text-text-2">
                          · {group.count} expense{group.count === 1 ? '' : 's'}
                        </span>
                        {top && (
                          <span className="inline-flex h-22 flex-none items-center rounded-pill bg-warning px-8 text-11 font-semibold text-text-on-ink">
                            Most expensive group
                          </span>
                        )}
                      </span>
                      <span className="text-14 font-semibold">
                        <Amount cents={group.total} />
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="block h-6 overflow-hidden rounded-pill bg-sand-200"
                    >
                      <span
                        className="block h-full rounded-pill bg-warning"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="truncate text-12 text-text-2">
                      {group.transactions.map((transaction) => transaction.description).join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section
            aria-labelledby="similar-top"
            className="self-start overflow-hidden rounded-3xl border border-sand-350 bg-sand-0 shadow-card"
          >
            <h2 id="similar-top" className={CAPTION}>
              Top 5 most expensive
            </h2>
            <ol aria-label="Top 5 most expensive">
              {report.topTransactions.map((transaction, index) => (
                <li
                  key={transaction.id}
                  className="flex items-center gap-12 py-12 border-b border-sand-200 px-18 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-28 flex-none place-items-center rounded-sm bg-ink-900 font-mono text-12 font-semibold text-text-on-ink"
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <button
                      type="button"
                      className={`${ROW_ACTION_TEXT} -ml-8`}
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
                    <span className="truncate text-12 text-text-2">
                      {formatDay(transaction.date)} · {accountName(transaction.accountId)}
                    </span>
                  </span>
                  <span className="text-14 font-semibold">
                    <Amount cents={transaction.amount} />
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
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
