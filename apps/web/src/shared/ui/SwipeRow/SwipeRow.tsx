import { MouseEvent, PointerEvent, ReactNode, useRef, useState } from 'react';

const ACT_SHARE = 0.35;
const TAP_SHARE = 0.04;

type SwipeRowProps = {
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
};

export function SwipeRow({ children, onEdit, onDelete }: SwipeRowProps) {
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  const [offset, setOffset] = useState(0);

  const width = (event: PointerEvent) => event.currentTarget.getBoundingClientRect().width;

  const onPointerDown = (event: PointerEvent) => {
    start.current = event.clientX;
    dragged.current = false;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (start.current === null) return;
    const distance = event.clientX - start.current;
    if (Math.abs(distance) > width(event) * TAP_SHARE) dragged.current = true;
    setOffset(distance);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return;
    const distance = event.clientX - start.current;
    start.current = null;
    setOffset(0);
    if (Math.abs(distance) <= width(event) * ACT_SHARE) return;
    if (distance < 0) onDelete();
    else onEdit();
  };
  const onClickCapture = (event: MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="relative overflow-hidden">
      {offset !== 0 && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center px-22 text-14 font-semibold text-text-on-ink ${offset < 0 ? 'justify-end bg-negative' : 'justify-start bg-accent'}`}
        >
          {offset < 0 ? 'Delete' : 'Edit'}
        </div>
      )}
      <div
        className={`relative touch-pan-y bg-sand-0 ${offset === 0 ? 'transition-transform duration-(--dur-hover) ease-(--ease-out)' : ''}`}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setOffset(0);
        }}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
