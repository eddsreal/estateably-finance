import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { CategoryForm, EditableCategory } from '../CategoryForm/CategoryForm';

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableCategory | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(showArchived),
    queryFn: () =>
      unwrap(api.GET('/categories', { params: { query: { includeArchived: showArchived } } })),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      unwrap(
        archive
          ? api.POST('/categories/{id}/archive', { params: { path: { id } } })
          : api.POST('/categories/{id}/unarchive', { params: { path: { id } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  });

  if (categoriesQuery.isPending) {
    return <p className="page">Loading categories…</p>;
  }
  if (categoriesQuery.isError) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>The categories could not be loaded.</span>
          <button
            type="button"
            className="btn compact"
            onClick={() => void categoriesQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const categories = categoriesQuery.data;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Categories</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          New category
        </button>
      </div>
      <div className="card">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived categories
        </label>
        {categories.length === 0 ? (
          <EmptyState
            title="No categories yet"
            hint="Create a category to classify expenses and income."
            actionLabel="New category"
            onAction={() => setCreating(true)}
          />
        ) : (
          <Table
            caption="Categories"
            columns={[{ label: 'Name' }, { label: 'Type' }, { label: 'Actions' }]}
          >
            {categories.map((category) => (
              <tr key={category.id}>
                <td>
                  {category.name}
                  {category.archived && <span className="chip warning">archived</span>}
                </td>
                <td>
                  <span className={`chip ${category.type}`}>{category.type}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="row-action"
                    onClick={() =>
                      setEditing({ id: category.id, name: category.name, type: category.type })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    onClick={() =>
                      archiveMutation.mutate({ id: category.id, archive: !category.archived })
                    }
                  >
                    {category.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <Modal title="New category" open={creating} onClose={() => setCreating(false)}>
        <CategoryForm category={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit category" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <CategoryForm category={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
