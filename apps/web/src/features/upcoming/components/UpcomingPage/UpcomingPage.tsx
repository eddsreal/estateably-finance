import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { formatDay, localToday, UpcomingGroup, upcomingGroup } from '../../../../shared/lib/dates';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { DueChip, DueTile, shortDay } from '../DueTile/DueTile';
import { ConfirmItemForm } from '../ConfirmItemForm/ConfirmItemForm';
import { EditableScheduledItem, ScheduledItemForm } from '../ScheduledItemForm/ScheduledItemForm';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_WARNING,
  HINT,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
} from '../../../../shared/lib/styles';

const KIND_META = {
  bill: { kind: 'expense', label: 'Bill' },
  income: { kind: 'income', label: 'Income' },
} as const;

const RECURRENCE_LABEL: Record<string, string> = {
  once: 'Once',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const monthName = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

const GROUPS: { id: UpcomingGroup; title: (today: string) => string }[] = [
  { id: 'overdue-and-2-weeks', title: () => 'Overdue & next 2 weeks' },
  { id: 'later-this-month', title: (today) => `Later in ${monthName(today)}` },
  { id: 'later-months', title: () => 'Later months' },
];

export function UpcomingPage() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableScheduledItem | null>(null);
  const [confirming, setConfirming] = useState<EditableScheduledItem | null>(null);
  const today = localToday();

  const itemsQuery = useQuery({
    queryKey: queryKeys.scheduledItems,
    queryFn: () => unwrap(api.GET('/scheduled-items')),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });

  const items = itemsQuery.data ?? [];
  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '';
  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? '';

  const toEditable = (item: (typeof items)[number]): EditableScheduledItem => ({
    id: item.id,
    kind: item.kind,
    description: item.description,
    amount: item.amount,
    accountId: item.accountId,
    categoryId: item.categoryId,
    nextDueDate: item.nextDueDate,
    recurrence: item.recurrence,
    endDate: item.endDate,
  });

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Upcoming</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New scheduled item
        </button>
      </div>
      {itemsQuery.isError || !itemsQuery.data || items.length === 0 ? (
        <div className={CARD}>
          {itemsQuery.isError ? (
            <div className={BANNER_WARNING} role="alert">
              <span>The upcoming list could not be loaded, so it is not shown.</span>
              <button
                type="button"
                className={BUTTON_COMPACT}
                onClick={() => void itemsQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : !itemsQuery.data ? (
            <p className="text-14 text-text-2">Loading scheduled items…</p>
          ) : (
            <EmptyState
              title="Nothing scheduled"
              hint="Future bills and income you add will be listed here by due date."
              actionLabel="New scheduled item"
              onAction={() => setCreating(true)}
            />
          )}
        </div>
      ) : (
        GROUPS.map((group) => {
          const members = items.filter(
            (item) => upcomingGroup(item.nextDueDate, today) === group.id,
          );
          if (members.length === 0) return null;
          const first = shortDay(members[0].nextDueDate);
          const last = shortDay(members[members.length - 1].nextDueDate);
          return (
            <section
              key={group.id}
              aria-labelledby={`upcoming-${group.id}`}
              className="flex flex-col gap-12 md:grid md:grid-cols-(--upcoming-grid) md:gap-20"
            >
              <div className="flex flex-col gap-2 md:pt-14">
                <h2 id={`upcoming-${group.id}`} className="text-14 font-semibold">
                  {group.title(today)}
                </h2>
                <span className="font-mono text-12 text-text-3">
                  {first === last ? first : `${first} – ${last}`}
                </span>
              </div>
              <ul className="flex flex-col gap-8">
                {members.map((item) => {
                  const meta = KIND_META[item.kind];
                  const reasonId = `upcoming-reason-${item.id}`;
                  return (
                    <li
                      key={item.id}
                      className={`flex flex-wrap items-center gap-14 rounded-xl border px-14 py-10 ${item.accountArchived ? 'border-warning-line bg-warning-surface' : 'border-sand-350 bg-sand-0'}`}
                    >
                      <DueTile date={item.nextDueDate} />
                      <KindGlyph kind={meta.kind} label={meta.label} />
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <span className="flex min-w-0 items-center gap-8">
                          <button
                            type="button"
                            className={`${ROW_ACTION_TEXT} -ml-8`}
                            onClick={() => setEditing(toEditable(item))}
                          >
                            {item.description}
                          </button>
                          {item.accountArchived && (
                            <span className={`${CHIP_WARNING} flex-none`}>⚠ Account archived</span>
                          )}
                        </span>
                        <span className="text-13 text-text-2">
                          {RECURRENCE_LABEL[item.recurrence]}
                          {item.endDate ? ` until ${formatDay(item.endDate)}` : ''} ·{' '}
                          {accountName(item.accountId)} · {categoryName(item.categoryId)}
                        </span>
                      </div>
                      <DueChip
                        due={item.nextDueDate}
                        today={today}
                        extra={item.overdueCount > 1 ? ` · ${item.overdueCount} missed` : ''}
                      />
                      <span className="text-right text-15">
                        <Amount cents={item.amount} />
                      </span>
                      <span className="flex items-center gap-8">
                        {item.accountArchived && (
                          <span id={reasonId} className={HINT}>
                            Its account is archived
                          </span>
                        )}
                        <button
                          type="button"
                          className={BUTTON_PRIMARY}
                          disabled={item.accountArchived}
                          aria-describedby={item.accountArchived ? reasonId : undefined}
                          onClick={() => setConfirming(toEditable(item))}
                        >
                          {item.kind === 'bill' ? 'Mark paid' : 'Mark received'}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      <Modal title="New scheduled item" open={creating} onClose={() => setCreating(false)}>
        {creating && (
          <ScheduledItemForm
            item={null}
            accounts={accounts}
            categories={categories}
            onDone={() => setCreating(false)}
          />
        )}
      </Modal>
      <Modal title="Edit scheduled item" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <ScheduledItemForm
            item={editing}
            accounts={accounts}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        title={confirming?.kind === 'income' ? 'Mark as received' : 'Mark as paid'}
        open={confirming !== null}
        onClose={() => setConfirming(null)}
      >
        {confirming && (
          <ConfirmItemForm
            item={confirming}
            accounts={accounts}
            categories={categories}
            onDone={() => setConfirming(null)}
          />
        )}
      </Modal>
    </div>
  );
}
