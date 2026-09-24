import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INPUT } from '../../lib/styles';

export type PickerOption = {
  value: string;
  label: string;
  note?: string;
  disabled?: boolean;
};

type PickerProps = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: PickerOption[];
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
};

const PANEL_MAX_HEIGHT = 280;

export function Picker({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  describedBy,
}: PickerProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [panelHost, setPanelHost] = useState<Element>(document.body);

  const rows: PickerOption[] = [{ value: '', label: placeholder }, ...options];
  const selectedIndex = rows.findIndex((row) => row.value === (value ?? ''));
  const selected = selectedIndex > 0 ? rows[selectedIndex] : null;

  function close() {
    setOpen(false);
  }

  function openPanel() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setPanelHost(triggerRef.current?.closest('dialog') ?? document.body);
    setOpen(true);
  }

  function move(from: number, step: 1 | -1): number {
    let index = from;
    do {
      index += step;
    } while (index >= 0 && index < rows.length && rows[index].disabled);
    return index < 0 || index >= rows.length ? from : index;
  }

  function select(index: number) {
    const row = rows[index];
    if (!row || row.disabled) return;
    onChange(index === 0 ? null : row.value);
    close();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const flip = rect.bottom + PANEL_MAX_HEIGHT > window.innerHeight && rect.top > PANEL_MAX_HEIGHT;
    setPanelStyle({
      left: rect.left,
      right: 'auto',
      width: Math.max(rect.width, 190),
      ...(flip
        ? { top: 'auto', bottom: window.innerHeight - rect.top }
        : { top: rect.bottom, bottom: 'auto' }),
    });
    panelRef.current?.showPopover?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        panelRef.current.contains(event.target)
      ) {
        return;
      }
      close();
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openPanel();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => move(index, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => move(index, -1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        select(active);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`${INPUT} flex cursor-pointer items-center justify-between gap-8 text-left`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        {selected ? (
          <span className="flex min-w-0 gap-4">
            <span className="truncate">{selected.label}</span>
            {selected.note && <span className="shrink-0 text-text-3">{selected.note}</span>}
          </span>
        ) : (
          <span className="text-text-2">{placeholder}</span>
        )}
        <span aria-hidden="true" className="text-text-2">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <ul
            id={listId}
            ref={panelRef}
            role="listbox"
            popover="manual"
            className="fixed z-50 m-0 h-auto max-h-280 min-w-190 list-none overflow-x-hidden overflow-y-auto rounded-lg border border-sand-350 bg-sand-0 p-4 shadow-popover"
            style={panelStyle}
          >
            {rows.map((row, index) => (
              <li
                key={`${row.value}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={row.disabled || undefined}
                title={row.note ? `${row.label} ${row.note}` : row.label}
                className={`flex h-32 cursor-pointer items-center gap-4 rounded-sm px-12 text-15 aria-disabled:cursor-not-allowed aria-disabled:text-text-3 aria-selected:bg-accent-soft aria-selected:text-accent ${index === active ? 'bg-sand-100 shadow-focus' : 'text-text-1'}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="min-w-0 truncate">{row.label}</span>
                {row.note && <span className="shrink-0 text-text-3">{row.note}</span>}
              </li>
            ))}
          </ul>,
          panelHost,
        )}
    </div>
  );
}
