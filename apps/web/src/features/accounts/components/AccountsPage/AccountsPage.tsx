import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../../../../shared/lib/api';
import { Cents, formatCents, isNegative } from '../../../../shared/lib/money';
import { invalidateEntryDerived, queryKeys } from '../../../../shared/lib/query-keys';
import { EmptyState } from '../../../../shared/ui/EmptyState/EmptyState';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import { Table } from '../../../../shared/ui/Table/Table';
import { AccountForm, EditableAccount } from '../AccountForm/AccountForm';

function Amount({ cents }: { cents: string }) {
  return (
    <span className={`amount ${isNegative(cents as Cents) ? 'negative' : ''}`}>
      {formatCents(cents as Cents)}
    </span>
  );
}

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
    return <p className="page">Loading accounts…</p>;
  }
  if (accountsQuery.isError) {
    return (
      <div className="page">
        <div className="info-banner" role="alert">
          <span>The account balances could not be refreshed, so none are shown.</span>
          <button
            type="button"
            className="btn compact"
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
    <div className="page">
      <div className="page-header">
        <h1>Accounts</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          New account
        </button>
      </div>
      <div className="card stat">
        <span className="caption">Total across accounts</span>
        <span className="value">
          <Amount cents={totalBalance} />
        </span>
      </div>
      <div className="card">
        <label className="checkbox-label">
          <input
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
                  {account.name}
                  {account.archived && <span className="chip warning">archived</span>}
                </td>
                <td>{account.kind}</td>
                <td className="amount">
                  <Amount cents={account.balance} />
                </td>
                <td>
                  <button
                    type="button"
                    className="row-action"
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
                    className="row-action"
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
