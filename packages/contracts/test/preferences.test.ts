import { describe, expect, it } from 'vitest';
import { MAX_PREFERENCES_BYTES, parseUiPreferences } from '../src/preferences.ts';
import { shellEventPayloads, shellMethods } from '../src/shell.ts';

describe('UI preferences parsing', () => {
  it('defaults to no saved theme (System) and no window bounds for missing, corrupt or hostile files', () => {
    for (const text of [undefined, '', '{', 'null', '[]', '"dark"', '{"__proto__":{"theme":"dark"}}', 'x'.repeat(MAX_PREFERENCES_BYTES + 1)]) expect(parseUiPreferences(text)).toEqual({ version: 1 });
  });
  it('keeps every still-valid field and drops invalid ones independently', () => {
    expect(parseUiPreferences('{"version":1,"theme":"dark","window":"broken"}')).toEqual({ version: 1, theme: 'dark' });
    expect(parseUiPreferences('{"version":9,"theme":"neon","window":{"x":10,"y":20,"width":900,"height":640,"maximized":true}}')).toEqual({ version: 1, window: { x: 10, y: 20, width: 900, height: 640, maximized: true } });
  });
  it('rejects fractional, out-of-range and over-specified bounds', () => {
    for (const window of [{ x: 0.5, y: 0, width: 900, height: 640, maximized: false }, { x: 0, y: 0, width: 50, height: 640, maximized: false }, { x: 0, y: 0, width: 900, height: 640, maximized: false, extra: 1 }, { x: 1e9, y: 0, width: 900, height: 640, maximized: false }]) {
      expect(parseUiPreferences(JSON.stringify({ version: 1, theme: 'light', window }))).toEqual({ version: 1, theme: 'light' });
    }
  });
});

describe('closed shell window and theme contracts', () => {
  it('allows exactly three window actions and three themes, with no extra fields', () => {
    for (const action of ['minimize', 'toggleMaximize', 'close']) expect(shellMethods['shell.window']!.input.safeParse({ action }).success).toBe(true);
    for (const input of [{ action: 'openDevTools' }, { action: 'close', target: 2 }, {}, { action: 'setBounds' }]) expect(shellMethods['shell.window']!.input.safeParse(input).success).toBe(false);
    for (const theme of ['system', 'light', 'dark']) expect(shellMethods['shell.setTheme']!.input.safeParse({ theme }).success).toBe(true);
    for (const input of [{ theme: 'neon' }, { theme: 'dark', path: 'C:/' }, { theme: 'DARK' }]) expect(shellMethods['shell.setTheme']!.input.safeParse(input).success).toBe(false);
  });
  it('bounds menu popup coordinates to non-negative integers', () => {
    expect(shellMethods['shell.showAppMenu']!.input.safeParse({ x: 10, y: 40 }).success).toBe(true);
    for (const input of [{ x: -1, y: 0 }, { x: 1.5, y: 0 }, { x: 0, y: 1e9 }, { x: 0 }]) expect(shellMethods['shell.showAppMenu']!.input.safeParse(input).success).toBe(false);
  });
  it('routes only to real destinations', () => {
    for (const route of ['#/', '#/system-check', '#/settings']) expect(shellEventPayloads['shell.navigate']!.safeParse({ route }).success).toBe(true);
    for (const route of ['#/reader', 'https://example.com', '#/settings/../']) expect(shellEventPayloads['shell.navigate']!.safeParse({ route }).success).toBe(false);
  });
});
