import type { Route } from '@danesh/contracts/shell.ts';

export type ShortcutAction = { navigate: Route } | { zoom: 'in' | 'out' | 'reset' };
export type KeyInput = { type: string; code: string; control: boolean; meta: boolean; alt: boolean; shift: boolean };

const navigation: Record<string, Route> = { Digit1: '#/', Numpad1: '#/', Digit2: '#/system-check', Numpad2: '#/system-check', Comma: '#/settings' };
const zoom: Record<string, 'in' | 'out' | 'reset'> = { Equal: 'in', NumpadAdd: 'in', Minus: 'out', NumpadSubtract: 'out', Digit0: 'reset', Numpad0: 'reset' };

/**
 * Windows and Linux lose menu-bar accelerators once the OS frame is hidden, so Main matches the same shortcuts on
 * physical key codes: they keep working under a Persian layout, where the key value of Ctrl+2 is «۲». macOS keeps
 * its global menu bar and native accelerators.
 */
export function matchShortcut(input: KeyInput, platform: NodeJS.Platform): ShortcutAction | undefined {
  if (platform === 'darwin' || input.type !== 'keyDown' || !input.control || input.meta || input.alt) return undefined;
  if (Object.hasOwn(zoom, input.code)) return { zoom: zoom[input.code]! };
  if (!input.shift && Object.hasOwn(navigation, input.code)) return { navigate: navigation[input.code]! };
  return undefined;
}

/** Chromium's zoom roles step by half a level; the bounds keep text legible and the layout usable. */
export function nextZoomLevel(current: number, step: 'in' | 'out' | 'reset'): number {
  if (step === 'reset') return 0;
  return Math.min(5, Math.max(-3, current + (step === 'in' ? 0.5 : -0.5)));
}
