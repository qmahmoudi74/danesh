import { BrowserWindow } from 'electron';
import { chromeWindowOptions } from './policy/window-options.ts';
import { isAllowedNavigation, secureWebPreferences } from './policy/web-preferences.ts';
import { MIN_WINDOW, type Rect } from './preferences.ts';
export { secureWebPreferences } from './policy/web-preferences.ts';

/**
 * The only way Danesh creates a window: secure preferences, frameless chrome, and navigation, redirects, popups and
 * webviews locked to the app origin. The CSP arrives with every app:// response, including reloads (protocol.ts).
 */
export function createMainWindow({ preload, devUrl, bounds, dark }: { preload: string; devUrl: string | undefined; bounds: Rect; dark: boolean }): BrowserWindow {
  const window = new BrowserWindow({ ...bounds, minWidth: MIN_WINDOW.width, minHeight: MIN_WINDOW.height, ...chromeWindowOptions(process.platform, dark), show: false, webPreferences: secureWebPreferences(preload) });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, address) => { if (!isAllowedNavigation(address, devUrl)) event.preventDefault(); });
  contents.on('will-redirect', (event, address) => { if (!isAllowedNavigation(address, devUrl)) event.preventDefault(); });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  return window;
}
