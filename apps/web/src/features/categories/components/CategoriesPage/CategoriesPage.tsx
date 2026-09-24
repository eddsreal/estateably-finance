import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { CategoryForm, EditableCategory } from '../CategoryForm/CategoryForm';

const CATEGORY_COLORS = [
  'bg-cat-1',
  'bg-cat-2',
  'bg-cat-3',
  'bg-cat-4',
  'bg-cat-5',
  'bg-cat-6',
  'bg-cat-7',
];
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHECKBOX_LABEL,
  CHIP_WARNING,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION,
  TRUNCATE,
} from '../../../../shared/lib/styles';

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
    return <p className={PAGE}>Loading categories…</p>;
  }
  if (categoriesQuery.isError) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>The categories could not be loaded.</span>
          <button
            type="button"
            className={BUTTON_COMPACT}
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
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Categories</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New category
        </button>
      </div>
      <div className={CARD}>
        <label className={`${CHECKBOX_LABEL} mb-12`}>
          <input
            className="accent-accent"
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
            {categories.map((category, index) => (
              <tr key={category.id}>
                <td>
                  <span className="flex items-center gap-8">
                    <span
                      aria-hidden="true"
                      className={`size-10 flex-none rounded-pill ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}`}
                    />
                    <span className={TRUNCATE}>{category.name}</span>
                    {category.archived && <span className={CHIP_WARNING}>archived</span>}
                  </span>
                </td>
                <td>
                  <KindGlyph kind={category.type} label={category.type} showLabel />
                </td>
                <td>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`Edit ${category.name}`}
                    onClick={() =>
                      setEditing({ id: category.id, name: category.name, type: category.type })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`${category.archived ? 'Unarchive' : 'Archive'} ${category.name}`}
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
