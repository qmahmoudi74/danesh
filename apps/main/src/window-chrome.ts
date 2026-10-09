import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import type { ThemeState, WindowAction, WindowState } from '@danesh/contracts/shell.ts';
import { type BrowserWindow, nativeTheme } from 'electron';

export { chromeWindowOptions, WINDOW_BACKGROUND } from './policy/window-options.ts';

export function readWindowState(window: BrowserWindow): WindowState {
  return {
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    focused: window.isFocused(),
  };
}

export function trackWindowState(
  window: BrowserWindow,
  publish: (state: WindowState) => void,
): void {
  const update = () => {
    if (!window.isDestroyed()) publish(readWindowState(window));
  };
  for (const event of [
    'maximize',
    'unmaximize',
    'restore',
    'enter-full-screen',
    'leave-full-screen',
    'focus',
    'blur',
  ] as const)
    window.on(event as 'focus', update);
}

export function performWindowAction(window: BrowserWindow, action: WindowAction): void {
  if (action === 'minimize') window.minimize();
  else if (action === 'toggleMaximize') {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else window.close();
}

/** Electron drives the renderer's prefers-color-scheme from themeSource, so CSS is correct from the first frame. */
export function applyTheme(theme: ThemePreference): ThemeState {
  nativeTheme.themeSource = theme;
  return { theme, dark: nativeTheme.shouldUseDarkColors };
}
