import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { isApiError, NETWORK_ERROR } from '../../../../shared/lib/form-errors';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { ICONS } from '../../../../shared/ui/Icon/Icon';
import { KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Skeleton } from '../../../../shared/ui/Skeleton/Skeleton';
import { Table } from '../../../../shared/ui/Table/Table';
import { useSavedFeedback, useToast } from '../../../../shared/ui/Toast/Toast';
import { CategoryForm, EditableCategory } from '../CategoryForm/CategoryForm';
import {
  BUTTON,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_WARNING,
  FIELD_ERROR,
  INPUT,
  LABEL,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  SEGMENT,
  SEGMENTED,
  TRUNCATE,
} from '../../../../shared/lib/styles';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

type Rename = { id: string; name: string; draft: string; error: string | null };

const normalize = (name: string) => name.trim().toLowerCase();

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const saved = useSavedFeedback();
  const { showError } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [rename, setRename] = useState<Rename | null>(null);
  const [returnFocus, setReturnFocus] = useState<string | null>(null);

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
    onSuccess: async (_, { archive }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      await saved(archive ? 'Category archived.' : 'Category restored.');
    },
    onError: showError,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.PATCH('/categories/{id}', { params: { path: { id } }, body: { name } })),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      closeRename(id);
      await saved('Category renamed.');
    },
    onError: (error) => {
      showError(error);
      setRename((current) =>
        current
          ? { ...current, error: isApiError(error) ? error.message : NETWORK_ERROR }
          : current,
      );
    },
  });

  if (categoriesQuery.isPending) {
    return (
      <div className={PAGE}>
        <Skeleton label="Loading categories…" shapes={['line', 'row', 'row', 'row', 'row']} />
      </div>
    );
  }
  if (categoriesQuery.isError) {
    return (
      <div className={PAGE}>
        <ErrorNotice
          title="The categories couldn't load."
          error={categoriesQuery.error}
          onRetry={() => void categoriesQuery.refetch()}
        />
      </div>
    );
  }

  const categories = categoriesQuery.data;
  const shown = categories.filter((category) => filter === 'all' || category.type === filter);
  const count = (value: Filter) =>
    value === 'all'
      ? categories.length
      : categories.filter((category) => category.type === value).length;

  function closeRename(id: string) {
    setRename(null);
    setReturnFocus(id);
  }

  function saveRename(current: Rename) {
    const name = current.draft.trim();
    const fail = (error: string) => setRename({ ...current, error });
    if (name === '') return fail('name is required');
    if (name.length > 60) return fail('name must be at most 60 characters');
    if (renameMutation.isPending) return;
    if (name === current.name) return closeRename(current.id);
    const taken = categories.find(
      (category) => category.id !== current.id && normalize(category.name) === normalize(name),
    );
    if (taken) return fail(`A category named "${taken.name}" already exists.`);
    setRename({ ...current, error: null });
    renameMutation.mutate({ id: current.id, name });
  }

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <div className="flex flex-col gap-2">
          <h1 className={PAGE_TITLE}>Categories</h1>
          <p className="text-14 text-text-2">
            Categories are never deleted. Archive the ones you no longer use.
          </p>
        </div>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New category
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-16">
        <div className={SEGMENTED} role="radiogroup" aria-label="Type">
          {FILTERS.map((choice) => (
            <label key={choice.value} className={`${SEGMENT} px-12`}>
              <input
                className="sr-only"
                type="radio"
                name="category-filter"
                checked={filter === choice.value}
                onChange={() => setFilter(choice.value)}
              />
              {choice.label} · {count(choice.value)}
            </label>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-8 text-14 font-medium text-text-1">
          <input
            className="accent-accent"
            type="checkbox"
            role="switch"
            aria-checked={showArchived}
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>
      {categories.length === 0 ? (
        <EmptyState
          icon={ICONS.categories}
          title="No categories yet"
          hint="Create a category to classify expenses and income."
          action={{ label: 'New category', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className={CARD}>
          <Table
            caption="Categories"
            columns={[{ label: 'Name' }, { label: 'Type' }, { label: 'Actions', align: 'right' }]}
          >
            {shown.map((category) => {
              const editor = rename?.id === category.id ? rename : null;
              const errorId = `rename-${category.id}-error`;
              return (
                <tr key={category.id} className={category.archived ? 'bg-sand-50' : undefined}>
                  <td>
                    {editor ? (
                      <div className="flex flex-col gap-4 py-6">
                        <label className={LABEL} htmlFor={`rename-${category.id}`}>
                          Rename "{category.name}"
                        </label>
                        <input
                          id={`rename-${category.id}`}
                          type="text"
                          className={`${INPUT} max-w-280`}
                          autoFocus
                          value={editor.draft}
                          aria-invalid={editor.error ? true : undefined}
                          aria-describedby={editor.error ? errorId : undefined}
                          onChange={(event) =>
                            setRename({ ...editor, draft: event.target.value, error: null })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveRename(editor);
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              closeRename(category.id);
                            }
                          }}
                        />
                        {editor.error && (
                          <p className={FIELD_ERROR} role="alert" id={errorId}>
                            ⚠ {editor.error}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span
                        className={`flex items-center gap-8 text-15 font-medium ${category.archived ? 'text-text-2' : 'text-text-1'}`}
                      >
                        <span className={TRUNCATE}>{category.name}</span>
                        {category.archived && <span className={CHIP_WARNING}>Archived</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    <KindGlyph kind={category.type} showLabel />
                  </td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-6">
                      {editor ? (
                        <Fragment key="edit">
                          <button
                            type="button"
                            className={BUTTON}
                            onClick={() => closeRename(category.id)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={BUTTON_PRIMARY}
                            onClick={() => saveRename(editor)}
                          >
                            Save
                          </button>
                        </Fragment>
                      ) : (
                        <Fragment key="view">
                          <button
                            type="button"
                            className={BUTTON_COMPACT}
                            aria-label={`Rename ${category.name}`}
                            autoFocus={returnFocus === category.id}
                            onClick={() =>
                              setRename({
                                id: category.id,
                                name: category.name,
                                draft: category.name,
                                error: null,
                              })
                            }
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className={BUTTON_COMPACT}
                            aria-label={`Change type of ${category.name}`}
                            onClick={() =>
                              setEditing({
                                id: category.id,
                                name: category.name,
                                type: category.type,
                              })
                            }
                          >
                            Change type
                          </button>
                          <button
                            type="button"
                            className={BUTTON_COMPACT}
                            aria-label={`${category.archived ? 'Unarchive' : 'Archive'} ${category.name}`}
                            onClick={() =>
                              archiveMutation.mutate({
                                id: category.id,
                                archive: !category.archived,
                              })
                            }
                          >
                            {category.archived ? 'Unarchive' : 'Archive'}
                          </button>
                        </Fragment>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
      {showArchived &&
        categories.length > 0 &&
        !categories.some((category) => category.archived) && (
          <EmptyState
            icon={ICONS.categories}
            title="No archived categories"
            hint="Categories you archive show up here and can be restored at any time."
          />
        )}
      <Modal title="New category" open={creating} onClose={() => setCreating(false)}>
        <CategoryForm category={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit category" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <CategoryForm category={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
