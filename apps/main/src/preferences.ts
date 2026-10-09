import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MAX_PREFERENCES_BYTES, UiPreferencesSchema, parseUiPreferences, type UiPreferences, type WindowBounds } from '@danesh/contracts/preferences.ts';

export const PREFERENCES_FILE = 'ui-preferences.json';
export const DEFAULT_WINDOW = { width: 1040, height: 720 } as const;
export const MIN_WINDOW = { width: 720, height: 520 } as const;
/** A window is restored where it was only if this much of its title bar lands on a display's work area. */
const VISIBLE_TITLE = { width: 160, height: 32 } as const;
export type Rect = { x: number; y: number; width: number; height: number };

export function loadPreferences(root: string): UiPreferences {
  let text: string | undefined;
  try {
    const bytes = readFileSync(join(root, PREFERENCES_FILE));
    text = bytes.byteLength <= MAX_PREFERENCES_BYTES ? bytes.toString('utf8') : undefined;
  } catch { text = undefined; }
  return parseUiPreferences(text);
}

/** Atomic replace: a crash mid-write leaves either the old file or the new one, never a torn file. */
export function savePreferences(root: string, preferences: UiPreferences): void {
  const json = JSON.stringify(UiPreferencesSchema.parse(preferences), null, 2) + '\n';
  const temporary = join(root, `.${PREFERENCES_FILE}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, json, { flag: 'wx', flush: true });
    renameSync(temporary, join(root, PREFERENCES_FILE));
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  return { width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) };
}

/** Pure placement rule for the first window: saved bounds if still reachable, otherwise centered on the primary work area. */
export function restoreWindowBounds(saved: WindowBounds | undefined, workAreas: Rect[], primary: Rect): { bounds: Rect; maximized: boolean } {
  if (saved) {
    const title: Rect = { x: saved.x, y: saved.y, width: saved.width, height: VISIBLE_TITLE.height };
    const host = workAreas.find((area) => { const shared = overlap(title, area); return shared.width >= VISIBLE_TITLE.width && shared.height >= VISIBLE_TITLE.height; });
    if (host) {
      const width = Math.max(MIN_WINDOW.width, Math.min(saved.width, host.width));
      const height = Math.max(MIN_WINDOW.height, Math.min(saved.height, host.height));
      return { bounds: { x: saved.x, y: saved.y, width, height }, maximized: saved.maximized };
    }
  }
  const width = Math.min(DEFAULT_WINDOW.width, primary.width);
  const height = Math.min(DEFAULT_WINDOW.height, primary.height);
  return {
    bounds: { x: primary.x + Math.round((primary.width - width) / 2), y: primary.y + Math.round((primary.height - height) / 2), width, height },
    maximized: saved?.maximized ?? false,
  };
}

/**
 * Frameless windows on Windows at fractional display scaling report bounds a few pixels larger than requested.
 * Main measures that drift once after creation and removes it before saving, so relaunches never creep.
 */
export function measureDrift(requested: Rect, actual: Rect): { width: number; height: number } {
  const clamp = (value: number) => Math.min(8, Math.max(0, value));
  return { width: clamp(actual.width - requested.width), height: clamp(actual.height - requested.height) };
}
export function boundsToSave(normal: Rect, drift: { width: number; height: number }, maximized: boolean): WindowBounds {
  return { x: normal.x, y: normal.y, width: normal.width - drift.width, height: normal.height - drift.height, maximized };
}
