import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import { OverBudgetChip, RemainingAmount } from '../ProjectFigures/ProjectFigures';

const PAGE_SIZE = 50;

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsList,
    queryFn: () => unwrap(api.GET('/projects')),
  });
  const transactionsQuery = useQuery({
    queryKey: queryKeys.projectTransactions(projectId, offset),
    queryFn: () =>
      unwrap(
        api.GET('/projects/{id}/transactions', {
          params: { path: { id: projectId }, query: { limit: PAGE_SIZE, offset } },
        }),
      ),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });

  if (projectsQuery.isPending) {
    return <p className="page">Loading project…</p>;
  }
  if (projectsQuery.isError) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>The project could not be loaded.</span>
          <button
            type="button"
            className="btn compact"
            onClick={() => void projectsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const projects = projectsQuery.data;
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>This project does not exist.</span>
          <Link className="page-link" to="/projects">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const categoryName = (id?: string) =>
    categories.find((category) => category.id === id)?.name ?? '';
  const page = transactionsQuery.data;

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {project.name}
          {project.status === 'closed' && <span className="chip warning">closed</span>}
          {project.overBudget && <OverBudgetChip />}
        </h1>
        <Link className="page-link" to="/projects">
          Back to projects
        </Link>
      </div>
      <div className="card stat">
        <span className="caption">Spent</span>
        <span className="value">
          <span className="amount">{formatCents(project.spent as Cents)}</span>
        </span>
        {project.budget !== undefined && (
          <span>of a {formatCents(project.budget as Cents)} budget</span>
        )}
      </div>
      <div className="card stat">
        <span className="caption">Remaining</span>
        <span className="value">
          <RemainingAmount project={project} />
        </span>
      </div>
      <div className="card">
        {transactionsQuery.isError ? (
          <div className="info-banner" role="alert">
            <span>The project&apos;s expenses could not be loaded.</span>
            <button
              type="button"
              className="btn compact"
              onClick={() => void transactionsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !page ? (
          <p>Loading expenses…</p>
        ) : page.items.length === 0 ? (
          <EmptyState
            title="No expenses in this project yet"
            hint="Pick this project when recording an expense and it will be listed here."
          />
        ) : (
          <>
            <Table
              caption={`Expenses in ${project.name}`}
              columns={[
                { label: 'Date' },
                { label: 'Description' },
                { label: 'Account' },
                { label: 'Category' },
                { label: 'Amount', align: 'right' },
              ]}
            >
              {page.items.map((transaction) => (
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
                  <td>{categoryName(transaction.categoryId)}</td>
                  <td className="amount">
                    <span className="amount negative">
                      -{formatCents(transaction.amount as Cents)}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="pagination">
              <span>
                {`${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} of ${page.total}`}
              </span>
              <span>
                <button
                  type="button"
                  className="btn compact"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>{' '}
                <button
                  type="button"
                  className="btn compact"
                  disabled={page.offset + PAGE_SIZE >= page.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </span>
            </div>
          </>
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
