import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { formatPlain, parseDollars, Cents } from '../../../../shared/lib/money';
import { invalidateEntryDerived } from '../../../../shared/lib/query-keys';
import { AccountOption, AccountPicker } from '../../../../shared/ui/AccountPicker/AccountPicker';
import {
  CategoryOption,
  CategoryPicker,
} from '../../../../shared/ui/CategoryPicker/CategoryPicker';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';
import { EditableScheduledItem } from '../ScheduledItemForm/ScheduledItemForm';
import {
  BANNER_ERROR,
  BUTTON,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  INPUT,
  LABEL,
} from '../../../../shared/lib/styles';

type FormValues = {
  amount: string;
  date: string;
  accountId: string | null;
  categoryId: string | null;
  description: string;
};

const FIELDS = ['amount', 'date', 'accountId', 'categoryId', 'description'] as const;

export function ConfirmItemForm({
  item,
  accounts,
  categories,
  onDone,
}: {
  item: EditableScheduledItem;
  accounts: AccountOption[];
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const today = localToday();
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      amount: formatPlain(item.amount as Cents),
      date: item.nextDueDate <= today ? item.nextDueDate : today,
      accountId: item.accountId,
      categoryId: item.categoryId,
      description: item.description,
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (values: FormValues) =>
      unwrap(
        api.POST('/scheduled-items/{id}/confirm', {
          params: { path: { id: item.id } },
          body: {
            amount: parseDollars(values.amount) as string,
            date: values.date,
            accountId: values.accountId as string,
            categoryId: values.categoryId as string,
            description: values.description,
          },
        }),
      ),
    onSuccess: async () => {
      await invalidateEntryDerived(queryClient);
      onDone();
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, FIELDS));
    },
  });

  return (
    <form
      className={FORM}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          setFormError(null);
          return confirmMutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && (
        <div className={BANNER_ERROR} role="alert">
          {formError}
        </div>
      )}
      <div className={FIELD}>
        <label className={LABEL} htmlFor="confirm-amount">
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
              id="confirm-amount"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={!!errors.amount}
              describedBy={errors.amount ? 'confirm-amount-error' : undefined}
              ref={field.ref}
            />
          )}
        />
        {errors.amount && (
          <p className={FIELD_ERROR} role="alert" id="confirm-amount-error">
            {errors.amount.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="confirm-date">
          Date
        </label>
        <input
          id="confirm-date"
          type="date"
          className={INPUT}
          max={today}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'confirm-date-error' : undefined}
          {...register('date', { required: 'date is required' })}
        />
        {errors.date && (
          <p className={FIELD_ERROR} role="alert" id="confirm-date-error">
            {errors.date.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="confirm-account">
          Account
        </label>
        <Controller
          control={control}
          name="accountId"
          rules={{ validate: (value) => value !== null || 'account is required' }}
          render={({ field }) => (
            <AccountPicker
              id="confirm-account"
              value={field.value}
              onChange={field.onChange}
              accounts={accounts}
              invalid={!!errors.accountId}
              describedBy={errors.accountId ? 'confirm-account-error' : undefined}
            />
          )}
        />
        {errors.accountId && (
          <p className={FIELD_ERROR} role="alert" id="confirm-account-error">
            {errors.accountId.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="confirm-category">
          Category
        </label>
        <Controller
          control={control}
          name="categoryId"
          rules={{ validate: (value) => value !== null || 'category is required' }}
          render={({ field }) => (
            <CategoryPicker
              id="confirm-category"
              value={field.value}
              onChange={field.onChange}
              categories={categories}
              type={item.kind === 'bill' ? 'expense' : 'income'}
              invalid={!!errors.categoryId}
              describedBy={errors.categoryId ? 'confirm-category-error' : undefined}
            />
          )}
        />
        {errors.categoryId && (
          <p className={FIELD_ERROR} role="alert" id="confirm-category-error">
            {errors.categoryId.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="confirm-description">
          Description
        </label>
        <input
          id="confirm-description"
          type="text"
          className={INPUT}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'confirm-description-error' : undefined}
          {...register('description', {
            required: 'description is required',
            maxLength: { value: 120, message: 'description must be at most 120 characters' },
            validate: (value) => value.trim().length > 0 || 'description is required',
          })}
        />
        {errors.description && (
          <p className={FIELD_ERROR} role="alert" id="confirm-description-error">
            {errors.description.message}
          </p>
        )}
      </div>
      <div className={FORM_ACTIONS}>
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {item.kind === 'bill' ? 'Record payment' : 'Record receipt'}
        </button>
      </div>
    </form>
  );
}
