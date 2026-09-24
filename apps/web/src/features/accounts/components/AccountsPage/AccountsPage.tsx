import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap } from '../../../../shared/lib/api';
import { invalidateEntryDerived, queryKeys } from '../../../../shared/lib/query-keys';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Stat } from '../../../../shared/ui/Stat/Stat';
import { Table } from '../../../../shared/ui/Table/Table';
import { AccountForm, EditableAccount } from '../AccountForm/AccountForm';
import {
  BANNER_WARNING,
  BUTTON_COMPACT,
  BUTTON_PRIMARY,
  CARD,
  CHECKBOX_LABEL,
  CHIP_WARNING,
  LINK,
  PAGE,
  PAGE_HEADER,
  ROW_ACTION,
  PAGE_TITLE,
  TD_AMOUNT,
  TRUNCATE,
} from '../../../../shared/lib/styles';

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(showArchived),
    queryFn: () =>
      unwrap(api.GET('/accounts', { params: { query: { includeArchived: showArchived } } })),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      unwrap(
        archive
          ? api.POST('/accounts/{id}/archive', { params: { path: { id } } })
          : api.POST('/accounts/{id}/unarchive', { params: { path: { id } } }),
      ),
    onSuccess: () => invalidateEntryDerived(queryClient),
  });

  if (accountsQuery.isPending) {
    return <p className={PAGE}>Loading accounts…</p>;
  }
  if (accountsQuery.isError) {
    return (
      <div className={PAGE}>
        <div className={BANNER_WARNING} role="alert">
          <span>The account balances could not be refreshed, so none are shown.</span>
          <button
            type="button"
            className={BUTTON_COMPACT}
            onClick={() => void accountsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { items, totalBalance } = accountsQuery.data;

  return (
    <div className={PAGE}>
      <div className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Accounts</h1>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setCreating(true)}>
          New account
        </button>
      </div>
      <Stat caption="Total across accounts">
        <Amount cents={totalBalance} size="large" />
      </Stat>
      <div className={CARD}>
        <label className={`${CHECKBOX_LABEL} mb-12`}>
          <input
            className="accent-accent"
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived accounts
        </label>
        {items.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            hint="Create your first account to start recording transactions."
            actionLabel="New account"
            onAction={() => setCreating(true)}
          />
        ) : (
          <Table
            caption="Accounts"
            columns={[
              { label: 'Name' },
              { label: 'Kind' },
              { label: 'Balance', align: 'right' },
              { label: 'Actions' },
            ]}
          >
            {items.map((account) => (
              <tr key={account.id}>
                <td>
                  <span className="flex items-center gap-8">
                    <Link className={`${LINK} ${TRUNCATE}`} to={`/accounts/${account.id}`}>
                      {account.name}
                    </Link>
                    {account.archived && <span className={CHIP_WARNING}>archived</span>}
                  </span>
                </td>
                <td className="font-mono text-12 tracking-wide text-text-2 uppercase">
                  {account.kind}
                </td>
                <td className={TD_AMOUNT}>
                  <Amount cents={account.balance} />
                </td>
                <td>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`Edit ${account.name}`}
                    onClick={() =>
                      setEditing({
                        id: account.id,
                        name: account.name,
                        kind: account.kind,
                        openingBalance: account.openingBalance,
                        openingDate: account.openingDate,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={ROW_ACTION}
                    aria-label={`${account.archived ? 'Unarchive' : 'Archive'} ${account.name}`}
                    onClick={() =>
                      archiveMutation.mutate({ id: account.id, archive: !account.archived })
                    }
                  >
                    {account.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <Modal title="New account" open={creating} onClose={() => setCreating(false)}>
        <AccountForm account={null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal title="Edit account" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <AccountForm account={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
