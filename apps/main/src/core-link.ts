import { release, type } from 'node:os';
import { join } from 'node:path';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, ipcMain, MessageChannelMain, utilityProcess } from 'electron';
import { handleCoreControl } from './control.ts';
import { createHosts } from './hosts.ts';
import { isAppOrigin } from './policy/web-preferences.ts';
import { sendShellEvent } from './shell-ipc.ts';

type CoreState = 'starting' | 'ready' | 'unreachable';
const EXPORT_TARGET_TIMEOUT_MS = 5000;

/** Test builds can delay Core's init to exercise the "still preparing" start-up state. */
function testReadinessDelayMs(): number {
  const raw = process.argv.find((arg) => arg.startsWith('--test-core-ready-delay='));
  const delay = Number(raw?.split('=')[1] ?? 0);
  if (!Number.isInteger(delay) || delay < 0 || delay > 60_000) {
    throw new Error('Invalid test readiness delay');
  }
  return delay;
}

/**
 * Main's side of the Core utilityProcess: forks it, tells the window its state, issues single-use export targets,
 * brokers the private renderer port once both sides are ready, and relays host spawn/stop requests.
 */
export function startCore({
  window,
  logger,
  devUrl,
  onRendererConnected,
}: {
  window: Electron.BrowserWindow;
  logger: Pick<JsonlLogger, 'log'>;
  devUrl: string | undefined;
  /** Called once per page load, right after the private port has been handed to the renderer. */
  onRendererConnected: () => void;
}) {
  let state: CoreState = 'starting';
  const publishState = () => sendShellEvent(window, 'shell.coreState', { state });
  const core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), [], {
    serviceName: 'Danesh Core',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  core.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  core.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  const hosts = createHosts(core, logger);
  core.on('exit', (exitCode) => {
    logger.log('core.exit', { exitCode });
    state = 'unreachable';
    if (!window.isDestroyed()) publishState();
  });

  // Export targets and import sources: Core must acknowledge a path before the renderer is given its token.
  const pendingTargets = new Map<
    string,
    { resolve: () => void; timer: ReturnType<typeof setTimeout> }
  >();
  const awaitAck = (token: string, send: () => void) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingTargets.delete(token);
        reject(new Error('Core unavailable'));
      }, EXPORT_TARGET_TIMEOUT_MS);
      pendingTargets.set(token, { resolve, timer });
      send();
    });
  const registerTarget = (token: string, path: string, ttlMs?: number) =>
    awaitAck(token, () =>
      core.postMessage({ type: 'export-target', token, path, ...(ttlMs ? { ttlMs } : {}) }),
    );
  const registerSource = (token: string, path: string, fileName: string) =>
    awaitAck(token, () => core.postMessage({ type: 'import-source', token, path, fileName }));
  const acknowledge = (token: string) => {
    const target = pendingTargets.get(token);
    if (!target) return;
    clearTimeout(target.timer);
    pendingTargets.delete(token);
    target.resolve();
  };

  // The private port is handed over when Core is ready AND the current page has said hello (once per page load).
  let coreReady = false;
  let pageReady = false;
  let connected = false;
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) connected = pageReady = false;
  });
  const connect = () => {
    if (!coreReady || !pageReady || connected || window.isDestroyed()) return;
    connected = true;
    const { port1, port2 } = new MessageChannelMain();
    core.postMessage({ type: 'renderer-port' }, [port2]);
    window.webContents.postMessage('danesh:port', null, [port1]);
    onRendererConnected();
  };
  ipcMain.on('danesh:hello', (event) => {
    const trusted =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppOrigin(event.senderFrame.url, devUrl);
    if (!trusted) {
      const rejection = { schema: 'hello', sender: 'renderer', errorClass: 'UntrustedSender' };
      logger.log('rpc.rejected', rejection, 'warn');
      return;
    }
    pageReady = true;
    publishState();
    connect();
  });

  core.on('message', (message: unknown) =>
    handleCoreControl(
      message,
      {
        ready: () => {
          coreReady = true;
          state = 'ready';
          publishState();
          connect();
        },
        exportTargetReady: acknowledge,
        importSourceReady: acknowledge,
        spawnHost: hosts.spawnHost,
        stopHost: hosts.stopHost,
        killHost: hosts.killUnexpected,
      },
      logger,
    ),
  );

  const init = () =>
    core.postMessage({
      type: 'init',
      libraryRoot: app.getPath('userData'),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      mainPid: process.pid,
      exePath: app.getPath('exe'),
      locale: app.getSystemLocale(),
      osName: type(),
      osVersion: release(),
      packaged: app.isPackaged,
      // Packaging-probe assets: resources/probes when packaged, the repository copy (pnpm probes:fetch) in development.
      probesDir: app.isPackaged
        ? join(process.resourcesPath, 'probes')
        : join(app.getAppPath(), '..', '..', 'resources', 'probes'),
    });
  const delay = __TEST_HOOKS__ ? testReadinessDelayMs() : 0;
  if (delay) setTimeout(init, delay);
  else init();

  return {
    registerTarget,
    registerSource,
    stop: () => {
      hosts.stop();
      logger.log('core.stop-requested', { kind: 'core' });
      core.kill();
    },
  };
}
