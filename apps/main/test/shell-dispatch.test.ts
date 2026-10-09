import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { dispatchShellRequest, ShellFailure } from '../src/policy/shell-dispatch.ts';
import { type KeyInput, matchShortcut, nextZoomLevel } from '../src/policy/shortcuts.ts';
import { chromeWindowOptions, WINDOW_BACKGROUND } from '../src/policy/window-options.ts';

const request = (method: string, input: unknown) => ({ id: 1, method, input });

describe('shell request pipeline', () => {
  it('rejects untrusted senders, bad envelopes, unknown methods and invalid input before any handler runs', async () => {
    const handler = vi.fn(() => ({}));
    const handlers = { 'shell.window': handler };
    expect(
      await dispatchShellRequest(false, request('shell.window', { action: 'minimize' }), handlers),
    ).toEqual({ id: 1, ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await dispatchShellRequest(true, { method: 'shell.window' }, handlers)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(await dispatchShellRequest(true, request('shell.devtools', {}), handlers)).toMatchObject(
      { ok: false, error: { code: 'UNKNOWN_METHOD' } },
    );
    expect(await dispatchShellRequest(true, request('constructor', {}), handlers)).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_METHOD' },
    });
    expect(
      await dispatchShellRequest(
        true,
        request('shell.window', { action: 'openDevTools' }),
        handlers,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(
      await dispatchShellRequest(
        true,
        request('shell.window', { action: 'minimize', pad: 'x'.repeat(200) }),
        handlers,
      ),
    ).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
    // A known contract with no registered handler is still unknown.
    expect(await dispatchShellRequest(true, request('shell.getTheme', {}), handlers)).toMatchObject(
      { ok: false, error: { code: 'UNKNOWN_METHOD' } },
    );
    expect(handler).not.toHaveBeenCalled();
  });
  it('passes the parsed input, validates the output and maps failures to codes', async () => {
    const handler = vi.fn(() => ({}));
    expect(
      await dispatchShellRequest(true, request('shell.window', { action: 'close' }), {
        'shell.window': handler,
      }),
    ).toEqual({ id: 1, ok: true, output: {} });
    expect(handler).toHaveBeenCalledWith({ action: 'close' });
    expect(
      await dispatchShellRequest(true, request('shell.getTheme', {}), {
        'shell.getTheme': () => ({ theme: 'neon', dark: true }),
      }),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(
      await dispatchShellRequest(true, request('shell.getTheme', {}), {
        'shell.getTheme': () => {
          throw new ShellFailure('READ_ONLY');
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } });
    expect(
      await dispatchShellRequest(true, request('shell.getTheme', {}), {
        'shell.getTheme': () => Promise.reject(new Error('boom')),
      }),
    ).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });
});

describe('frameless window options', () => {
  it('hides the OS title bar everywhere and positions traffic lights only on macOS', () => {
    expect(chromeWindowOptions('win32', false)).toEqual({
      titleBarStyle: 'hidden',
      backgroundColor: WINDOW_BACKGROUND.light,
    });
    expect(chromeWindowOptions('darwin', true)).toEqual({
      titleBarStyle: 'hidden',
      backgroundColor: WINDOW_BACKGROUND.dark,
      trafficLightPosition: { x: 12, y: 10 },
    });
  });
  it('paints the native window background with the renderer surface token of each theme', () => {
    const tokens = readFileSync('apps/renderer/src/styles/tokens.css', 'utf8');
    const [light, dark] = [...tokens.matchAll(/--color-surface:\s*(#[0-9A-F]{6});/gi)].map(
      (match) => match[1]!.toUpperCase(),
    );
    expect([light, dark]).toEqual([WINDOW_BACKGROUND.light, WINDOW_BACKGROUND.dark]);
  });
});

describe('frameless keyboard shortcuts', () => {
  const key = (code: string, extra: Partial<KeyInput> = {}): KeyInput => ({
    type: 'keyDown',
    code,
    control: true,
    meta: false,
    alt: false,
    shift: false,
    ...extra,
  });
  it('matches navigation and zoom on physical key codes on Windows and Linux only', () => {
    expect(matchShortcut(key('Digit2'), 'win32')).toEqual({ navigate: '#/system-check' });
    expect(matchShortcut(key('Digit1'), 'linux')).toEqual({ navigate: '#/' });
    expect(matchShortcut(key('Comma'), 'win32')).toEqual({ navigate: '#/settings' });
    expect(matchShortcut(key('Equal', { shift: true }), 'win32')).toEqual({ zoom: 'in' });
    expect(matchShortcut(key('NumpadSubtract'), 'win32')).toEqual({ zoom: 'out' });
    expect(matchShortcut(key('Digit0'), 'win32')).toEqual({ zoom: 'reset' });
    expect(matchShortcut(key('Digit2'), 'darwin')).toBeUndefined();
  });
  it('ignores key-ups, other modifiers and unrelated keys so text editing keeps working', () => {
    for (const input of [
      key('Digit2', { type: 'keyUp' }),
      key('Digit2', { control: false }),
      key('Digit2', { alt: true }),
      key('Digit2', { shift: true }),
      key('KeyC'),
      key('KeyA'),
      key('Digit9'),
    ])
      expect(matchShortcut(input, 'win32')).toBeUndefined();
  });
  it('steps zoom by half a level within legible bounds', () => {
    expect(nextZoomLevel(0, 'in')).toBe(0.5);
    expect(nextZoomLevel(5, 'in')).toBe(5);
    expect(nextZoomLevel(-3, 'out')).toBe(-3);
    expect(nextZoomLevel(2.5, 'reset')).toBe(0);
  });
});
