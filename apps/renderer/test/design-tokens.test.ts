import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokenFile = resolve('apps/renderer/src/styles/tokens.css');
const tokens = readFileSync(tokenFile, 'utf8');
const colorLiteral = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/gi;
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(root, entry.name))
      : /\.(tsx?|css)$/.test(entry.name)
        ? [join(root, entry.name)]
        : [],
  );
}

function theme(dark: boolean): Record<string, string> {
  const block = dark
    ? tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'))
    : tokens.slice(0, tokens.indexOf('@media (prefers-color-scheme: dark)'));
  const values = Object.fromEntries(
    [...block.matchAll(/(--color-[\w-]+):\s*(#[0-9A-F]{6});/gi)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  );
  return dark ? { ...theme(false), ...values } : values;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe('design tokens', () => {
  it('keeps every renderer color literal inside the token file', () => {
    expect(colorLiteral.test('color: #fff; background: rgb(0 0 0)')).toBe(true);
    const violations = files(resolve('apps/renderer/src'))
      .filter((path) => path !== tokenFile)
      .flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(colorLiteral)].map(
          (match) => `${path}: ${match[0]}`,
        ),
      );
    expect(violations).toEqual([]);
  });
  it('defines the same semantic color names in both themes', () => {
    const light = Object.keys(theme(false))
      .filter((name) => !name.includes('danger-chrome'))
      .sort(); // the close-button red is deliberately identical in both themes
    const darkOnly = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));
    for (const name of light) expect(darkOnly, name).toContain(`${name}:`);
  });
  for (const dark of [false, true]) {
    it(`meets WCAG contrast in the ${dark ? 'dark' : 'light'} theme`, () => {
      const t = theme(dark);
      const surfaces = [
        '--color-surface',
        '--color-surface-raised',
        '--color-chrome',
        '--color-overlay',
        '--color-hover',
        '--color-selected',
      ];
      for (const surface of surfaces) {
        expect(
          contrast(t['--color-text']!, t[surface]!),
          `text on ${surface}`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(t['--color-text-muted']!, t[surface]!),
          `muted on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of ['--color-surface', '--color-chrome', '--color-selected'])
        expect(
          contrast(t['--color-link']!, t[surface]!),
          `link on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--color-on-accent']!, t['--color-accent']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--color-on-accent']!, t['--color-accent-hover']!)).toBeGreaterThanOrEqual(
        4.5,
      );
      for (const surface of ['--color-surface', '--color-chrome', '--color-surface-raised']) {
        expect(
          contrast(t['--color-focus']!, t[surface]!),
          `focus on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(t['--color-border-control']!, t[surface]!),
          `control border on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
      for (const status of ['pass', 'fail', 'warn'])
        expect(
          contrast(t[`--color-${status}`]!, t[`--color-${status}-tint`]!),
          status,
        ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--color-accent']!, t['--color-info-tint']!)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(t['--color-scrollbar-hover']!, t['--color-surface']!),
        'scrollbar thumb on hover',
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(t['--color-on-danger-chrome']!, t['--color-danger-chrome']!),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('collapses every motion duration under reduced motion', () => {
    const reduced = tokens.slice(tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['instant', 'fast', 'base', 'slow'])
      expect(reduced).toMatch(new RegExp(`--duration-${name}:\\s*0ms`));
  });
});
