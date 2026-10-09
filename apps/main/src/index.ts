import { app, ipcMain, Menu, MessageChannelMain, nativeTheme, screen, utilityProcess } from 'electron';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { type, release } from 'node:os';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import { createJsonlLogger } from '@danesh/logging/jsonl.ts';
import { registerAppScheme, registerAppProtocol } from './protocol.ts';
import { spawnHost, killHosts } from './hosts.ts';
import { registerShellIpc, sendShellEvent } from './shell-ipc.ts';
import { installAppMenu } from './menu.ts';
import { loadPreferences, savePreferences, restoreWindowBounds, measureDrift, boundsToSave } from './preferences.ts';
import { applyTheme, performWindowAction, readWindowState, trackWindowState, WINDOW_BACKGROUND } from './window-chrome.ts';
import { matchShortcut, nextZoomLevel } from './policy/shortcuts.ts';
import { isAllowedNavigation } from './policy/web-preferences.ts';
import { resolveUserDataPath, userDataSwitch } from './user-data.ts';
import { createMainWindow } from './window.ts';
import { installChromiumEgressBlock, getChromiumBlockedCount } from './egress-l1.ts';
import { handleCoreControl } from './control.ts';
import { TEST_HOOKS_SENTINEL } from '@danesh/contracts/test-rpc.ts';
import { parseSmokeArgs, SMOKE_EXIT, SMOKE_TIMEOUT_MS, type SmokeArgs } from './smoke-mode.ts';

// 0. Headless smoke mode refuses bad arguments before any window, Core or library folder exists.
const smoke = parseSmokeArgs(process.argv, [process.resourcesPath, app.getAppPath(), dirname(app.getPath('exe'))]);
if (smoke && 'error' in smoke) {
  process.stderr.write(`danesh --smoke-test: ${smoke.error}\n`);
  app.exit(SMOKE_EXIT.invalidArguments);
} else {
  // 1. The library location is final before anything else touches userData (D-13).
  const libraryRoot = resolveUserDataPath({ platform: process.platform, localAppData: process.env.LOCALAPPDATA, userDataDirSwitch: userDataSwitch(process.argv), defaultUserData: app.getPath('userData') });
  mkdirSync(libraryRoot, { recursive: true });
  app.setPath('userData', libraryRoot);
  app.setPath('sessionData', libraryRoot);
  // 2. One instance per library: a second launch focuses the first window and exits without starting another Core.
  if (!app.requestSingleInstanceLock()) app.quit();
  else start(libraryRoot, smoke);
}

function start(libraryRoot: string, smoke: Extract<SmokeArgs, { outPath: string }> | null): void {
  const logger = createJsonlLogger({ dir: join(libraryRoot, 'logs'), name: 'main' });
  if (__TEST_HOOKS__) Object.assign(globalThis, { __daneshChromiumBlocked: getChromiumBlockedCount, __daneshTestBuild: TEST_HOOKS_SENTINEL });
  registerAppScheme();
  let core: Electron.UtilityProcess | undefined;
  let preferences = loadPreferences(libraryRoot);
  const persistPreferences = () => { try { savePreferences(libraryRoot, preferences); } catch { logger.log('preferences.save-failed', {}, 'error'); } };
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;

  void app.whenReady().then(() => {
    installChromiumEgressBlock(logger, devUrl);
    registerAppProtocol(join(import.meta.dirname, '../renderer'));
    let theme = applyTheme(preferences.theme);
    const placement = restoreWindowBounds(preferences.window, screen.getAllDisplays().map((display) => display.workArea), screen.getPrimaryDisplay().workArea);
    const window = createMainWindow({ preload: join(import.meta.dirname, '../preload/index.cjs'), devUrl, bounds: placement.bounds, dark: theme.dark, headless: !!smoke });
    const drift = measureDrift(placement.bounds, window.getBounds());
    app.on('second-instance', () => { if (window.isDestroyed()) return; if (window.isMinimized()) window.restore(); window.show(); window.focus(); });
    // A smoke run never shows its window.
    if (!smoke) window.once('ready-to-show', () => { if (placement.maximized) window.maximize(); window.show(); });
    let smokeStarted = false;
    if (smoke) setTimeout(() => { logger.log('smoke.timeout', { durationMs: SMOKE_TIMEOUT_MS }, 'error'); app.exit(SMOKE_EXIT.timeout); }, SMOKE_TIMEOUT_MS).unref();

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
    window.webContents.on('before-input-event', (event, input) => {
      const action = matchShortcut(input, process.platform);
      if (!action) return;
      event.preventDefault();
      if ('navigate' in action) sendShellEvent(window, 'shell.navigate', { route: action.navigate });
      else window.webContents.setZoomLevel(nextZoomLevel(window.webContents.getZoomLevel(), action.zoom));
    });
    let boundsTimer: ReturnType<typeof setTimeout> | undefined;
    const rememberBounds = () => {
      clearTimeout(boundsTimer); boundsTimer = undefined;
      if (smoke || window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return;
      preferences = { ...preferences, window: boundsToSave(window.getNormalBounds(), drift, window.isMaximized()) }; persistPreferences();
    };
    for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) window.on(event as 'resize', () => { clearTimeout(boundsTimer); boundsTimer = setTimeout(rememberBounds, 400); });
    window.on('close', rememberBounds);

    let coreState: 'starting' | 'ready' | 'unreachable' = 'starting';
    const publishCoreState = () => sendShellEvent(window, 'shell.coreState', { state: coreState });
    core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), [], { serviceName: 'Danesh Core', stdio: ['ignore', 'pipe', 'pipe'] });
    const child = core;
    child.on('exit', (exitCode) => { logger.log('core.exit', { exitCode }); coreState = 'unreachable'; if (!window.isDestroyed()) publishCoreState(); });
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    const exportTargets = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const registerTarget = (token: string, path: string, ttlMs?: number) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { exportTargets.delete(token); reject(new Error('Core unavailable')); }, 5000);
      exportTargets.set(token, { resolve, reject, timer }); child.postMessage({ type: 'export-target', token, path, ...(ttlMs ? { ttlMs } : {}) });
    });
    registerShellIpc(window, {
      registerTarget,
      windowAction: (action) => performWindowAction(window, action),
      windowState: () => readWindowState(window),
      getTheme: () => theme,
      setTheme,
      smokeDone: (overall) => {
        if (!smoke) return false;
        logger.log('smoke.done', { code: overall });
        setImmediate(() => app.exit(overall === 'pass' ? SMOKE_EXIT.pass : SMOKE_EXIT.fail));
        return true;
      },
      showAppMenu: (x, y) => { const zoom = window.webContents.getZoomFactor(); Menu.getApplicationMenu()?.popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom) }); },
    }, logger, devUrl);

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
      if (smoke && !smokeStarted) {
        smokeStarted = true;
        const token = randomUUID();
        // The smoke token must outlive a slow first run, so it lives as long as the smoke timeout.
        void registerTarget(token, smoke.outPath, SMOKE_TIMEOUT_MS).then(() => sendShellEvent(window, 'shell.smokeRun', { token })).catch(() => { logger.log('smoke.target-failed', {}, 'error'); app.exit(SMOKE_EXIT.fail); });
      }
    };
    ipcMain.on('danesh:hello', (event) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAllowedNavigation(event.senderFrame.url, devUrl)) {
        logger.log('rpc.rejected', { schema: 'hello', sender: 'renderer', errorClass: 'UntrustedSender' }, 'warn');
        return;
      }
      hello = true; publishCoreState(); connect();
    });
    child.on('message', (message: unknown) => handleCoreControl(message, {
      ready: () => { coreReady = true; coreState = 'ready'; publishCoreState(); connect(); },
      exportTargetReady: (token) => { const target = exportTargets.get(token); if (target) { clearTimeout(target.timer); exportTargets.delete(token); target.resolve(); } },
      spawnHost: (kind) => spawnHost(kind, child),
    }, logger));
    const initialize = () => child.postMessage({ type: 'init', libraryRoot: app.getPath('userData'), appVersion: app.getVersion(), electronVersion: process.versions.electron, platform: process.platform, arch: process.arch, mainPid: process.pid, exePath: app.getPath('exe'), locale: app.getSystemLocale(), osName: type(), osVersion: release(), packaged: app.isPackaged });
    if (__TEST_HOOKS__) {
      const delay = Number(process.argv.find((arg) => arg.startsWith('--test-core-ready-delay='))?.split('=')[1] ?? 0);
      if (!Number.isInteger(delay) || delay < 0 || delay > 60000) throw new Error('Invalid test readiness delay');
      if (delay) setTimeout(initialize, delay); else initialize();
    } else initialize();
    void window.loadURL(devUrl ?? 'app://danesh/index.html').catch(() => { logger.log('window.load-failed', {}, 'error'); app.exit(1); });
  }).catch(() => { logger.log('main.start-failed', {}, 'error'); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { killHosts(); core?.kill(); logger.close(); });
}
