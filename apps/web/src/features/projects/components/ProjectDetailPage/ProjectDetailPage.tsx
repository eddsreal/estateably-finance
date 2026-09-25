import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
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
    return (
      <div className={PAGE}>
        <Skeleton label="Loading project…" shapes={['line', 'block', 'row', 'row', 'row']} />
      </div>
    );
  }
  if (projectsQuery.isError) {
    return (
      <div className={PAGE}>
        <ErrorNotice
          title="The project couldn't load."
          error={projectsQuery.error}
          onRetry={() => void projectsQuery.refetch()}
        />
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
      {transactionsQuery.isError ? (
        <ErrorNotice
          title="The project's expenses couldn't load."
          error={transactionsQuery.error}
          onRetry={() => void transactionsQuery.refetch()}
        />
      ) : !page ? (
        <Skeleton label="Loading expenses…" shapes={['row', 'row', 'row', 'row']} />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={ICONS.projects}
          title="No expenses in this project yet"
          hint="Pick this project when recording an expense and it will be listed here."
          action={{ label: 'Go to transactions', onClick: () => void navigate('/transactions') }}
        />
      ) : (
        <div className={CARD}>
          <Table
            caption={`Expenses in ${project.name}`}
            columns={[
              { label: 'Date' },
              { label: 'Description' },
              { label: 'Account', hideOnPhone: true },
              { label: 'Category', hideOnPhone: true },
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
                <td className="max-md:hidden">{accountName(transaction.accountId)}</td>
                <td className="max-md:hidden">{categoryName(transaction.categoryId)}</td>
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
              {offset > 0 && (
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>
              )}{' '}
              {page.offset + PAGE_SIZE < page.total && (
                <button
                  type="button"
                  className={BUTTON_COMPACT}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              )}
            </span>
          </div>
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
