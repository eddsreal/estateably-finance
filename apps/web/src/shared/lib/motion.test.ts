import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animate, durationMs, easeOut, easeOutCurve, timeLimitMs } from './motion';

const tokens = readFileSync(join(import.meta.dirname, '../../../../../design/tokens.css'), 'utf8');

function setToken(name: string) {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? '';
  document.documentElement.style.setProperty(name, value);
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }));
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.unstubAllGlobals();
});

describe('durationMs', () => {
  it('reads the duration tokens of tokens.css, in ms or s', () => {
    setToken('--dur-morph');
    setToken('--dur-count');
    expect(durationMs('--dur-morph')).toBe(400);
    expect(durationMs('--dur-count')).toBe(700);
    document.documentElement.style.setProperty('--dur-flash', '2.4s');
    expect(durationMs('--dur-flash')).toBe(2400);
  });

  it('is zero when the token is missing or reduced motion is on', () => {
    expect(durationMs('--dur-count')).toBe(0);
    setToken('--dur-count');
    stubReducedMotion(true);
    expect(durationMs('--dur-count')).toBe(0);
  });
});

describe('timeLimitMs', () => {
  it('keeps --dur-undo and --dur-flash under reduced motion', () => {
    setToken('--dur-undo');
    setToken('--dur-flash');
    stubReducedMotion(true);
    expect(timeLimitMs('--dur-undo')).toBe(5000);
    expect(timeLimitMs('--dur-flash')).toBe(2400);
    expect(durationMs('--dur-undo')).toBe(0);
  });
});

describe('easeOut', () => {
  it('follows the --ease-out curve from 0 to 1, ahead of linear in the middle', () => {
    setToken('--ease-out');
    expect(easeOutCurve()).toBe('cubic-bezier(0.2,0.8,0.2,1)');
    expect(easeOut(0)).toBeCloseTo(0, 5);
    expect(easeOut(1)).toBeCloseTo(1, 5);
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map(easeOut);
    expect(samples.every((value, i) => i === 0 || value > samples[i - 1])).toBe(true);
  });
});

describe('animate', () => {
  it('jumps straight to the final frame for a zero duration', () => {
    const frames: number[] = [];
    animate(0, (eased) => frames.push(eased));
    expect(frames).toEqual([1]);
  });

  it('ends on exactly 1 and can be cancelled', async () => {
    const frames: number[] = [];
    await new Promise<void>((resolve) =>
      animate(30, (eased) => {
        frames.push(eased);
        if (eased === 1) resolve();
      }),
    );
    expect(frames.at(-1)).toBe(1);
    const cancelled: number[] = [];
    animate(30, (eased) => cancelled.push(eased))();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cancelled).toEqual([]);
  });
});
