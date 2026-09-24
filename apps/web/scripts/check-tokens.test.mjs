import { describe, expect, it } from 'vitest';
import { checkPairs, contrastRatio, definedTokens, scanSource } from './check-tokens.mjs';

const tokens = definedTokens(`
@theme static {
  --color-text-1: #0f1720;
  --color-sand-0: #ffffff;
  --color-decor-muted: #8a93a1;
  --color-scrim: rgb(15 23 32 / 0.42);
}
:root {
  --dur-hover: 150ms;
}
`);

function messages(text, kind = 'tsx') {
  return scanSource(text, tokens, kind).map((problem) => problem.message);
}

describe('definedTokens', () => {
  it('reads variables from the @theme block and the :root block', () => {
    expect(tokens.get('--color-text-1')).toBe('#0f1720');
    expect(tokens.get('--dur-hover')).toBe('150ms');
  });
});

describe('scanSource', () => {
  it('accepts token utilities, the 1px hairline, 0 values and a defined -(--token)', () => {
    expect(
      messages('<div className="h-42 p-14 w-px duration-(--dur-hover) ease-(--ease-out)" />'),
    ).toEqual(['--ease-out is not defined in design/tokens.css']);
    expect(messages('<svg className="stroke-(length:--icon-width)" />')).toEqual([
      '--icon-width is not defined in design/tokens.css',
    ]);
    expect(
      messages('border: 1px solid var(--color-sand-0); margin: 0px; --x: 0ms;', 'css'),
    ).toEqual([]);
  });

  it('rejects arbitrary values, including arbitrary properties', () => {
    expect(messages('<div className="bg-[#fff]" />')).toContain('Tailwind arbitrary value');
    expect(messages('<div className="hover:w-(--dur-hover) mt-[3rem]" />')).toEqual([
      'Tailwind arbitrary value',
    ]);
    expect(messages('<div className={`flex [mask-type:luminance]`} />')).toEqual([
      'Tailwind arbitrary value',
    ]);
  });

  it('rejects a bare numeric duration or delay', () => {
    expect(messages('<div className="duration-150" />')).toEqual([
      'bare numeric duration-*/delay-*',
    ]);
    expect(messages('<div className="hover:delay-75" />')).toEqual([
      'bare numeric duration-*/delay-*',
    ]);
  });

  it('rejects hex, rgb(), hsl(), px and ms literals', () => {
    expect(messages('<path fill="#b42318" />')).toEqual(['hex colour literal']);
    expect(messages('color: rgba(0, 0, 0, 0.5);', 'css')).toEqual(['rgb()/hsl() colour literal']);
    expect(messages('color: hsl(0 0% 0%);', 'css')).toEqual(['rgb()/hsl() colour literal']);
    expect(messages('width: 12px;', 'css')).toEqual(['px literal other than 0 and 1px']);
    expect(messages('transition: opacity 200ms;', 'css')).toEqual(['ms literal']);
  });

  it('exempts SVG geometry and ordinary code', () => {
    expect(
      messages('<svg viewBox="0 0 24 24"><path d="M3 10h18M6 10v8" strokeWidth="1.6" /></svg>'),
    ).toEqual([]);
    expect(messages('const pair = [first, second]; const x = items[i - 1];')).toEqual([]);
    expect(messages('const type = { [key: string]: number };')).toEqual([]);
  });

  it('reports the line of each problem', () => {
    expect(scanSource('ok\nwidth: 3px;', tokens, 'css')).toEqual([
      { line: 2, message: 'px literal other than 0 and 1px' },
    ]);
  });
});

describe('contrastRatio', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#8a93a1', '#ffffff')).toBeLessThan(4.5);
  });
});

describe('checkPairs', () => {
  const table = (text, surface, size = 'body') => `| \`${text}\` | \`${surface}\` | ${size} |`;

  it('passes a pair above 4.5:1', () => {
    expect(checkPairs(table('--color-text-1', '--color-sand-0'), tokens)).toEqual([]);
  });

  it('fails a pair below the threshold for its size', () => {
    const extra = new Map([...tokens, ['--color-text-3', '#8a93a1']]);
    expect(checkPairs(table('--color-text-3', '--color-sand-0'), extra)).toEqual([
      '--color-text-3 on --color-sand-0: 3.10:1 is below 4.5:1 (body)',
    ]);
    expect(checkPairs(table('--color-text-3', '--color-sand-0', 'large'), extra)).toEqual([]);
  });

  it('fails any pair that uses a decor token', () => {
    expect(checkPairs(table('--color-decor-muted', '--color-sand-0', 'large'), tokens)).toEqual([
      '--color-decor-muted on --color-sand-0: decor tokens never pair with text',
    ]);
  });

  it('fails an undefined or non-solid token', () => {
    expect(checkPairs(table('--color-missing', '--color-sand-0'), tokens)).toHaveLength(1);
    expect(checkPairs(table('--color-text-1', '--color-scrim'), tokens)).toHaveLength(1);
  });
});
