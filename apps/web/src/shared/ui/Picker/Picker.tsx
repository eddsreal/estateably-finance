import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

  const rows: PickerOption[] = [{ value: '', label: placeholder }, ...options];
  const selectedIndex = rows.findIndex((row) => row.value === (value ?? ''));
  const selected = selectedIndex > 0 ? rows[selectedIndex] : null;

  function close() {
    setOpen(false);
  }

  function openPanel() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
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
      width: Math.max(rect.width, 190),
      ...(flip ? { bottom: window.innerHeight - rect.top } : { top: rect.bottom }),
    });
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
    <div className="picker">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="picker-trigger"
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
          <span>
            {selected.label}
            {selected.note && <span className="note">{selected.note}</span>}
          </span>
        ) : (
          <span className="placeholder">{placeholder}</span>
        )}
        <span aria-hidden="true">▾</span>
      </button>
      {open &&
        createPortal(
          <ul id={listId} ref={panelRef} role="listbox" className="picker-panel" style={panelStyle}>
            {rows.map((row, index) => (
              <li
                key={`${row.value}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={row.disabled || undefined}
                className={`picker-option${index === active ? ' active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onMouseEnter={() => setActive(index)}
              >
                {row.label}
                {row.note && <span className="note">{row.note}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
