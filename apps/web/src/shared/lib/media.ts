import { useSyncExternalStore } from 'react';

function phoneQuery(): string {
  const breakpoint = getComputedStyle(document.documentElement)
    .getPropertyValue('--breakpoint-md')
    .trim();
  return `(width < ${breakpoint})`;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const list = window.matchMedia(phoneQuery());
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function isPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(phoneQuery()).matches;
}

export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
