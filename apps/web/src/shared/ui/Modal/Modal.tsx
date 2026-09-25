import { PointerEvent, ReactNode, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { ROW_ACTION } from '../../lib/styles';

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'form' | 'palette' | 'sheet';
};

const DIALOG = 'w-full bg-sand-0 p-0 text-text-1 shadow-overlay backdrop:bg-scrim';

const DISMISS_SHARE = 0.35;

export function Modal({ title, open, onClose, children, variant = 'form' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragStart = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  if (!open) return null;

  const onHandleDown = (event: PointerEvent) => {
    dragStart.current = event.clientY;
  };
  const onHandleMove = (event: PointerEvent) => {
    if (dragStart.current !== null) setDrag(Math.max(0, event.clientY - dragStart.current));
  };
  const onHandleUp = (event: PointerEvent) => {
    if (dragStart.current === null) return;
    const height = dialogRef.current?.getBoundingClientRect().height ?? 0;
    const dismiss = event.clientY - dragStart.current > height * DISMISS_SHARE;
    dragStart.current = null;
    setDrag(0);
    if (dismiss) onClose();
  };

  const onCancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };

  if (variant === 'palette') {
    return (
      <dialog
        ref={dialogRef}
        className={`${DIALOG} mx-auto mt-110 max-w-620 overflow-hidden rounded-3xl open:animate-dialog`}
        aria-label={title}
        onCancel={onCancel}
      >
        {children}
      </dialog>
    );
  }

  const sheet = variant === 'sheet';

  return (
    <dialog
      ref={dialogRef}
      className={
        sheet
          ? `${DIALOG} mx-0 mt-auto mb-0 max-w-none rounded-t-5xl open:animate-sheet ${drag === 0 ? 'transition-transform duration-(--dur-hover) ease-(--ease-out)' : ''}`
          : `${DIALOG} m-auto max-w-440 rounded-4xl open:animate-dialog`
      }
      style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
      aria-label={title}
      onCancel={onCancel}
    >
      {sheet && (
        <div
          aria-hidden="true"
          className="flex cursor-grab touch-none justify-center pt-10 pb-4"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(0);
          }}
        >
          <span className="h-5 w-40 rounded-pill bg-sand-600" />
        </div>
      )}
      <div className={`flex items-center justify-between gap-12 px-22 ${sheet ? 'pt-6' : 'pt-20'}`}>
        <h2 className="text-17 font-semibold">{title}</h2>
        <button type="button" className={ROW_ACTION} aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="px-22 pt-18 pb-20">{children}</div>
    </dialog>
  );
}
