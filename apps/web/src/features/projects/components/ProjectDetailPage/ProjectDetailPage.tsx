import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Stat } from '../../../../shared/ui/Stat/Stat';
import { Table } from '../../../../shared/ui/Table/Table';
import {
  EditableTransaction,
  TransactionForm,
} from '../../../../shared/ui/TransactionForm/TransactionForm';
import { OverBudgetChip, overBudgetBy, RemainingAmount } from '../ProjectFigures/ProjectFigures';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  CARD,
  CHIP_WARNING,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  PAGINATION,
  ROW_ACTION_TEXT,
  TD_AMOUNT,
} from '../../../../shared/lib/styles';

const PAGE_SIZE = 50;

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const navigate = useNavigate();

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
    return <p className={PAGE}>Loading project…</p>;
  }
  if (projectsQuery.isError) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>The project could not be loaded.</span>
          <button
            type="button"
            className={BUTTON_COMPACT}
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
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>This project does not exist.</span>
          <Link className={BUTTON_COMPACT} to="/projects">
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
  const over = overBudgetBy(project);

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>
          {project.name}
          {project.status === 'closed' && <span className={CHIP_WARNING}>closed</span>}
          {over && <OverBudgetChip by={over} />}
        </h1>
        <Link className={LINK} to="/projects">
          Back to projects
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-14">
        <Stat
          caption="Spent"
          detail={
            project.budget !== undefined && (
              <span className="text-13 text-text-2">
                of a {formatCents(project.budget as Cents)} budget
              </span>
            )
          }
        >
          <Amount cents={project.spent} size="large" />
        </Stat>
        <Stat caption="Remaining">
          <RemainingAmount project={project} />
        </Stat>
      </div>
      <div className={CARD}>
        {transactionsQuery.isError ? (
          <div className={BANNER_WARNING} role="alert">
            <span>The project&apos;s expenses could not be loaded.</span>
            <button
              type="button"
              className={BUTTON_COMPACT}
              onClick={() => void transactionsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !page ? (
          <p className="text-14 text-text-2">Loading expenses…</p>
        ) : page.items.length === 0 ? (
          <EmptyState
            title="No expenses in this project yet"
            hint="Pick this project when recording an expense and it will be listed here."
            actionLabel="Go to transactions"
            onAction={() => void navigate('/transactions')}
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
                  <td className="font-mono text-12 text-text-2">{transaction.date}</td>
                  <td>
                    <button
                      type="button"
                      className={ROW_ACTION_TEXT}
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
                  <td className={TD_AMOUNT}>
                    <Amount cents={`-${transaction.amount}`} />
                  </td>
                </tr>
              ))}
            </Table>
            <div className={PAGINATION}>
              <span>
                {`${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} of ${page.total}`}
              </span>
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
