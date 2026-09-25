import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { AccountForm } from '../../features/accounts/components/AccountForm/AccountForm';
import { api, unwrap } from '../../shared/lib/api';
import { usePhoneLayout } from '../../shared/lib/media';
import { queryKeys } from '../../shared/lib/query-keys';
import { CommandPalette, PaletteCommand } from '../../shared/ui/CommandPalette/CommandPalette';
import { Icon } from '../../shared/ui/Icon/Icon';
import { Modal } from '../../shared/ui/Modal/Modal';
import { ToastProvider, useToast } from '../../shared/ui/Toast/Toast';
import {
  EditableTransaction,
  TransactionForm,
  TransactionKindChoice,
} from '../../shared/ui/TransactionForm/TransactionForm';
import { NAV_GROUPS, Sidebar } from '../Sidebar/Sidebar';
import { TabBar } from '../TabBar/TabBar';

type Overlay =
  { kind: 'transaction'; transaction: EditableTransaction | null } | { kind: 'account' } | null;

function ShellTransactionForm({
  transaction,
  onDone,
}: {
  transaction: EditableTransaction | null;
  onDone: () => void;
}) {
  const accountsQuery = useQuery({
    queryKey: queryKeys.accountsList(true),
    queryFn: () => unwrap(api.GET('/accounts', { params: { query: { includeArchived: true } } })),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categoriesList(true),
    queryFn: () => unwrap(api.GET('/categories', { params: { query: { includeArchived: true } } })),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsList,
    queryFn: () => unwrap(api.GET('/projects')),
  });
  return (
    <TransactionForm
      transaction={transaction}
      accounts={accountsQuery.data?.items ?? []}
      categories={categoriesQuery.data ?? []}
      projects={projectsQuery.data ?? []}
      onDone={onDone}
    />
  );
}

function UndoShortcut() {
  const { undo } = useToast();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || event.shiftKey || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (document.activeElement?.matches('input, textarea, select, [contenteditable]')) return;
      if (undo()) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo]);
  return null;
}

export function Shell() {
  const navigate = useNavigate();
  const phone = usePhoneLayout();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const closeOverlay = () => setOverlay(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (!document.querySelector('dialog[open]')) setPaletteOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const commands: PaletteCommand[] = [
    ...NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        group: 'Reports' as const,
        label: item.label,
        hint: group.title,
        glyph: <Icon path={item.icon} size="size-15" />,
        run: () => void navigate(item.to),
      })),
    ),
    {
      group: 'Actions',
      label: 'New transaction',
      hint: 'Record an expense, income or transfer',
      glyph: '+',
      run: () => setOverlay({ kind: 'transaction', transaction: null }),
    },
    {
      group: 'Actions',
      label: 'New account',
      hint: 'Add a bank account, cash or a card',
      glyph: '+',
      run: () => setOverlay({ kind: 'account' }),
    },
  ];

  return (
    <ToastProvider>
      <UndoShortcut />
      <div className="flex min-h-screen">
        <div className="sticky top-0 h-screen flex-none py-12 pl-12 max-md:hidden">
          <Sidebar onSearch={() => setPaletteOpen(true)} />
        </div>
        <main className="min-w-0 flex-1 max-md:pb-110 *:*:animate-enter-1 *:*:nth-2:animate-enter-2 *:*:nth-3:animate-enter-3 *:*:nth-4:animate-enter-4 *:*:nth-5:animate-enter-5">
          <Outlet />
        </main>
      </div>
      <TabBar onAdd={() => setOverlay({ kind: 'transaction', transaction: null })} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        onOpenTransaction={(transaction) => {
          setPaletteOpen(false);
          setOverlay({
            kind: 'transaction',
            transaction: { ...transaction, kind: transaction.kind as TransactionKindChoice },
          });
        }}
      />
      <Modal
        title={
          overlay?.kind === 'transaction' && overlay.transaction
            ? 'Edit transaction'
            : 'New transaction'
        }
        open={overlay?.kind === 'transaction'}
        onClose={closeOverlay}
        variant={
          phone && overlay?.kind === 'transaction' && !overlay.transaction ? 'sheet' : 'form'
        }
      >
        {overlay?.kind === 'transaction' && (
          <ShellTransactionForm transaction={overlay.transaction} onDone={closeOverlay} />
        )}
      </Modal>
      <Modal title="New account" open={overlay?.kind === 'account'} onClose={closeOverlay}>
        <AccountForm account={null} onDone={closeOverlay} />
      </Modal>
    </ToastProvider>
  );
}
