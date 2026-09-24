import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoFile = (path) => fileURLToPath(new URL(path, import.meta.url));

const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\(/;
const PX = /(?<![\w.-])(\d*\.?\d+)px\b/g;
const MS = /(?<![\w.-])(\d*\.?\d+)ms\b/g;
const ARBITRARY = /(?:^|[\s"'`{])!?(?:[\w-]+:)*(?:[\w-]*-\[[^\]\s]*\]|\[[\w-]+:[^\]\s]+\])/;
const VARIABLE_ESCAPE = /-\((?:[\w-]+:)?(--[\w-]+)\)/g;
const BARE_TIMING = /(?:^|[\s"'`{:])(?:duration|delay)-\d+\b/;
const PAIR_ROW = /^\|\s*`(--color-[\w-]+)`\s*\|\s*`(--color-[\w-]+)`\s*\|\s*(body|large)\s*\|/;

export function definedTokens(css) {
  const tokens = new Map();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function nonZero(line, pattern, allowed) {
  return [...line.matchAll(pattern)].some((match) => !allowed.includes(Number(match[1])));
}

export function scanSource(text, tokens, kind) {
  const problems = [];
  text.split('\n').forEach((line, index) => {
    const report = (message) => problems.push({ line: index + 1, message });
    if (HEX.test(line)) report('hex colour literal');
    if (COLOR_FUNCTION.test(line)) report('rgb()/hsl() colour literal');
    if (nonZero(line, PX, [0, 1])) report('px literal other than 0 and 1px');
    if (nonZero(line, MS, [0])) report('ms literal');
    if (BARE_TIMING.test(line)) report('bare numeric duration-*/delay-*');
    if (kind === 'tsx' && ARBITRARY.test(line)) report('Tailwind arbitrary value');
    for (const match of line.matchAll(VARIABLE_ESCAPE)) {
      if (!tokens.has(match[1])) report(`${match[1]} is not defined in design/tokens.css`);
    }
  });
  return problems;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function checkPairs(markdown, tokens) {
  const problems = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(PAIR_ROW);
    if (!match) continue;
    const [, text, surface, size] = match;
    const label = `${text} on ${surface}`;
    if (text.startsWith('--color-decor-') || surface.startsWith('--color-decor-')) {
      problems.push(`${label}: decor tokens never pair with text`);
      continue;
    }
    const colors = [text, surface].map((name) => tokens.get(name));
    if (!colors.every((value) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value ?? ''))) {
      problems.push(`${label}: both tokens must be defined as solid hex colours`);
      continue;
    }
    const ratio = contrastRatio(colors[0], colors[1]);
    const minimum = size === 'large' ? 3 : 4.5;
    if (ratio < minimum) {
      problems.push(`${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1 (${size})`);
    }
  }
  return problems;
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function main() {
  const tokens = definedTokens(readFileSync(repoFile('../../../design/tokens.css'), 'utf8'));
  const failures = [];
  for (const path of sourceFiles(repoFile('../src'))) {
    const kind = path.endsWith('.tsx') ? 'tsx' : 'css';
    for (const problem of scanSource(readFileSync(path, 'utf8'), tokens, kind)) {
      failures.push(`${relative(process.cwd(), path)}:${problem.line}  ${problem.message}`);
    }
  }
  for (const problem of checkPairs(
    readFileSync(repoFile('../../../design/design-system.md'), 'utf8'),
    tokens,
  )) {
    failures.push(`design/design-system.md  ${problem}`);
  }
  for (const failure of failures) console.error(failure);
  console.log(
    failures.length === 0
      ? 'check:tokens OK: tokens only, every documented pair meets WCAG AA'
      : `check:tokens FAILED: ${failures.length} problem(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
