import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { applyServerError } from '../../../../shared/lib/form-errors';
import { Cents, formatPlain, parseDollars } from '../../../../shared/lib/money';
import { invalidateEntryDerived } from '../../../../shared/lib/query-keys';
import { MoneyInput } from '../../../../shared/ui/MoneyInput/MoneyInput';
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
  SEGMENT,
  SEGMENTED,
} from '../../../../shared/lib/styles';

export type AccountFormValues = {
  name: string;
  kind: 'bank' | 'cash' | 'card';
  openingBalance: string;
  openingDate: string;
};

export type EditableAccount = {
  id: string;
  name: string;
  kind: 'bank' | 'cash' | 'card';
  openingBalance: string;
  openingDate: string;
};

const FIELDS = ['name', 'kind', 'openingBalance', 'openingDate'] as const;
const KINDS: { value: AccountFormValues['kind']; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
];

export function AccountForm({
  account,
  onDone,
}: {
  account: EditableAccount | null;
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
  } = useForm<AccountFormValues>({
    defaultValues: account
      ? {
          name: account.name,
          kind: account.kind,
          openingBalance: formatPlain(account.openingBalance as Cents),
          openingDate: account.openingDate,
        }
      : { name: '', kind: 'bank', openingBalance: '0', openingDate: localToday() },
  });

  const mutation = useMutation({
    mutationFn: (values: AccountFormValues) => {
      const body = {
        name: values.name,
        kind: values.kind,
        openingBalance: parseDollars(values.openingBalance) as string,
        openingDate: values.openingDate,
      };
      return account
        ? unwrap(api.PATCH('/accounts/{id}', { params: { path: { id: account.id } }, body }))
        : unwrap(api.POST('/accounts', { body }));
    },
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
          return mutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && (
        <div className={BANNER_ERROR} role="alert">
          {formError}
        </div>
      )}
      <div className={FIELD}>
        <label className={LABEL} htmlFor="account-name">
          Name
        </label>
        <input
          id="account-name"
          type="text"
          className={INPUT}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'account-name-error' : undefined}
          {...register('name', { required: 'name is required', maxLength: 60 })}
        />
        {errors.name && (
          <p className={FIELD_ERROR} role="alert" id="account-name-error">
            {errors.name.message || 'name must be at most 60 characters'}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <span className={LABEL} id="account-kind-label">
          Kind
        </span>
        <div
          className={SEGMENTED}
          role="radiogroup"
          aria-labelledby="account-kind-label"
          aria-invalid={errors.kind ? true : undefined}
          aria-describedby={errors.kind ? 'account-kind-error' : undefined}
        >
          {KINDS.map((kind) => (
            <label key={kind.value} className={SEGMENT}>
              <input className="sr-only" type="radio" value={kind.value} {...register('kind')} />
              {kind.label}
            </label>
          ))}
        </div>
        {errors.kind && (
          <p className={FIELD_ERROR} role="alert" id="account-kind-error">
            {errors.kind.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="account-opening-balance">
          Opening balance
        </label>
        <Controller
          control={control}
          name="openingBalance"
          rules={{
            validate: (value) =>
              parseDollars(value) !== null || 'Enter a dollar amount like 1,234.50',
          }}
          render={({ field }) => (
            <MoneyInput
              id="account-opening-balance"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              autoFocus={!account}
              invalid={!!errors.openingBalance}
              describedBy={errors.openingBalance ? 'account-opening-balance-error' : undefined}
              ref={field.ref}
            />
          )}
        />
        {errors.openingBalance && (
          <p className={FIELD_ERROR} role="alert" id="account-opening-balance-error">
            {errors.openingBalance.message}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="account-opening-date">
          Opening date
        </label>
        <input
          id="account-opening-date"
          type="date"
          className={INPUT}
          max={localToday()}
          aria-invalid={errors.openingDate ? true : undefined}
          aria-describedby={errors.openingDate ? 'account-opening-date-error' : undefined}
          {...register('openingDate', { required: 'opening date is required' })}
        />
        {errors.openingDate && (
          <p className={FIELD_ERROR} role="alert" id="account-opening-date-error">
            {errors.openingDate.message}
          </p>
        )}
      </div>
      <div className={FORM_ACTIONS}>
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {account ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </form>
  );
}
