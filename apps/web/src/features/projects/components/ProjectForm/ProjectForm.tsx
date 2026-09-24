import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { Cents, formatPlain, parseDollars } from '../../../../shared/lib/money';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';
import {
  BUTTON,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  INPUT,
  LABEL,
  OPTIONAL,
} from '../../../../shared/lib/styles';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { useSavedFeedback } from '../../../../shared/ui/Toast/Toast';

type FormValues = { name: string; budget: string };

export type EditableProject = { id: string; name: string; budget?: string };

export function ProjectForm({
  project,
  onDone,
}: {
  project: EditableProject | null;
  onDone: () => void;
}) {
  const saved = useSavedFeedback();
  const [formError, setFormError] = useState<{ title: string; error: unknown } | null>(null);
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
      await saved('Project saved.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, ['name', 'budget']);
      setFormError({ title: "The project couldn't be saved.", error });
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
        <label className={LABEL} htmlFor="project-name">
          Name
        </label>
        <input
          id="project-name"
          type="text"
          className={INPUT}
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
          <p className={FIELD_ERROR} role="alert" id="project-name-error">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="project-budget">
          Budget <span className={OPTIONAL}>optional</span>
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
          <p className={FIELD_ERROR} role="alert" id="project-budget-error">
            {errors.budget.message}
          </p>
        )}
      </div>
      <div className={FORM_ACTIONS}>
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : project ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
