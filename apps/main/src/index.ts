import { app, BrowserWindow, ipcMain, MessageChannelMain, utilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { CoreToMainSchema } from '@danesh/contracts/control.ts';
import { registerAppScheme, registerAppProtocol } from './protocol.ts';
import { spawnHost, killHosts } from './hosts.ts';
import { registerShellIpc, sendShellEvent } from './shell-ipc.ts';
import { installAppMenu } from './menu.ts';
import { type, release } from 'node:os';

registerAppScheme();
const userDataArg = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
const libraryRoot = userDataArg?.slice('--user-data-dir='.length) ?? (process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Danesh') : app.getPath('userData'));
mkdirSync(libraryRoot, { recursive: true });
app.setPath('userData', libraryRoot);
let core: Electron.UtilityProcess | undefined;

void app.whenReady().then(() => {
  registerAppProtocol(join(import.meta.dirname, '../renderer'));
  const window = new BrowserWindow({ width: 1040, height: 720, minWidth: 720, minHeight: 520, backgroundColor: '#FAF8F4', show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, preload: join(import.meta.dirname, '../preload/index.cjs') } });
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const isAllowed = (address: string): boolean => {
    try { const url = new URL(address); return devUrl ? url.origin === new URL(devUrl).origin : url.protocol === 'app:' && url.hostname === 'danesh' && !url.port && !url.username && !url.password; }
    catch { return false; }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, address) => { if (!isAllowed(address)) event.preventDefault(); });
  window.once('ready-to-show', () => window.show());
  installAppMenu((topic, payload) => sendShellEvent(window, topic, payload));
  let coreState: 'starting' | 'ready' | 'unreachable' = 'starting';
  const publishCoreState = () => sendShellEvent(window, 'shell.coreState', { state: coreState });
  core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), [], { serviceName: 'Danesh Core', stdio: ['ignore', 'pipe', 'pipe'] });
  const child = core;
  child.on('exit', () => { coreState = 'unreachable'; if (!window.isDestroyed()) publishCoreState(); });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  const exportTargets = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  registerShellIpc(window, (token, path) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { exportTargets.delete(token); reject(new Error('Core unavailable')); }, 5000);
    exportTargets.set(token, { resolve, reject, timer }); child.postMessage({ type: 'export-target', token, path });
  }), devUrl);
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
