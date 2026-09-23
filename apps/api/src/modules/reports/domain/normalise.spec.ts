import { describe, expect, it } from 'vitest';
import { normalise } from './normalise';

describe('normalise', () => {
  it('folds case, spacing and one trailing digit run into one key', () => {
    expect(normalise('Uber 1234')).toBe('uber');
    expect(normalise('UBER  5678')).toBe('uber');
    expect(normalise('  uber ')).toBe('uber');
    expect(normalise('Uber1234')).toBe('uber');
  });

  it('collapses internal whitespace runs of any kind', () => {
    expect(normalise('Corner \t  Store\n 42')).toBe('corner store');
  });

  it('strips only digits at the very end', () => {
    expect(normalise('Flat 4B')).toBe('flat 4b');
    expect(normalise('7 Eleven')).toBe('7 eleven');
    expect(normalise('Order 12 34')).toBe('order 12');
  });

  it('falls back to the trimmed original when nothing is left', () => {
    expect(normalise('12345')).toBe('12345');
    expect(normalise('  12345  ')).toBe('12345');
  });
});
