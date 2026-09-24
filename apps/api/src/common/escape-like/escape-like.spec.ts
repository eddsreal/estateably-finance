import { describe, expect, it } from 'vitest';
import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it('escapes the backslash', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('escapes the percent sign', () => {
    expect(escapeLike('50%')).toBe('50\\%');
  });

  it('escapes the underscore', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes a mix of them, each on its own', () => {
    expect(escapeLike('\\%_x_%\\')).toBe('\\\\\\%\\_x\\_\\%\\\\');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeLike('Uber trip 42')).toBe('Uber trip 42');
  });
});
