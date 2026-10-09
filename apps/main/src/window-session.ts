import { effectiveTheme, type ThemePreference } from '@danesh/contracts/preferences.ts';
import type { ThemeState } from '@danesh/contracts/shell.ts';
import { type BrowserWindow, nativeTheme, screen } from 'electron';
import { installAppMenu } from './menu.ts';
import { matchShortcut, nextZoomLevel } from './policy/shortcuts.ts';
import {
  boundsToSave,
  measureDrift,
  type PreferenceStore,
  restoreWindowBounds,
} from './preferences.ts';
import { sendShellEvent } from './shell-ipc.ts';
import { applyTheme, trackWindowState, WINDOW_BACKGROUND } from './window-chrome.ts';

const BOUNDS_SAVE_DELAY_MS = 400;

/** Where the first window goes: the saved bounds if still reachable, otherwise centered on the primary display. */
export function initialPlacement(preferences: PreferenceStore) {
  return restoreWindowBounds(
    preferences.get().window,
    screen.getAllDisplays().map((display) => display.workArea),
    screen.getPrimaryDisplay().workArea,
  );
}

/**
 * Window behavior owned by Main: theme (preference, OS changes, menu), saved bounds, window-state events and the
 * keyboard shortcuts the frameless window loses with its menu bar. A headless smoke run saves nothing.
 */
export function installWindowSession({
  window,
  preferences,
  placement,
  initialTheme,
  headless,
}: {
  window: BrowserWindow;
  preferences: PreferenceStore;
  placement: ReturnType<typeof initialPlacement>;
  initialTheme: ThemeState;
  headless: boolean;
}) {
  const send = (topic: string, payload: unknown) => sendShellEvent(window, topic, payload);
  let theme = initialTheme;

  const refreshMenu = () => installAppMenu(send, effectiveTheme(preferences.get()), setTheme);
  function setTheme(value: ThemePreference) {
    if (preferences.get().theme !== value) preferences.update({ theme: value });
    theme = applyTheme(value);
    // nativeTheme only emits 'updated' when the effective scheme changes, so always resync the menu and renderer.
    refreshMenu();
    send('shell.theme', theme);
    return theme;
  }
  refreshMenu();
  nativeTheme.on('updated', () => {
    theme = { theme: effectiveTheme(preferences.get()), dark: nativeTheme.shouldUseDarkColors };
    if (window.isDestroyed()) return;
    window.setBackgroundColor(theme.dark ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light);
    refreshMenu();
    send('shell.theme', theme);
  });

  trackWindowState(window, (state) => send('shell.windowState', state));
  window.webContents.on('before-input-event', (event, input) => {
    const action = matchShortcut(input, process.platform);
    if (!action) return;
    event.preventDefault();
    if ('navigate' in action) send('shell.navigate', { route: action.navigate });
    else {
      const level = nextZoomLevel(window.webContents.getZoomLevel(), action.zoom);
      window.webContents.setZoomLevel(level);
    }
  });

  if (!headless) {
    window.once('ready-to-show', () => {
      if (placement.maximized) window.maximize();
      window.show();
    });
    const drift = measureDrift(placement.bounds, window.getBounds());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveBounds = () => {
      clearTimeout(timer);
      if (window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return;
      preferences.update({
        window: boundsToSave(window.getNormalBounds(), drift, window.isMaximized()),
      });
    };
    for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) {
      window.on(event as 'resize', () => {
        clearTimeout(timer);
        timer = setTimeout(saveBounds, BOUNDS_SAVE_DELAY_MS);
      });
    }
    window.on('close', saveBounds);
  }
  return { getTheme: () => theme, setTheme };
}
