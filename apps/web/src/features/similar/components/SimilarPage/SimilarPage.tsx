import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { isApiError } from '../../../../shared/lib/form-errors';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';

type Range = { from: string; to: string };

const AI_DISABLED_REASON = 'AI narrative is disabled: no API key configured.';

function localToday(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function requestError(error: unknown): string {
  return isApiError(error)
    ? `${error.code}: ${error.message} (ref ${error.correlationId})`
    : 'The request failed. Check that the API is running and try again.';
}

export function SimilarPage() {
  const [from, setFrom] = useState(`${localToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(localToday());
  const [range, setRange] = useState<Range | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const navigate = useNavigate();

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
  const narrative = useMutation({
    mutationFn: (body: Range) => unwrap(api.POST('/reports/similar/narrative', { body })),
    onError: (error) => {
      if (isApiError(error) && error.code === 'AI_NOT_CONFIGURED') setAiDisabled(true);
      else setAiNotice(requestError(error));
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const report = reportQuery.data;

  function generate() {
    narrative.reset();
    setAiNotice(null);
    setRange({ from, to });
    if (range?.from === from && range.to === to) void reportQuery.refetch();
  }

  function requestNarrative() {
    if (!range) return;
    setAiNotice(null);
    narrative.mutate(range);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Similar transactions</h1>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="similar-from">From</label>
            <input
              id="similar-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="similar-to">To</label>
            <input
              id="similar-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={from === '' || to === ''}
            onClick={generate}
          >
            Generate report
          </button>
          <button
            type="button"
            className="btn"
            disabled={aiDisabled || !report || narrative.isPending}
            title={aiDisabled ? AI_DISABLED_REASON : undefined}
            aria-describedby={aiDisabled ? 'ai-disabled-reason' : undefined}
            onClick={requestNarrative}
          >
            {narrative.isPending ? 'Writing narrative…' : '✦ AI narrative'}
          </button>
        </div>
        {aiDisabled && (
          <p id="ai-disabled-reason" className="hint">
            {AI_DISABLED_REASON}
          </p>
        )}
      </div>
      {aiNotice && (
        <div className="info-banner" role="alert">
          <span>The AI narrative failed; the report below is unaffected. {aiNotice}</span>
          <button type="button" className="btn compact" onClick={() => setAiNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {narrative.data && (
        <div className="card">
          <h2>Narrative</h2>
          <p>{narrative.data.narrative}</p>
        </div>
      )}
      {range === null ? (
        <div className="card">
          <EmptyState
            title="No report yet"
            hint="Generate a report to group repeated merchants and surface the five most expensive transactions of the period."
          />
        </div>
      ) : reportQuery.isError ? (
        <div className="form-banner" role="alert">
          {requestError(reportQuery.error)}
        </div>
      ) : !report ? (
        <div className="card">
          <p>Loading report…</p>
        </div>
      ) : report.groups.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No expenses in this period"
            hint="Expenses dated between these two days will be grouped here."
            actionLabel="Go to transactions"
            onAction={() => void navigate('/transactions')}
          />
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Groups by total, descending</h2>
            <Table
              caption={`Groups from ${report.from} to ${report.to}, by total descending`}
              columns={[
                { label: 'Description' },
                { label: 'Transactions', align: 'right' },
                { label: 'Total', align: 'right' },
              ]}
            >
              {report.groups.map((group) => (
                <tr key={group.key}>
                  <td>
                    {group.key}{' '}
                    {group.key === report.topGroupKey && (
                      <span className="chip warning">Most expensive group</span>
                    )}
                  </td>
                  <td className="amount">{group.count}</td>
                  <td className="amount">{formatCents(group.total as Cents)}</td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="card">
            <h2>Top 5 most expensive</h2>
            <Table
              caption="Top 5 most expensive"
              columns={[
                { label: 'Date' },
                { label: 'Description' },
                { label: 'Account' },
                { label: 'Amount', align: 'right' },
              ]}
            >
              {report.topTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>
                    <button
                      type="button"
                      className="row-action"
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
                  <td className="amount">{formatCents(transaction.amount as Cents)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </>
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
