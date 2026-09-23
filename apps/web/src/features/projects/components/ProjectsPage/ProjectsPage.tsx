import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { isApiError } from '../../../../shared/lib/form-errors';
import { Cents, formatCents } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { OverBudgetChip, RemainingAmount } from '../ProjectFigures/ProjectFigures';
import { EditableProject, ProjectForm } from '../ProjectForm/ProjectForm';

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
    return <p className="page">Loading projects…</p>;
  }
  if (projectsQuery.isError) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>The projects could not be loaded.</span>
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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projects</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          New project
        </button>
      </div>
      {actionError && (
        <div className="form-banner" role="alert">
          {actionError}
        </div>
      )}
      <div className="card">
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
                  <Link className="page-link" to={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  {project.overBudget && <OverBudgetChip />}
                </td>
                <td>
                  <span className={`chip ${project.status === 'closed' ? 'warning' : ''}`}>
                    {project.status}
                  </span>
                </td>
                <td className="amount">
                  {project.budget === undefined ? '—' : formatCents(project.budget as Cents)}
                </td>
                <td className="amount">{formatCents(project.spent as Cents)}</td>
                <td className="amount">
                  <RemainingAmount project={project} />
                </td>
                <td>
                  <button
                    type="button"
                    className="row-action"
                    aria-label={`Edit ${project.name}`}
                    onClick={() =>
                      setEditing({ id: project.id, name: project.name, budget: project.budget })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="row-action"
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
                    className="row-action"
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
