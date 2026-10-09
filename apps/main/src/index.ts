import { app, BrowserWindow, ipcMain, Menu, MessageChannelMain, nativeTheme, screen, utilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { CoreToMainSchema } from '@danesh/contracts/control.ts';
import { registerAppScheme, registerAppProtocol } from './protocol.ts';
import { spawnHost, killHosts } from './hosts.ts';
import { registerShellIpc, sendShellEvent } from './shell-ipc.ts';
import { installAppMenu } from './menu.ts';
import { loadPreferences, savePreferences, restoreWindowBounds, measureDrift, boundsToSave, MIN_WINDOW } from './preferences.ts';
import { applyTheme, chromeWindowOptions, performWindowAction, readWindowState, trackWindowState, WINDOW_BACKGROUND } from './window-chrome.ts';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import { type, release } from 'node:os';

registerAppScheme();
const userDataArg = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
const libraryRoot = userDataArg?.slice('--user-data-dir='.length) ?? (process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Danesh') : app.getPath('userData'));
mkdirSync(libraryRoot, { recursive: true });
app.setPath('userData', libraryRoot);
let core: Electron.UtilityProcess | undefined;
let preferences = loadPreferences(libraryRoot);
const persistPreferences = () => { try { savePreferences(libraryRoot, preferences); } catch (error: unknown) { console.error('Could not save UI preferences', error); } };

void app.whenReady().then(() => {
  registerAppProtocol(join(import.meta.dirname, '../renderer'));
  let theme = applyTheme(preferences.theme);
  const placement = restoreWindowBounds(preferences.window, screen.getAllDisplays().map((display) => display.workArea), screen.getPrimaryDisplay().workArea);
  const window = new BrowserWindow({ ...placement.bounds, minWidth: MIN_WINDOW.width, minHeight: MIN_WINDOW.height, ...chromeWindowOptions(process.platform, theme.dark), show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, preload: join(import.meta.dirname, '../preload/index.cjs') } });
  const drift = measureDrift(placement.bounds, window.getBounds());
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const isAllowed = (address: string): boolean => {
    try { const url = new URL(address); return devUrl ? url.origin === new URL(devUrl).origin : url.protocol === 'app:' && url.hostname === 'danesh' && !url.port && !url.username && !url.password; }
    catch { return false; }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, address) => { if (!isAllowed(address)) event.preventDefault(); });
  window.once('ready-to-show', () => { if (placement.maximized) window.maximize(); window.show(); });
  const setTheme = (value: ThemePreference) => {
    if (preferences.theme !== value) { preferences = { ...preferences, theme: value }; persistPreferences(); }
    theme = applyTheme(value);
    // nativeTheme only emits 'updated' when the effective scheme changes, so always resync the menu and renderer.
    installMenu(); sendShellEvent(window, 'shell.theme', theme);
    return theme;
  };
  const installMenu = () => installAppMenu((topic, payload) => sendShellEvent(window, topic, payload), preferences.theme, setTheme);
  installMenu();
  nativeTheme.on('updated', () => {
    theme = { theme: preferences.theme, dark: nativeTheme.shouldUseDarkColors };
    if (window.isDestroyed()) return;
    window.setBackgroundColor(theme.dark ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light);
    installMenu(); sendShellEvent(window, 'shell.theme', theme);
  });
  trackWindowState(window, (state) => sendShellEvent(window, 'shell.windowState', state));
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const rememberBounds = () => {
    clearTimeout(boundsTimer); boundsTimer = undefined;
    if (window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return;
    preferences = { ...preferences, window: boundsToSave(window.getNormalBounds(), drift, window.isMaximized()) }; persistPreferences();
  };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) window.on(event as 'resize', () => { clearTimeout(boundsTimer); boundsTimer = setTimeout(rememberBounds, 400); });
  window.on('close', rememberBounds);
  let coreState: 'starting' | 'ready' | 'unreachable' = 'starting';
  const publishCoreState = () => sendShellEvent(window, 'shell.coreState', { state: coreState });
  core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), [], { serviceName: 'Danesh Core', stdio: ['ignore', 'pipe', 'pipe'] });
  const child = core;
  child.on('exit', () => { coreState = 'unreachable'; if (!window.isDestroyed()) publishCoreState(); });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  const exportTargets = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  registerShellIpc(window, {
    registerTarget: (token, path) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { exportTargets.delete(token); reject(new Error('Core unavailable')); }, 5000);
      exportTargets.set(token, { resolve, reject, timer }); child.postMessage({ type: 'export-target', token, path });
    }),
    windowAction: (action) => performWindowAction(window, action),
    windowState: () => readWindowState(window),
    getTheme: () => theme,
    setTheme,
    showAppMenu: (x, y) => { const zoom = window.webContents.getZoomFactor(); Menu.getApplicationMenu()?.popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom) }); },
  }, devUrl);
  let coreReady = false;
  let hello = false;
  let connected = false;
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) { connected = false; hello = false; }
  });
  const connect = () => {
    if (!coreReady || !hello || connected || window.isDestroyed()) return;
    connected = true;
    const { port1, port2 } = new MessageChannelMain();
    child.postMessage({ type: 'renderer-port' }, [port2]);
    window.webContents.postMessage('danesh:port', null, [port1]);
  };
  ipcMain.on('danesh:hello', (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAllowed(event.senderFrame.url)) return;
    hello = true; publishCoreState(); connect();
  });
  child.on('message', (message: unknown) => {
    const parsed = CoreToMainSchema.safeParse(message);
    if (!parsed.success) { console.error('Invalid Core control message'); return; }
    if (parsed.data.type === 'ready') { coreReady = true; coreState = 'ready'; publishCoreState(); connect(); }
    else if (parsed.data.type === 'export-target-ready') { const target = exportTargets.get(parsed.data.token); if (target) { clearTimeout(target.timer); exportTargets.delete(parsed.data.token); target.resolve(); } }
    else spawnHost(parsed.data.kind, child);
  });
  const initialize = () => child.postMessage({ type: 'init', libraryRoot: app.getPath('userData'), appVersion: app.getVersion(), electronVersion: process.versions.electron, platform: process.platform, arch: process.arch, mainPid: process.pid, exePath: app.getPath('exe'), locale: app.getSystemLocale(), osName: type(), osVersion: release() });
  if (__TEST_HOOKS__) {
    const delay = Number(process.argv.find((arg) => arg.startsWith('--test-core-ready-delay='))?.split('=')[1] ?? 0);
    if (!Number.isInteger(delay) || delay < 0 || delay > 60000) throw new Error('Invalid test readiness delay');
    if (delay) setTimeout(initialize, delay); else initialize();
  } else initialize();
  void window.loadURL(devUrl ?? 'app://danesh/index.html').catch((error: unknown) => { console.error(error); app.exit(1); });
}).catch((error: unknown) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { killHosts(); core?.kill(); });
