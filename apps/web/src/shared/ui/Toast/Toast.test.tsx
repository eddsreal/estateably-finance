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
