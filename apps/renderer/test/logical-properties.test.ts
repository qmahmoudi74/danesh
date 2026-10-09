import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
export function bannedTokens(source: string): string[] {
  const patterns = [/\b(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r)-[\w\[]+/g, /\b(?:text-left|text-right|float-left|float-right|font-bold|font-medium|text-xs|text-sm|text-lg|text-xl|text-2xl)\b/g, /\b(?:margin-left|margin-right|padding-left|padding-right|left|right)\s*:/g, /text-align\s*:\s*(?:left|right)\b/g, /\b(?:m[setxy]?|p[setxy]?|gap(?:-x|-y)?|space-[xy])-\[[^\]]+\]/g];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[0]));
}
function files(root: string): string[] { return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : /\.(tsx?|css)$/.test(entry.name) ? [join(root, entry.name)] : []); }
describe('logical styling contract', () => {
  it('rejects genuine physical direction, typography and arbitrary-spacing violations', () => {
    for (const source of ['className="ml-4"', 'border-l-2', 'text-left', 'font-bold text-sm', 'margin-right: 8px', 'left: 0', 'text-align: right', 'p-[12px]', 'gap-[3px]']) expect(bannedTokens(source).length).toBeGreaterThan(0);
    expect(bannedTokens('ms-4 ps-8 text-start border-s-2 rtl:rotate-180 max-inline-size: 720px')).toEqual([]);
  });
  it('finds zero banned tokens in all renderer source files', () => {
    const violations = files(resolve('apps/renderer/src')).flatMap((path) => bannedTokens(readFileSync(path, 'utf8')).map((token) => `${path}: ${token}`));
    expect(violations).toEqual([]);
  });
});
