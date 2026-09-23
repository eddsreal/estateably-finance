import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { Cents, formatPlain, parseDollars } from '../../../../shared/lib/money';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';

type FormValues = { name: string; budget: string };

export type EditableProject = { id: string; name: string; budget?: string };

export function ProjectForm({
  project,
  onDone,
}: {
  project: EditableProject | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: project?.name ?? '',
      budget: project?.budget === undefined ? '' : formatPlain(project.budget as Cents),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const budget = values.budget.trim() === '' ? null : (parseDollars(values.budget) as string);
      return project
        ? unwrap(
            api.PATCH('/projects/{id}', {
              params: { path: { id: project.id } },
              body: { name: values.name, budget },
            }),
          )
        : unwrap(
            api.POST('/projects', {
              body: { name: values.name, ...(budget === null ? {} : { budget }) },
            }),
          );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      onDone();
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, ['name', 'budget']));
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
        <label htmlFor="project-name">Name</label>
        <input
          id="project-name"
          type="text"
          autoFocus
          data-autofocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'project-name-error' : undefined}
          {...register('name', {
            validate: (value) => {
              const trimmed = value.trim();
              if (trimmed.length === 0) return 'name is required';
              return trimmed.length <= 60 || 'name must be at most 60 characters';
            },
          })}
        />
        {errors.name && (
          <p className="field-error" id="project-name-error">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="project-budget">
          Budget <span className="optional">optional</span>
        </label>
        <Controller
          control={control}
          name="budget"
          rules={{
            validate: (value) => {
              if (value.trim() === '') return true;
              const cents = parseDollars(value);
              if (cents === null) return 'Enter a dollar amount like 1,234.50';
              return BigInt(cents) > 0n || 'budget must be positive; leave it empty for no budget';
            },
          }}
          render={({ field }) => (
            <MoneyInput
              id="project-budget"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={!!errors.budget}
              describedBy={errors.budget ? 'project-budget-error' : undefined}
              ref={field.ref}
            />
          )}
        />
        {errors.budget && (
          <p className="field-error" id="project-budget-error">
            {errors.budget.message}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={isSubmitting}>
          {project ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
