import type { BrowserWindowConstructorOptions } from 'electron';

/** Must equal --color-surface in apps/renderer/src/styles/tokens.css (asserted by apps/main/test/window-options.test.ts). */
export const WINDOW_BACKGROUND = { light: '#FAF8F4', dark: '#1C1B19' } as const;

/** Frameless on every platform through Electron's supported API; macOS keeps its native traffic lights. */
export function chromeWindowOptions(
  platform: NodeJS.Platform,
  dark: boolean,
): BrowserWindowConstructorOptions {
  return {
    titleBarStyle: 'hidden',
    backgroundColor: dark ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light,
    // Vertically centres the 12px traffic lights in the 32px title bar.
    ...(platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 10 } } : {}),
  };
}
