import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { queryKeys } from '../../../../shared/lib/query-keys';

export type CategoryFormValues = { name: string; type: 'expense' | 'income' };

export type EditableCategory = { id: string; name: string; type: 'expense' | 'income' };

export function CategoryForm({
  category,
  onDone,
}: {
  category: EditableCategory | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    defaultValues: category
      ? { name: category.name, type: category.type }
      : { name: '', type: 'expense' },
  });

  const mutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      category
        ? unwrap(
            api.PATCH('/categories/{id}', {
              params: { path: { id: category.id } },
              body: values,
            }),
          )
        : unwrap(api.POST('/categories', { body: values })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      onDone();
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, ['name', 'type']));
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          setFormError(null);
          return mutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && (
        <div className="form-banner" role="alert">
          {formError}
        </div>
      )}
      <div className="field">
        <label htmlFor="category-name">Name</label>
        <input
          id="category-name"
          type="text"
          autoFocus
          data-autofocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...register('name', { required: 'name is required', maxLength: 60 })}
        />
        {errors.name && (
          <p className="field-error" id="category-name-error">
            {errors.name.message || 'name must be at most 60 characters'}
          </p>
        )}
      </div>
      <div className="field">
        <span className="field-label" id="category-type-label">
          Type
        </span>
        <div className="radio-group" role="radiogroup" aria-labelledby="category-type-label">
          <label>
            <input type="radio" value="expense" {...register('type')} />
            Expense
          </label>
          <label>
            <input type="radio" value="income" {...register('type')} />
            Income
          </label>
        </div>
        {errors.type && <p className="field-error">{errors.type.message}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={isSubmitting}>
          {category ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </form>
  );
}
