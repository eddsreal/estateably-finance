import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { isApiError } from '../../../../shared/lib/form-errors';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import {
  hasExpenses,
  OverBudgetChip,
  overBudgetBy,
  RemainingAmount,
} from '../ProjectFigures/ProjectFigures';
import { EditableProject, ProjectForm } from '../ProjectForm/ProjectForm';
import {
  BANNER_ERROR,
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_NEUTRAL,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const BUTTON_DELETE =
  'inline-flex h-32 cursor-pointer items-center justify-center rounded-sm border border-negative-line bg-sand-0 px-12 text-13 font-medium text-negative transition duration-(--dur-hover) ease-(--ease-out) hover:bg-negative-soft active:scale-97 active:duration-(--dur-press)';

function spentPercent(spent: string, budget: string): number {
  const percent = (BigInt(spent) * 100n) / BigInt(budget);
  return Number(percent > 100n ? 100n : percent < 0n ? 0n : percent);
}

type ProjectAction = { id: string; action: 'close' | 'reopen' | 'delete' };

function requestError(error: unknown): string {
  return isApiError(error)
    ? `${error.code}: ${error.message} (ref ${error.correlationId})`
    : 'The request failed. Check that the API is running and try again.';
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableProject | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsList,
    queryFn: () => unwrap(api.GET('/projects')),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: ProjectAction) => {
      const params = { params: { path: { id } } };
      switch (action) {
        case 'close':
          return unwrap(api.POST('/projects/{id}/close', params));
        case 'reopen':
          return unwrap(api.POST('/projects/{id}/reopen', params));
        case 'delete':
          return unwrap(api.DELETE('/projects/{id}', params));
      }
    },
    onMutate: () => setActionError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
    onError: (error) => setActionError(requestError(error)),
  });

  if (projectsQuery.isPending) {
    return <p className={PAGE}>Loading projects…</p>;
  }
  if (projectsQuery.isError) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>The projects could not be loaded.</span>
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

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <div>
          <h1 className={PAGE_TITLE}>Projects</h1>
          <p className="text-14 text-text-2">
            Group expenses under a goal and track them against a budget
          </p>
        </div>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New project
        </button>
      </div>
      {actionError && (
        <div className={BANNER_ERROR} role="alert">
          {actionError}
        </div>
      )}
      {projects.length === 0 ? (
        <div className={CARD}>
          <EmptyState
            title="No projects yet"
            hint="Create a project to see what a trip or a remodel costs across accounts."
            actionLabel="New project"
            onAction={() => setCreating(true)}
          />
        </div>
      ) : (
        <ul aria-label="Projects" className="grid grid-cols-(--projects-grid) gap-14">
          {projects.map((project) => {
            const closed = project.status === 'closed';
            const over = overBudgetBy(project);
            const surface = closed
              ? 'border-dashed border-sand-700 bg-sand-50'
              : over
                ? 'border-negative-line bg-sand-0'
                : 'border-sand-350 bg-sand-0';
            return (
              <li
                key={project.id}
                className={`flex flex-col gap-14 rounded-2xl border p-18 ${surface}`}
              >
                <div className="flex items-start justify-between gap-8">
                  <div className="flex min-w-0 flex-col">
                    <Link
                      className={`${LINK} ${TRUNCATE} text-16 font-semibold`}
                      to={`/projects/${project.id}`}
                    >
                      {project.name}
                    </Link>
                    <span className="text-13 text-text-2">
                      {project.status}
                      {project.budget === undefined && ' · no budget'}
                    </span>
                  </div>
                  {over && <OverBudgetChip by={over} />}
                  {closed && <span className={CHIP_NEUTRAL}>Closed</span>}
                </div>
                {project.budget !== undefined && !closed && (
                  <div aria-hidden="true" className="h-8 overflow-hidden rounded-pill bg-sand-200">
                    <div
                      className={`h-full ${over ? 'bg-negative' : 'bg-accent'}`}
                      style={{ width: `${spentPercent(project.spent, project.budget)}%` }}
                    />
                  </div>
                )}
                <dl className="grid grid-cols-3 gap-8">
                  <div>
                    <dt className="text-12 text-text-2">Spent</dt>
                    <dd className="text-14">
                      <Amount cents={project.spent} />
                    </dd>
                  </div>
                  {project.budget !== undefined && (
                    <>
                      <div>
                        <dt className="text-12 text-text-2">Budget</dt>
                        <dd className="text-14">
                          <Amount cents={project.budget} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-12 text-text-2">Remaining</dt>
                        <dd className="text-14">
                          <RemainingAmount project={project} />
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                <div
                  className={`mt-auto flex flex-wrap items-center gap-6 border-t pt-12 ${closed ? 'border-sand-350' : 'border-sand-200'}`}
                >
                  <button
                    type="button"
                    className={BUTTON_COMPACT}
                    aria-label={`Edit ${project.name}`}
                    onClick={() =>
                      setEditing({ id: project.id, name: project.name, budget: project.budget })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={BUTTON_COMPACT}
                    aria-label={`${closed ? 'Reopen' : 'Close'} ${project.name}`}
                    onClick={() =>
                      actionMutation.mutate({
                        id: project.id,
                        action: closed ? 'reopen' : 'close',
                      })
                    }
                  >
                    {closed ? 'Reopen' : 'Close'}
                  </button>
                  {hasExpenses(project) ? (
                    <span className="ml-auto text-12 text-text-2">
                      Has expenses, can&apos;t delete
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`ml-auto ${BUTTON_DELETE}`}
                      aria-label={`Delete ${project.name}`}
                      onClick={() => actionMutation.mutate({ id: project.id, action: 'delete' })}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal title="New project" open={creating} onClose={() => setCreating(false)}>
        <ProjectForm project={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit project" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <ProjectForm project={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
