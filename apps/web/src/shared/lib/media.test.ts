import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePhoneLayout } from './media';

function stubWidth(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
  });
  return {
    queries,
    listeners,
    resize(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.unstubAllGlobals();
});

describe('usePhoneLayout', () => {
  it('is false when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => usePhoneLayout()).result.current).toBe(false);
  });

  it('matches below --breakpoint-md and follows width changes until unmounted', () => {
    document.documentElement.style.setProperty('--breakpoint-md', '48rem');
    const media = stubWidth(true);
    const { result, unmount } = renderHook(() => usePhoneLayout());
    expect(media.queries).toContain('(width < 48rem)');
    expect(result.current).toBe(true);
    act(() => media.resize(false));
    expect(result.current).toBe(false);
    act(() => media.resize(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
