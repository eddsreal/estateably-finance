import {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ICON_BUTTON } from '../../lib/styles';

type RowActionsProps = {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

const ITEM =
  'flex h-36 w-full cursor-pointer items-center rounded-sm px-12 text-left text-14 font-medium focus-visible:bg-sand-100 hover:bg-sand-100';

export function RowActions({ label, onEdit, onDelete }: RowActionsProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<'first' | 'last' | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const items = () => [
    ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ];

  function close(refocus: boolean) {
    setOpen(null);
    if (refocus) buttonRef.current?.focus();
  }

  function run(event: ReactMouseEvent, action: () => void) {
    event.stopPropagation();
    close(true);
    action();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setMenuStyle({ top: rect.bottom, right: window.innerWidth - rect.right });
    menuRef.current?.showPopover?.();
    const list = items();
    (open === 'first' ? list[0] : list[list.length - 1])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(event.key === 'ArrowDown' ? 'first' : 'last');
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => list[(next + list.length) % list.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focus(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focus(0);
        break;
      case 'End':
        event.preventDefault();
        focus(list.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  return (
    <span className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className={ICON_BUTTON}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(false);
          else setOpen('first');
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <ul
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          popover="manual"
          className="fixed inset-auto z-50 m-0 min-w-190 list-none rounded-lg border border-sand-350 bg-sand-0 p-4 text-text-1 shadow-popover"
          style={menuStyle}
          onKeyDown={onMenuKeyDown}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={ITEM}
              onClick={(event) => run(event, onEdit)}
            >
              Edit
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${ITEM} text-negative`}
              onClick={(event) => run(event, onDelete)}
            >
              Delete
            </button>
          </li>
        </ul>
      )}
    </span>
  );
}
