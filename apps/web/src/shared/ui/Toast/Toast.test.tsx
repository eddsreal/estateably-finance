import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../lib/query-keys';
import { ToastInput, ToastProvider, useSavedFeedback, useToast } from './Toast';

function Trigger({ toast, error }: { toast?: ToastInput; error?: unknown }) {
  const { show, showError } = useToast();
  return (
    <button
      type="button"
      onClick={() => (error === undefined ? show(toast as ToastInput) : showError(error))}
    >
      trigger
    </button>
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Toast', () => {
  it('announces toasts in a polite live region and closes a saved toast on its own', () => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty('--dur-undo', '5s');
    render(
      <ToastProvider>
        <Trigger toast={{ kind: 'saved', message: 'Transaction saved.' }} />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'trigger' }).click());
    const toast = screen.getByText('Transaction saved.');
    expect(toast.closest('[aria-live="polite"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getByText('Transaction saved.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByText('Transaction saved.')).not.toBeInTheDocument();
  });

  it('shows an API error with its correlation id and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ToastProvider>
        <Trigger
          error={{
            code: 'NOT_FOUND',
            message: 'Transaction not found.',
            correlationId: '01J8Z4P2MN-7C1D',
          }}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByText('Transaction not found.')).toBeInTheDocument();
    expect(screen.getByText('Correlation ID 01J8Z4P2MN-7C1D')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy ID' }));
    expect(writeText).toHaveBeenCalledWith('01J8Z4P2MN-7C1D');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('keeps a refresh-failed toast until its Retry resolves', async () => {
    const user = userEvent.setup();
    const onRetry = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce(undefined);
    render(
      <ToastProvider>
        <Trigger
          toast={{ kind: 'refresh-failed', message: "Balances couldn't update.", onRetry }}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByText("Balances couldn't update.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText("Balances couldn't update.")).not.toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});

describe('Undo toast', () => {
  function UndoHarness({ onUndo }: { onUndo: (id: string) => Promise<void> }) {
    const { show, undo, closeUndoFor, flashId } = useToast();
    const push = (id: string) =>
      show({
        kind: 'undo',
        message: `Recorded ${id}.`,
        transactionId: id,
        onUndo: () => onUndo(id),
      });
    return (
      <>
        <button type="button" onClick={() => push('t1')}>
          create t1
        </button>
        <button type="button" onClick={() => push('t2')}>
          create t2
        </button>
        <button type="button" onClick={() => undo()}>
          shortcut
        </button>
        <button type="button" onClick={() => closeUndoFor('t1')}>
          edit t1
        </button>
        <output>{flashId ?? 'none'}</output>
      </>
    );
  }

  function renderUndo() {
    document.documentElement.style.setProperty('--dur-undo', '5s');
    document.documentElement.style.setProperty('--dur-flash', '2.4s');
    const onUndo = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
    render(
      <ToastProvider>
        <UndoHarness onUndo={onUndo} />
      </ToastProvider>,
    );
    const click = (name: string) => act(() => screen.getByRole('button', { name }).click());
    return { onUndo, click };
  }

  it('keeps only the latest undo toast, so Undo targets the latest create', () => {
    const { onUndo, click } = renderUndo();
    click('create t1');
    click('create t2');
    expect(screen.queryByText('Recorded t1.')).not.toBeInTheDocument();
    expect(screen.getByText('Recorded t2.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Undo/ })).toHaveLength(1);
    click('shortcut');
    expect(onUndo).toHaveBeenCalledWith('t2');
  });

  it('acts once: the first press removes the toast, a second sends nothing', () => {
    const { onUndo, click } = renderUndo();
    click('create t1');
    act(() => screen.getByRole('button', { name: /^Undo/ }).click());
    expect(screen.queryByText('Recorded t1.')).not.toBeInTheDocument();
    click('shortcut');
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('closes after --dur-undo and then has nothing to undo', () => {
    vi.useFakeTimers();
    const { onUndo, click } = renderUndo();
    click('create t1');
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByText('Recorded t1.')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('Recorded t1.')).not.toBeInTheDocument();
    click('shortcut');
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('closes by transaction id only when that id is held', () => {
    const { onUndo, click } = renderUndo();
    click('create t2');
    click('edit t1');
    expect(screen.getByText('Recorded t2.')).toBeInTheDocument();
    click('create t1');
    click('edit t1');
    expect(screen.queryByText('Recorded t1.')).not.toBeInTheDocument();
    click('shortcut');
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('exposes the new id as flashId for --dur-flash', () => {
    vi.useFakeTimers();
    const { click } = renderUndo();
    click('create t1');
    expect(screen.getByRole('status')).toHaveTextContent('t1');
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(screen.getByRole('status')).toHaveTextContent('none');
  });
});

describe('useSavedFeedback', () => {
  function Saver() {
    const saved = useSavedFeedback();
    return (
      <button type="button" onClick={() => void saved('Account saved.')}>
        save
      </button>
    );
  }

  it('shows a persistent Retry toast when the balance refetch fails', async () => {
    document.documentElement.style.setProperty('--dur-undo', '5s');
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let down = false;
    await queryClient.fetchQuery({
      queryKey: queryKeys.accountsList(false),
      queryFn: () => {
        if (down) throw new Error('offline');
        return [];
      },
    });
    down = true;
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Saver />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByText('Account saved.')).toBeInTheDocument();
    expect(await screen.findByText("Balances couldn't update.")).toBeInTheDocument();
    down = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText("Balances couldn't update.")).not.toBeInTheDocument();
  });
});
