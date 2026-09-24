import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { queryKeys } from '../../../../shared/lib/query-keys';
import {
  BUTTON,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  INPUT,
  LABEL,
  SEGMENT,
  SEGMENTED,
} from '../../../../shared/lib/styles';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { useSavedFeedback } from '../../../../shared/ui/Toast/Toast';

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
  const saved = useSavedFeedback();
  const [formError, setFormError] = useState<{ title: string; error: unknown } | null>(null);
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
      await saved('Category saved.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, ['name', 'type']);
      setFormError({ title: "The category couldn't be saved.", error });
    },
  });

  return (
    <form
      className={FORM}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          setFormError(null);
          return mutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && <ErrorNotice title={formError.title} error={formError.error} />}
      <div className={FIELD}>
        <label className={LABEL} htmlFor="category-name">
          Name
        </label>
        <input
          id="category-name"
          type="text"
          className={INPUT}
          autoFocus
          data-autofocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...register('name', { required: 'name is required', maxLength: 60 })}
        />
        {errors.name && (
          <p className={FIELD_ERROR} role="alert" id="category-name-error">
            {errors.name.message || 'name must be at most 60 characters'}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <span className={LABEL} id="category-type-label">
          Type
        </span>
        <div
          className={SEGMENTED}
          role="radiogroup"
          aria-labelledby="category-type-label"
          aria-invalid={errors.type ? true : undefined}
          aria-describedby={errors.type ? 'category-type-error' : undefined}
        >
          <label className={SEGMENT}>
            <input className="sr-only" type="radio" value="expense" {...register('type')} />
            Expense
          </label>
          <label className={SEGMENT}>
            <input className="sr-only" type="radio" value="income" {...register('type')} />
            Income
          </label>
        </div>
        {errors.type && (
          <p className={FIELD_ERROR} role="alert" id="category-type-error">
            {errors.type.message}
          </p>
        )}
      </div>
      <div className={FORM_ACTIONS}>
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : category ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </form>
  );
}
