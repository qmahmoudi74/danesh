import type { WindowAction, WindowState } from '@danesh/contracts/shell.ts';
import { BrowserWindow } from 'electron';
import { isAppOrigin, secureWebPreferences } from './policy/web-preferences.ts';
import { chromeWindowOptions } from './policy/window-options.ts';
import { MIN_WINDOW, type Rect } from './preferences.ts';

/**
 * The only way Danesh creates a window: secure preferences, frameless chrome, and navigation, redirects, popups and
 * webviews locked to the app origin. The CSP arrives with every app:// response, including reloads (protocol.ts).
 */
export function createMainWindow({
  preload,
  devUrl,
  bounds,
  dark,
  headless = false,
}: {
  preload: string;
  devUrl: string | undefined;
  bounds: Rect;
  dark: boolean;
  headless?: boolean;
}): BrowserWindow {
  // A hidden smoke-mode window must not be throttled, or the run would stall in the background.
  const webPreferences = {
    ...secureWebPreferences(preload),
    ...(headless ? { backgroundThrottling: false } : {}),
  };
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    ...chromeWindowOptions(process.platform, dark),
    show: false,
    webPreferences,
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, address) => {
    if (!isAppOrigin(address, devUrl)) event.preventDefault();
  });
  contents.on('will-redirect', (event, address) => {
    if (!isAppOrigin(address, devUrl)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  return window;
}

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
