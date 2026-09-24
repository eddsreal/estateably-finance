import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { localToday } from '../../../../shared/lib/dates';
import { queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { KindGlyph } from '../../../../shared/ui/KindGlyph/KindGlyph';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { ConfirmItemForm } from '../ConfirmItemForm/ConfirmItemForm';
import { EditableScheduledItem, ScheduledItemForm } from '../ScheduledItemForm/ScheduledItemForm';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHIP_WARNING,
  PAGE,
  PAGE_HEADER,
  PAGE_TITLE,
  ROW_ACTION_TEXT,
  TD_AMOUNT,
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

export function dueLabel(date: string, today: string): string {
  const diff = Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
  );
  if (diff < 0) return diff === -1 ? 'Overdue 1 day' : `Overdue ${-diff} days`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff} days`;
}

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
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            hint="Future bills and income you add will be listed here by due date."
            actionLabel="New scheduled item"
            onAction={() => setCreating(true)}
          />
        ) : (
          <Table
            caption="Scheduled items by due date"
            columns={[
              { label: 'Kind' },
              { label: 'Description' },
              { label: 'Account' },
              { label: 'Due' },
              { label: 'Repeats' },
              { label: 'Amount', align: 'right' },
              { label: 'Actions' },
            ]}
          >
            {items.map((item) => {
              const meta = KIND_META[item.kind];
              return (
                <tr key={item.id}>
                  <td>
                    <KindGlyph kind={meta.kind} label={meta.label} showLabel />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={ROW_ACTION_TEXT}
                      onClick={() => setEditing(toEditable(item))}
                    >
                      {item.description}
                    </button>
                  </td>
                  <td>
                    <span className="flex items-center gap-8">
                      {accountName(item.accountId)}
                      {item.accountArchived && (
                        <span className={CHIP_WARNING}>Account archived</span>
                      )}
                    </span>
                  </td>
                  <td className="text-13">
                    <span className="font-mono text-12 text-text-2">{item.nextDueDate}</span>{' '}
                    {item.overdue ? (
                      <span className={CHIP_WARNING}>
                        {dueLabel(item.nextDueDate, today)}
                        {item.overdueCount > 1 ? ` · ${item.overdueCount} missed` : ''}
                      </span>
                    ) : (
                      <span>{dueLabel(item.nextDueDate, today)}</span>
                    )}
                  </td>
                  <td>
                    {RECURRENCE_LABEL[item.recurrence]}
                    {item.endDate ? ` until ${item.endDate}` : ''}
                  </td>
                  <td className={TD_AMOUNT}>
                    <Amount cents={item.amount} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={BUTTON_COMPACT}
                      onClick={() => setConfirming(toEditable(item))}
                    >
                      {item.kind === 'bill' ? 'Mark paid' : 'Mark received'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
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
