import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { formatPlain, parseDollars, Cents } from '../../../../shared/lib/money';
import { AccountOption, AccountPicker } from '../../../../shared/ui/AccountPicker/AccountPicker';
import {
  CategoryOption,
  CategoryPicker,
} from '../../../../shared/ui/CategoryPicker/CategoryPicker';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';
import {
  BUTTON,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  INPUT,
  LABEL,
  OPTIONAL,
  SEGMENT,
  SEGMENTED,
} from '../../../../shared/lib/styles';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { useSavedFeedback } from '../../../../shared/ui/Toast/Toast';

export type EditableScheduledItem = {
  id: string;
  kind: 'bill' | 'income';
  description: string;
  amount: string;
  accountId: string;
  categoryId: string;
  nextDueDate: string;
  recurrence: 'once' | 'weekly' | 'monthly';
  endDate?: string;
};

type FormValues = {
  kind: 'bill' | 'income';
  description: string;
  amount: string;
  accountId: string | null;
  categoryId: string | null;
  nextDueDate: string;
  recurrence: 'once' | 'weekly' | 'monthly';
  endDate: string;
};

const FIELDS = [
  'kind',
  'description',
  'amount',
  'accountId',
  'categoryId',
  'nextDueDate',
  'recurrence',
  'endDate',
] as const;

const KINDS: { value: 'bill' | 'income'; label: string }[] = [
  { value: 'bill', label: 'Bill' },
  { value: 'income', label: 'Income' },
];

const RECURRENCES: { value: 'once' | 'weekly' | 'monthly'; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function ScheduledItemForm({
  item,
  accounts,
  categories,
  onDone,
}: {
  item: EditableScheduledItem | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
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
    defaultValues: item
      ? {
          kind: item.kind,
          description: item.description,
          amount: formatPlain(item.amount as Cents),
          accountId: item.accountId,
          categoryId: item.categoryId,
          nextDueDate: item.nextDueDate,
          recurrence: item.recurrence,
          endDate: item.endDate ?? '',
        }
      : {
          kind: 'bill',
          description: '',
          amount: '',
          accountId: null,
          categoryId: null,
          nextDueDate: localToday(),
          recurrence: 'monthly',
          endDate: '',
        },
  });
  const kind = useWatch({ control, name: 'kind' });
  const nextDueDate = useWatch({ control, name: 'nextDueDate' });
  const description = useWatch({ control, name: 'description' });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        kind: values.kind,
        description: values.description,
        amount: parseDollars(values.amount) as string,
        accountId: values.accountId as string,
        categoryId: values.categoryId as string,
        nextDueDate: values.nextDueDate,
        recurrence: values.recurrence,
        ...(values.endDate === '' ? {} : { endDate: values.endDate }),
      };
      return item
        ? unwrap(api.PUT('/scheduled-items/{id}', { params: { path: { id: item.id } }, body }))
        : unwrap(api.POST('/scheduled-items', { body }));
    },
    onSuccess: async () => {
      await saved('Scheduled payment saved.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, FIELDS);
      setFormError({ title: "The scheduled payment couldn't be saved.", error });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/scheduled-items/{id}', { params: { path: { id: item!.id } } })),
    onSuccess: async () => {
      await saved('Scheduled payment deleted.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, FIELDS);
      setFormError({ title: "The scheduled payment couldn't be deleted.", error });
    },
  });

  return (
    <form
      className={FORM}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          setFormError(null);
          return saveMutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && <ErrorNotice title={formError.title} error={formError.error} />}
      <div className={FIELD}>
        <span className={LABEL} id="scheduled-kind-label">
          Kind
        </span>
        <div
          className={SEGMENTED}
          role="radiogroup"
          aria-labelledby="scheduled-kind-label"
          aria-invalid={errors.kind ? true : undefined}
          aria-describedby={errors.kind ? 'scheduled-kind-error' : undefined}
        >
          {KINDS.map((choice) => (
            <label key={choice.value} className={SEGMENT}>
              <input className="sr-only" type="radio" value={choice.value} {...register('kind')} />
              {choice.label}
            </label>
          ))}
        </div>
        {errors.kind && (
          <p className={FIELD_ERROR} role="alert" id="scheduled-kind-error">
            {errors.kind.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <span className="flex justify-between gap-8">
          <label className={LABEL} htmlFor="scheduled-description">
            Description
          </label>
          <span className="font-mono text-12 text-text-2">{description.length}/120</span>
        </span>
        <input
          id="scheduled-description"
          type="text"
          className={INPUT}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'scheduled-description-error' : undefined}
          {...register('description', {
            required: 'description is required',
            maxLength: { value: 120, message: 'description must be at most 120 characters' },
            validate: (value) => value.trim().length > 0 || 'description is required',
          })}
        />
        {errors.description && (
          <p className={FIELD_ERROR} role="alert" id="scheduled-description-error">
            {errors.description.message}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-12">
        <div className={FIELD}>
          <label className={LABEL} htmlFor="scheduled-amount">
            Amount
          </label>
          <Controller
            control={control}
            name="amount"
            rules={{
              validate: (value) => {
                const cents = parseDollars(value);
                if (cents === null) return 'Enter a dollar amount like 1,234.50';
                return BigInt(cents) > 0n || 'amount must be positive';
              },
            }}
            render={({ field }) => (
              <MoneyInput
                id="scheduled-amount"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                autoFocus={!item}
                invalid={!!errors.amount}
                describedBy={errors.amount ? 'scheduled-amount-error' : undefined}
                ref={field.ref}
              />
            )}
          />
          {errors.amount && (
            <p className={FIELD_ERROR} role="alert" id="scheduled-amount-error">
              {errors.amount.message}
            </p>
          )}
        </div>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="scheduled-account">
            Account
          </label>
          <Controller
            control={control}
            name="accountId"
            rules={{ validate: (value) => value !== null || 'account is required' }}
            render={({ field }) => (
              <AccountPicker
                id="scheduled-account"
                value={field.value}
                onChange={field.onChange}
                accounts={accounts}
                invalid={!!errors.accountId}
                describedBy={errors.accountId ? 'scheduled-account-error' : undefined}
              />
            )}
          />
          {errors.accountId && (
            <p className={FIELD_ERROR} role="alert" id="scheduled-account-error">
              {errors.accountId.message}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-12">
        <div className={FIELD}>
          <label className={LABEL} htmlFor="scheduled-category">
            Category
          </label>
          <Controller
            control={control}
            name="categoryId"
            rules={{ validate: (value) => value !== null || 'category is required' }}
            render={({ field }) => (
              <CategoryPicker
                id="scheduled-category"
                value={field.value}
                onChange={field.onChange}
                categories={categories}
                type={kind === 'bill' ? 'expense' : 'income'}
                invalid={!!errors.categoryId}
                describedBy={errors.categoryId ? 'scheduled-category-error' : undefined}
              />
            )}
          />
          {errors.categoryId && (
            <p className={FIELD_ERROR} role="alert" id="scheduled-category-error">
              {errors.categoryId.message}
            </p>
          )}
        </div>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="scheduled-due-date">
            Next due date
          </label>
          <input
            id="scheduled-due-date"
            type="date"
            className={INPUT}
            min={item ? undefined : localToday()}
            aria-invalid={errors.nextDueDate ? true : undefined}
            aria-describedby={errors.nextDueDate ? 'scheduled-due-date-error' : undefined}
            {...register('nextDueDate', {
              required: 'next due date is required',
              validate: (value) =>
                item !== null || value >= localToday() || 'must be today or later when creating',
            })}
          />
          {errors.nextDueDate && (
            <p className={FIELD_ERROR} role="alert" id="scheduled-due-date-error">
              {errors.nextDueDate.message}
            </p>
          )}
        </div>
      </div>
      <div className={FIELD}>
        <span className={LABEL} id="scheduled-recurrence-label">
          Repeats
        </span>
        <div
          className={SEGMENTED}
          role="radiogroup"
          aria-labelledby="scheduled-recurrence-label"
          aria-invalid={errors.recurrence ? true : undefined}
          aria-describedby={errors.recurrence ? 'scheduled-recurrence-error' : undefined}
        >
          {RECURRENCES.map((choice) => (
            <label key={choice.value} className={SEGMENT}>
              <input
                className="sr-only"
                type="radio"
                value={choice.value}
                {...register('recurrence')}
              />
              {choice.label}
            </label>
          ))}
        </div>
        {errors.recurrence && (
          <p className={FIELD_ERROR} role="alert" id="scheduled-recurrence-error">
            {errors.recurrence.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="scheduled-end-date">
          End date <span className={OPTIONAL}>(optional)</span>
        </label>
        <input
          id="scheduled-end-date"
          type="date"
          className={INPUT}
          min={nextDueDate || undefined}
          aria-invalid={errors.endDate ? true : undefined}
          aria-describedby={errors.endDate ? 'scheduled-end-date-error' : undefined}
          {...register('endDate', {
            validate: (value) =>
              value === '' || value >= nextDueDate || 'must be on or after the next due date',
          })}
        />
        {errors.endDate && (
          <p className={FIELD_ERROR} role="alert" id="scheduled-end-date-error">
            {errors.endDate.message}
          </p>
        )}
      </div>
      <div className={FORM_ACTIONS}>
        {item && (
          <button
            type="button"
            className={BUTTON_DANGER}
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : item ? 'Save changes' : 'Create scheduled item'}
        </button>
      </div>
    </form>
  );
}
