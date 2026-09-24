import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { isApiError } from '../../../../shared/lib/form-errors';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { OverBudgetChip, RemainingAmount } from '../ProjectFigures/ProjectFigures';
import { EditableProject, ProjectForm } from '../ProjectForm/ProjectForm';
import {
  BANNER_ERROR,
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_NEUTRAL,
  CHIP_WARNING,
  LINK,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION,
  TD_AMOUNT,
  TRUNCATE,
} from '../../../../shared/lib/styles';

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
        <h1 className={PAGE_TITLE}>Projects</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New project
        </button>
      </div>
      {actionError && (
        <div className={BANNER_ERROR} role="alert">
          {actionError}
        </div>
      )}
      <div className={CARD}>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            hint="Create a project to see what a trip or a remodel costs across accounts."
            actionLabel="New project"
            onAction={() => setCreating(true)}
          />
        ) : (
          <Table
            caption="Projects"
            columns={[
              { label: 'Name' },
              { label: 'Status' },
              { label: 'Budget', align: 'right' },
              { label: 'Spent', align: 'right' },
              { label: 'Remaining', align: 'right' },
              { label: 'Actions' },
            ]}
          >
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <span className="flex items-center gap-8">
                    <Link className={`${LINK} ${TRUNCATE}`} to={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                    {project.overBudget && <OverBudgetChip />}
                  </span>
                </td>
                <td>
                  <span className={project.status === 'closed' ? CHIP_WARNING : CHIP_NEUTRAL}>
                    {project.status}
                  </span>
                </td>
                <td className={TD_AMOUNT}>
                  {project.budget === undefined ? '—' : <Amount cents={project.budget} />}
                </td>
                <td className={TD_AMOUNT}>
                  <Amount cents={project.spent} />
                </td>
                <td className={TD_AMOUNT}>
                  <RemainingAmount project={project} />
                </td>
                <td>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`Edit ${project.name}`}
                    onClick={() =>
                      setEditing({ id: project.id, name: project.name, budget: project.budget })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`${project.status === 'closed' ? 'Reopen' : 'Close'} ${project.name}`}
                    onClick={() =>
                      actionMutation.mutate({
                        id: project.id,
                        action: project.status === 'closed' ? 'reopen' : 'close',
                      })
                    }
                  >
                    {project.status === 'closed' ? 'Reopen' : 'Close'}
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`Delete ${project.name}`}
                    onClick={() => actionMutation.mutate({ id: project.id, action: 'delete' })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <Modal title="New project" open={creating} onClose={() => setCreating(false)}>
        <ProjectForm project={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit project" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <ProjectForm project={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
