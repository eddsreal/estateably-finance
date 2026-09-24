import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { applyServerError } from '../../../../shared/lib/form-errors';
import {
  compareCents,
  formatCents,
  formatPlain,
  parseDollars,
  Cents,
} from '../../../../shared/lib/money';
import { AccountOption, AccountPicker } from '../../../../shared/ui/AccountPicker/AccountPicker';
import {
  CategoryOption,
  CategoryPicker,
} from '../../../../shared/ui/CategoryPicker/CategoryPicker';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';
import { DueChip, DueTile } from '../DueTile/DueTile';
import { EditableScheduledItem } from '../ScheduledItemForm/ScheduledItemForm';
import {
  BUTTON,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  HINT,
  INPUT,
  LABEL,
} from '../../../../shared/lib/styles';
import { ErrorNotice } from '../../../../shared/ui/ErrorNotice/ErrorNotice';
import { useSavedFeedback } from '../../../../shared/ui/Toast/Toast';

type FormValues = {
  amount: string;
  date: string;
  accountId: string | null;
  categoryId: string | null;
  description: string;
};

const FIELDS = ['amount', 'date', 'accountId', 'categoryId', 'description'] as const;

const RECURRENCE_LABEL = { once: 'Once', weekly: 'Weekly', monthly: 'Monthly' } as const;

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
  const saved = useSavedFeedback();
  const [formError, setFormError] = useState<{ title: string; error: unknown } | null>(null);
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
  const amount = useWatch({ control, name: 'amount' });
  const description = useWatch({ control, name: 'description' });
  const typed = parseDollars(amount);
  const edited = typed === null || compareCents(typed, item.amount as Cents) !== 0;

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
      await saved('Payment recorded.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, FIELDS);
      setFormError({ title: "The payment couldn't be confirmed.", error });
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
      <div className="flex items-center gap-12 rounded-lg bg-sand-100 px-12 py-10">
        <DueTile date={item.nextDueDate} />
        <span className="min-w-0 flex-1 text-14 font-medium wrap-break-word">
          {item.description} · {RECURRENCE_LABEL[item.recurrence]}
        </span>
        <DueChip due={item.nextDueDate} today={today} />
      </div>
      <p className="text-13 text-text-strong">
        This records {item.kind === 'bill' ? 'an expense' : 'an income'} with these values. Change
        anything that was different.
      </p>
      {formError && <ErrorNotice title={formError.title} error={formError.error} />}
      <div className="grid grid-cols-2 gap-12">
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
          {edited && <p className={HINT}>Scheduled: {formatCents(item.amount as Cents)}</p>}
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
      </div>
      <div className="grid grid-cols-2 gap-12">
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
      </div>
      <div className={FIELD}>
        <span className="flex justify-between gap-8">
          <label className={LABEL} htmlFor="confirm-description">
            Description
          </label>
          <span className="font-mono text-12 text-text-2">{description.length}/120</span>
        </span>
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
          {isSubmitting ? 'Saving…' : item.kind === 'bill' ? 'Record payment' : 'Record receipt'}
        </button>
      </div>
    </form>
  );
}
