import { ReactNode, SyntheticEvent, useEffect, useRef } from 'react';
import { ROW_ACTION } from '../../lib/styles';

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'form' | 'palette';
};

const DIALOG =
  'w-full bg-sand-0 p-0 text-text-1 shadow-overlay backdrop:bg-scrim open:animate-dialog';

export function Modal({ title, open, onClose, children, variant = 'form' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  const onCancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };

  if (variant === 'palette') {
    return (
      <dialog
        ref={dialogRef}
        className={`${DIALOG} mx-auto mt-110 max-w-620 overflow-hidden rounded-3xl`}
        aria-label={title}
        onCancel={onCancel}
      >
        {children}
      </dialog>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${DIALOG} m-auto max-w-440 rounded-4xl`}
      aria-label={title}
      onCancel={onCancel}
    >
      <div className="flex items-center justify-between gap-12 px-22 pt-20">
        <h2 className="text-17 font-semibold">{title}</h2>
        <button type="button" className={ROW_ACTION} aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="px-22 pt-18 pb-20">{children}</div>
    </dialog>
  );
}
