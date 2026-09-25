import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isApiError, NETWORK_ERROR } from '../../lib/form-errors';
import { timeLimitMs } from '../../lib/motion';
import { refetchEntryDerived } from '../../lib/query-keys';

export type ToastKind = 'saved' | 'undo' | 'error' | 'refresh-failed';

export type ToastInput = {
  kind: ToastKind;
  message: string;
  correlationId?: string;
  onRetry?: () => Promise<unknown>;
  transactionId?: string;
  onUndo?: () => Promise<void>;
};

type Toast = ToastInput & { id: number };

type ToastApi = {
  show: (toast: ToastInput) => void;
  showError: (error: unknown) => void;
  undo: () => boolean;
  closeUndoFor: (transactionId: string) => void;
  flashId: string | null;
};

export type UndoInput = { transactionId: string; onUndo: () => Promise<void> };

const ToastContext = createContext<ToastApi>({
  show: () => undefined,
  showError: () => undefined,
  undo: () => false,
  closeUndoFor: () => undefined,
  flashId: null,
});

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function useSavedFeedback(): (message: string, undo?: UndoInput) => Promise<void> {
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useCallback(
    async (message: string, undo?: UndoInput) => {
      show(undo ? { kind: 'undo', message, ...undo } : { kind: 'saved', message });
      try {
        await refetchEntryDerived(queryClient);
      } catch {
        show({
          kind: 'refresh-failed',
          message: "Balances couldn't update.",
          onRetry: () => refetchEntryDerived(queryClient),
        });
      }
    },
    [queryClient, show],
  );
}

const TOAST =
  'pointer-events-auto flex max-w-440 items-center gap-10 rounded-xl bg-ink-900 py-8 pr-8 pl-12 text-13 text-text-on-ink shadow-toast';
const TOAST_BUTTON =
  'inline-flex h-30 flex-none cursor-pointer items-center rounded-md bg-sand-0 px-10 text-12 font-semibold text-text-1 transition active:scale-97 active:duration-(--dur-press) duration-(--dur-hover) ease-(--ease-out) disabled:cursor-not-allowed';

function ToastView({
  toast,
  dismiss,
  undo,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
  undo: () => boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const onClose = () => dismiss(toast.id);

  useEffect(() => {
    if (toast.kind !== 'saved' && toast.kind !== 'undo') return;
    const timer = setTimeout(() => dismiss(toast.id), timeLimitMs('--dur-undo'));
    return () => clearTimeout(timer);
  }, [toast.kind, toast.id, dismiss]);

  const retry = async () => {
    if (!toast.onRetry) return;
    setRetrying(true);
    try {
      await toast.onRetry();
      onClose();
    } catch {
      setRetrying(false);
    }
  };

  return (
    <div className={`${TOAST} relative overflow-hidden`}>
      {toast.kind === 'refresh-failed' && (
        <span
          aria-hidden="true"
          className="grid size-20 flex-none place-items-center rounded-pill bg-warning text-11 font-bold"
        >
          !
        </span>
      )}
      {toast.kind === 'error' && (
        <span aria-hidden="true" className="flex-none">
          ⚠
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 font-medium">
        <span>{toast.message}</span>
        {toast.correlationId && (
          <span className="font-mono text-12 font-regular text-ink-300">
            Correlation ID {toast.correlationId}
          </span>
        )}
      </div>
      {toast.kind === 'error' && toast.correlationId && (
        <button
          type="button"
          className={TOAST_BUTTON}
          onClick={() => {
            void navigator.clipboard
              .writeText(toast.correlationId ?? '')
              .then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy ID'}
        </button>
      )}
      {toast.kind === 'undo' && (
        <>
          <button type="button" className={TOAST_BUTTON} onClick={() => undo()}>
            Undo <kbd className="ml-6 font-mono text-11 font-regular text-text-2">⌘Z</kbd>
          </button>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2 origin-left animate-undo bg-accent-on-ink"
          />
        </>
      )}
      {toast.kind === 'refresh-failed' ? (
        <button type="button" className={TOAST_BUTTON} disabled={retrying} onClick={retry}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      ) : (
        <button
          type="button"
          aria-label="Dismiss"
          className="inline-flex size-30 flex-none cursor-pointer items-center justify-center rounded-md text-ink-300 hover:text-text-on-ink"
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);
  const nextId = useRef(0);
  const pendingUndo = useRef<Toast | null>(null);

  const dismiss = useCallback((id: number) => {
    if (pendingUndo.current?.id === id) pendingUndo.current = null;
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const next = { ...toast, id: nextId.current };
    if (next.kind === 'undo') {
      pendingUndo.current = next;
      setFlashId(next.transactionId ?? null);
    }
    setToasts((current) =>
      next.kind === 'refresh-failed' || next.kind === 'undo'
        ? [...current.filter((t) => t.kind !== next.kind), next]
        : [...current, next],
    );
  }, []);

  const undo = useCallback(() => {
    const toast = pendingUndo.current;
    if (!toast) return false;
    dismiss(toast.id);
    void toast.onUndo?.();
    return true;
  }, [dismiss]);

  const closeUndoFor = useCallback(
    (transactionId: string) => {
      const toast = pendingUndo.current;
      if (toast?.transactionId === transactionId) dismiss(toast.id);
    },
    [dismiss],
  );

  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => setFlashId(null), timeLimitMs('--dur-flash'));
    return () => clearTimeout(timer);
  }, [flashId]);

  const showError = useCallback(
    (error: unknown) => {
      show(
        isApiError(error)
          ? { kind: 'error', message: error.message, correlationId: error.correlationId }
          : { kind: 'error', message: NETWORK_ERROR },
      );
    },
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, showError, undo, closeUndoFor, flashId }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 max-md:bottom-110 flex flex-col items-center gap-8 px-16"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} dismiss={dismiss} undo={undo} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
