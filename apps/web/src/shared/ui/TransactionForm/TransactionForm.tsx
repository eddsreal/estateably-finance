import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { api, unwrap } from '../../lib/api';
import { localToday } from '../../lib/dates';
import { applyServerError } from '../../lib/form-errors';
import { Cents, formatPlain, parseDollars } from '../../lib/money';
import { invalidateEntryDerived } from '../../lib/query-keys';
import { AccountOption, AccountPicker } from '../AccountPicker/AccountPicker';
import { CategoryOption, CategoryPicker } from '../CategoryPicker/CategoryPicker';
import { MoneyInput } from '../MoneyInput/MoneyInput';
import { ProjectOption, ProjectPicker } from '../ProjectPicker/ProjectPicker';

export type TransactionKindChoice = 'expense' | 'income' | 'transfer';

export type EditableTransaction = {
  id: string;
  kind: TransactionKindChoice;
  date: string;
  description: string;
  amount: string;
  accountId: string;
  categoryId?: string;
  counterAccountId?: string;
  projectId?: string;
};

type FormValues = {
  kind: TransactionKindChoice;
  date: string;
  description: string;
  amount: string;
  accountId: string | null;
  categoryId: string | null;
  counterAccountId: string | null;
  projectId: string | null;
};

const FIELDS = [
  'kind',
  'date',
  'description',
  'amount',
  'accountId',
  'categoryId',
  'counterAccountId',
  'projectId',
] as const;

const KINDS: { value: TransactionKindChoice; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

export function TransactionForm({
  transaction,
  accounts,
  categories,
  projects,
  onDone,
}: {
  transaction: EditableTransaction | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
  projects: ProjectOption[];
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
    defaultValues: transaction
      ? {
          kind: transaction.kind,
          date: transaction.date,
          description: transaction.description,
          amount: formatPlain(transaction.amount as Cents),
          accountId: transaction.accountId,
          categoryId: transaction.categoryId ?? null,
          counterAccountId: transaction.counterAccountId ?? null,
          projectId: transaction.projectId ?? null,
        }
      : {
          kind: 'expense',
          date: localToday(),
          description: '',
          amount: '',
          accountId: null,
          categoryId: null,
          counterAccountId: null,
          projectId: null,
        },
  });
  const kind = useWatch({ control, name: 'kind' });
  const accountId = useWatch({ control, name: 'accountId' });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const common = {
        date: values.date,
        description: values.description,
        amount: parseDollars(values.amount) as string,
        accountId: values.accountId as string,
      };
      const body =
        values.kind === 'transfer'
          ? {
              kind: 'transfer' as const,
              ...common,
              counterAccountId: values.counterAccountId as string,
            }
          : values.kind === 'income'
            ? { kind: 'income' as const, ...common, categoryId: values.categoryId as string }
            : {
                kind: 'expense' as const,
                ...common,
                categoryId: values.categoryId as string,
                ...(values.projectId === null ? {} : { projectId: values.projectId }),
              };
      return transaction
        ? unwrap(api.PUT('/transactions/{id}', { params: { path: { id: transaction.id } }, body }))
        : unwrap(api.POST('/transactions', { body }));
    },
    onSuccess: async () => {
      await invalidateEntryDerived(queryClient);
      onDone();
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, FIELDS));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/transactions/{id}', { params: { path: { id: transaction!.id } } })),
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
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          setFormError(null);
          return saveMutation.mutateAsync(values).catch(() => undefined);
        })(event);
      }}
    >
      {formError && (
        <div className="form-banner" role="alert">
          {formError}
        </div>
      )}
      <div className="field">
        <span className="field-label" id="transaction-kind-label">
          Kind
        </span>
        <div
          className="radio-group"
          role="radiogroup"
          aria-labelledby="transaction-kind-label"
          aria-invalid={errors.kind ? true : undefined}
          aria-describedby={errors.kind ? 'transaction-kind-error' : undefined}
        >
          {KINDS.map((choice) => (
            <label key={choice.value}>
              <input type="radio" value={choice.value} {...register('kind')} />
              {choice.label}
            </label>
          ))}
        </div>
        {errors.kind && (
          <p className="field-error" role="alert" id="transaction-kind-error">
            {errors.kind.message}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="transaction-date">Date</label>
        <input
          id="transaction-date"
          type="date"
          max={localToday()}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'transaction-date-error' : undefined}
          {...register('date', { required: 'date is required' })}
        />
        {errors.date && (
          <p className="field-error" role="alert" id="transaction-date-error">
            {errors.date.message}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="transaction-description">Description</label>
        <input
          id="transaction-description"
          type="text"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'transaction-description-error' : undefined}
          {...register('description', {
            required: 'description is required',
            maxLength: { value: 120, message: 'description must be at most 120 characters' },
            validate: (value) => value.trim().length > 0 || 'description is required',
          })}
        />
        {errors.description && (
          <p className="field-error" role="alert" id="transaction-description-error">
            {errors.description.message}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="transaction-amount">Amount</label>
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
              id="transaction-amount"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              autoFocus={!transaction}
              invalid={!!errors.amount}
              describedBy={errors.amount ? 'transaction-amount-error' : undefined}
              ref={field.ref}
            />
          )}
        />
        {errors.amount && (
          <p className="field-error" role="alert" id="transaction-amount-error">
            {errors.amount.message}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="transaction-account">
          {kind === 'transfer' ? 'From account' : 'Account'}
        </label>
        <Controller
          control={control}
          name="accountId"
          rules={{ validate: (value) => value !== null || 'account is required' }}
          render={({ field }) => (
            <AccountPicker
              id="transaction-account"
              value={field.value}
              onChange={field.onChange}
              accounts={accounts}
              invalid={!!errors.accountId}
              describedBy={errors.accountId ? 'transaction-account-error' : undefined}
            />
          )}
        />
        {errors.accountId && (
          <p className="field-error" role="alert" id="transaction-account-error">
            {errors.accountId.message}
          </p>
        )}
      </div>
      {kind !== 'transfer' && (
        <div className="field">
          <label htmlFor="transaction-category">Category</label>
          <Controller
            control={control}
            name="categoryId"
            rules={{ validate: (value) => value !== null || 'category is required' }}
            render={({ field }) => (
              <CategoryPicker
                id="transaction-category"
                value={field.value}
                onChange={field.onChange}
                categories={categories}
                type={kind === 'income' ? 'income' : 'expense'}
                invalid={!!errors.categoryId}
                describedBy={errors.categoryId ? 'transaction-category-error' : undefined}
              />
            )}
          />
          {errors.categoryId && (
            <p className="field-error" role="alert" id="transaction-category-error">
              {errors.categoryId.message}
            </p>
          )}
        </div>
      )}
      {kind === 'expense' && (
        <div className="field">
          <label htmlFor="transaction-project">
            Project <span className="optional">optional</span>
          </label>
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <ProjectPicker
                id="transaction-project"
                value={field.value}
                onChange={field.onChange}
                projects={projects}
                invalid={!!errors.projectId}
                describedBy={errors.projectId ? 'transaction-project-error' : undefined}
              />
            )}
          />
          {errors.projectId && (
            <p className="field-error" role="alert" id="transaction-project-error">
              {errors.projectId.message}
            </p>
          )}
        </div>
      )}
      {kind === 'transfer' && (
        <div className="field">
          <label htmlFor="transaction-counter-account">To account</label>
          <Controller
            control={control}
            name="counterAccountId"
            rules={{
              validate: (value) => {
                if (value === null) return 'destination account is required';
                return value !== accountId || 'must differ from the source account';
              },
            }}
            render={({ field }) => (
              <AccountPicker
                id="transaction-counter-account"
                value={field.value}
                onChange={field.onChange}
                accounts={accounts}
                sourceId={accountId}
                invalid={!!errors.counterAccountId}
                describedBy={
                  errors.counterAccountId ? 'transaction-counter-account-error' : undefined
                }
              />
            )}
          />
          {errors.counterAccountId && (
            <p className="field-error" role="alert" id="transaction-counter-account-error">
              {errors.counterAccountId.message}
            </p>
          )}
        </div>
      )}
      <div className="modal-actions">
        {transaction && (
          <button
            type="button"
            className="btn danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Delete
          </button>
        )}
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={isSubmitting}>
          {transaction ? 'Save changes' : 'Record transaction'}
        </button>
      </div>
    </form>
  );
}
