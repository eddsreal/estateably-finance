import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { api, unwrap } from '../../lib/api';
import { localToday } from '../../lib/dates';
import { applyServerError } from '../../lib/form-errors';
import { Cents, formatPlain, parseDollars } from '../../lib/money';
import { AccountOption, AccountPicker } from '../AccountPicker/AccountPicker';
import { CategoryOption, CategoryPicker } from '../CategoryPicker/CategoryPicker';
import { KindGlyph } from '../KindGlyph/KindGlyph';
import { MoneyInput } from '../MoneyInput/MoneyInput';
import { ProjectOption, ProjectPicker } from '../ProjectPicker/ProjectPicker';
import {
  BUTTON,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  FIELD,
  FIELD_ERROR,
  FORM,
  FORM_ACTIONS,
  HINT,
  INPUT,
  LABEL,
  OPTIONAL,
  SEGMENT,
  SEGMENTED,
} from '../../lib/styles';
import { ErrorNotice } from '../ErrorNotice/ErrorNotice';
import { useSavedFeedback } from '../Toast/Toast';

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

const KINDS: TransactionKindChoice[] = ['expense', 'income', 'transfer'];

const DESCRIPTION_LIMIT = 120;

function amountError(value: string): string | true {
  const input = value.trim();
  if (input === '') return 'Enter an amount, like 42.50.';
  if (/^[-+]/.test(input)) return 'Leave out the sign. The type sets which way the money moves.';
  if (/\.\d{3,}$/.test(input)) return 'Use at most 2 decimal places, like 250.50.';
  const cents = parseDollars(input);
  if (cents === null) return 'Enter a dollar amount like 1,234.50.';
  return BigInt(cents) > 0n || 'Enter an amount greater than 0.00.';
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p className={FIELD_ERROR} role="alert" id={id}>
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  );
}

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
  const saved = useSavedFeedback();
  const pickable = transaction ? accounts : accounts.filter((account) => !account.archived);
  const [formError, setFormError] = useState<{ title: string; error: unknown } | null>(null);
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
  const description = useWatch({ control, name: 'description' });

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
      await saved(transaction ? 'Transaction saved.' : 'Transaction recorded.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, FIELDS);
      setFormError({ title: "The transaction couldn't be saved.", error });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/transactions/{id}', { params: { path: { id: transaction!.id } } })),
    onSuccess: async () => {
      await saved('Transaction deleted.');
      onDone();
    },
    onError: (error) => {
      applyServerError(error, setError, FIELDS);
      setFormError({ title: "The transaction couldn't be deleted.", error });
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
        <span className={LABEL} id="transaction-kind-label">
          Type
        </span>
        <div
          className={SEGMENTED}
          role="radiogroup"
          aria-labelledby="transaction-kind-label"
          aria-invalid={errors.kind ? true : undefined}
          aria-describedby={errors.kind ? 'transaction-kind-error' : undefined}
        >
          {KINDS.map((choice) => (
            <label key={choice} className={SEGMENT}>
              <input className="sr-only" type="radio" value={choice} {...register('kind')} />
              <KindGlyph kind={choice} showLabel />
            </label>
          ))}
        </div>
        {errors.kind && <FieldError id="transaction-kind-error" message={errors.kind.message} />}
      </div>
      <div className="grid grid-cols-2 gap-12">
        <div className={FIELD}>
          <label className={LABEL} htmlFor="transaction-amount">
            Amount
          </label>
          <Controller
            control={control}
            name="amount"
            rules={{ validate: amountError }}
            render={({ field }) => (
              <MoneyInput
                id="transaction-amount"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                autoFocus={!transaction}
                invalid={!!errors.amount}
                describedBy={errors.amount ? 'transaction-amount-error' : 'transaction-amount-hint'}
                ref={field.ref}
              />
            )}
          />
          {errors.amount && (
            <FieldError id="transaction-amount-error" message={errors.amount.message} />
          )}
        </div>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="transaction-date">
            Date
          </label>
          <input
            id="transaction-date"
            type="date"
            className={INPUT}
            max={localToday()}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? 'transaction-date-error' : undefined}
            {...register('date', {
              required: 'Pick a date.',
              validate: (value) =>
                value <= localToday() || "Date can't be in the future. Schedule it instead.",
            })}
          />
          {errors.date && <FieldError id="transaction-date-error" message={errors.date.message} />}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-12">
        <div className={FIELD}>
          <label className={LABEL} htmlFor="transaction-account">
            {kind === 'transfer' ? 'From account' : 'Account'}
          </label>
          <Controller
            control={control}
            name="accountId"
            rules={{ validate: (value) => value !== null || 'Choose an account.' }}
            render={({ field }) => (
              <AccountPicker
                id="transaction-account"
                value={field.value}
                onChange={field.onChange}
                accounts={pickable}
                invalid={!!errors.accountId}
                describedBy={errors.accountId ? 'transaction-account-error' : undefined}
              />
            )}
          />
          {errors.accountId && (
            <FieldError id="transaction-account-error" message={errors.accountId.message} />
          )}
        </div>
        {kind === 'transfer' ? (
          <div className={FIELD}>
            <label className={LABEL} htmlFor="transaction-counter-account">
              To account
            </label>
            <Controller
              control={control}
              name="counterAccountId"
              rules={{
                validate: (value) => {
                  if (value === null) return 'Choose the account the money goes to.';
                  return value !== accountId || 'Choose a different account than From account.';
                },
              }}
              render={({ field }) => (
                <AccountPicker
                  id="transaction-counter-account"
                  value={field.value}
                  onChange={field.onChange}
                  accounts={pickable}
                  sourceId={accountId}
                  invalid={!!errors.counterAccountId}
                  describedBy={
                    errors.counterAccountId ? 'transaction-counter-account-error' : undefined
                  }
                />
              )}
            />
            {errors.counterAccountId && (
              <FieldError
                id="transaction-counter-account-error"
                message={errors.counterAccountId.message}
              />
            )}
          </div>
        ) : (
          <div className={FIELD}>
            <label className={LABEL} htmlFor="transaction-category">
              Category
            </label>
            <Controller
              control={control}
              name="categoryId"
              rules={{ validate: (value) => value !== null || 'Choose a category.' }}
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
              <FieldError id="transaction-category-error" message={errors.categoryId.message} />
            )}
          </div>
        )}
      </div>
      {kind === 'expense' && (
        <div className={FIELD}>
          <label className={LABEL} htmlFor="transaction-project">
            Project <span className={OPTIONAL}>optional</span>
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
            <FieldError id="transaction-project-error" message={errors.projectId.message} />
          )}
        </div>
      )}
      <div className={FIELD}>
        <div className="flex items-center justify-between">
          <label className={LABEL} htmlFor="transaction-description">
            Description
          </label>
          <span className="font-mono text-12 text-text-2" aria-hidden="true">
            {description.length}/{DESCRIPTION_LIMIT}
          </span>
        </div>
        <input
          id="transaction-description"
          type="text"
          className={INPUT}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'transaction-description-error' : undefined}
          {...register('description', {
            validate: (value) => {
              if (value.trim().length === 0) return 'Add a description.';
              return (
                value.trim().length <= DESCRIPTION_LIMIT ||
                `Shorten the description to ${DESCRIPTION_LIMIT} characters or fewer.`
              );
            },
          })}
        />
        {errors.description && (
          <FieldError id="transaction-description-error" message={errors.description.message} />
        )}
      </div>
      <p className={HINT} id="transaction-amount-hint">
        Accepted amounts: 1234.5, 1,234.50 or $1,234.50.
      </p>
      {kind === 'transfer' && (
        <p className={HINT}>
          Transfers move money between your accounts. They have no category or project and
          don&apos;t count as expenses.
        </p>
      )}
      <div className={FORM_ACTIONS}>
        {transaction && (
          <div className="mr-auto">
            <button
              type="button"
              className={BUTTON_DANGER}
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : transaction ? 'Save changes' : 'Record transaction'}
        </button>
      </div>
    </form>
  );
}
