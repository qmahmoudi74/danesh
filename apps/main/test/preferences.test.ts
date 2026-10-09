import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundsToSave, loadPreferences, measureDrift, PREFERENCES_FILE, restoreWindowBounds, savePreferences } from '../src/preferences.ts';

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const secondary = { x: -1280, y: 200, width: 1280, height: 984 };

describe('window placement', () => {
  it('restores saved bounds that are still reachable, including on a secondary display at negative coordinates', () => {
    expect(restoreWindowBounds({ x: 100, y: 80, width: 900, height: 640, maximized: false }, [primary], primary)).toEqual({ bounds: { x: 100, y: 80, width: 900, height: 640 }, maximized: false });
    expect(restoreWindowBounds({ x: -1200, y: 300, width: 1000, height: 700, maximized: true }, [primary, secondary], primary)).toEqual({ bounds: { x: -1200, y: 300, width: 1000, height: 700 }, maximized: true });
  });
  it('centres a default-size window on the primary display when the title bar would be unreachable', () => {
    const centred = { bounds: { x: 440, y: 160, width: 1040, height: 720 }, maximized: false };
    expect(restoreWindowBounds({ x: 60000, y: 60000, width: 1200, height: 800, maximized: false }, [primary], primary)).toEqual(centred);
    // Disconnected monitor: only a 100px sliver of the title bar would remain visible.
    expect(restoreWindowBounds({ x: -1100, y: 100, width: 1200, height: 800, maximized: false }, [primary], primary)).toEqual(centred);
    // Title bar above the work area even though the window body overlaps it.
    expect(restoreWindowBounds({ x: 100, y: -500, width: 1200, height: 800, maximized: false }, [primary], primary)).toEqual(centred);
    expect(restoreWindowBounds(undefined, [primary], primary)).toEqual(centred);
  });
  it('clamps oversize windows to the hosting work area and never below the minimum size', () => {
    expect(restoreWindowBounds({ x: 0, y: 0, width: 4000, height: 3000, maximized: false }, [primary], primary).bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
    expect(restoreWindowBounds({ x: 0, y: 0, width: 300, height: 200, maximized: false }, [primary], primary).bounds).toEqual({ x: 0, y: 0, width: 720, height: 520 });
    const small = { x: 0, y: 0, width: 800, height: 600 };
    expect(restoreWindowBounds(undefined, [small], small).bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
  it('removes the measured frameless drift before saving so relaunches do not creep', () => {
    const drift = measureDrift({ x: 0, y: 0, width: 1040, height: 720 }, { x: 0, y: 0, width: 1043, height: 723 });
    expect(drift).toEqual({ width: 3, height: 3 });
    expect(boundsToSave({ x: 5, y: 6, width: 1043, height: 723 }, drift, false)).toEqual({ x: 5, y: 6, width: 1040, height: 720, maximized: false });
    expect(measureDrift({ x: 0, y: 0, width: 900, height: 640 }, { x: 0, y: 0, width: 880, height: 700 })).toEqual({ width: 0, height: 8 });
  });
});

describe('preference file', () => {
  it('round-trips atomically, leaves no temporary file and survives corruption', () => {
    const root = mkdtempSync(join(tmpdir(), 'danesh-prefs-'));
    try {
      expect(loadPreferences(root)).toEqual({ version: 1, theme: 'system' });
      savePreferences(root, { version: 1, theme: 'dark', window: { x: 1, y: 2, width: 900, height: 640, maximized: false } });
      savePreferences(root, { version: 1, theme: 'light' });
      expect(loadPreferences(root)).toEqual({ version: 1, theme: 'light' });
      expect(readdirSync(root)).toEqual([PREFERENCES_FILE]);
      expect(JSON.parse(readFileSync(join(root, PREFERENCES_FILE), 'utf8'))).toEqual({ version: 1, theme: 'light' });
      writeFileSync(join(root, PREFERENCES_FILE), Buffer.alloc(10_000, 0x7b));
      expect(loadPreferences(root)).toEqual({ version: 1, theme: 'system' });
      expect(() => savePreferences(root, { version: 1, theme: 'neon' } as never)).toThrow();
      expect(readdirSync(root)).toEqual([PREFERENCES_FILE]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
