import { release, type } from 'node:os';
import { join } from 'node:path';
import type { CoreState } from '@danesh/contracts/shell.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, ipcMain, MessageChannelMain } from 'electron';
import { handleCoreControl } from './control.ts';
import { brokerHost, createHosts, hostEntries } from './hosts.ts';
import { isAppOrigin } from './policy/web-preferences.ts';
import { sendShellEvent } from './shell-ipc.ts';
import { createUtilitySupervisor } from './supervisor.ts';

const EXPORT_TARGET_TIMEOUT_MS = 5000;
const BOOT_FAILURE_WINDOW_MS = 60_000;
const MAX_BOOT_FAILURES = 3;

function testReadinessDelayMs(): number {
  const raw = process.argv.find((arg) => arg.startsWith('--test-core-ready-delay='));
  const delay = Number(raw?.split('=')[1] ?? 0);
  if (!Number.isInteger(delay) || delay < 0 || delay > 60_000)
    throw new Error('Invalid test readiness delay');
  return delay;
}

/** Main retains the window while one supervisor replaces Core and its private transports. */
export function startCore({
  window,
  logger,
  devUrl,
  onRendererConnected,
}: {
  window: Electron.BrowserWindow;
  logger: Pick<JsonlLogger, 'log'>;
  devUrl: string | undefined;
  onRendererConnected: () => void;
}) {
  let state: CoreState = { state: 'starting' };
  let core: Electron.UtilityProcess | undefined;
  let coreReady = false;
  let pageReady = false;
  let connected = false;
  let stopped = false;
  let initTimer: ReturnType<typeof setTimeout> | undefined;
  let bootFailures: number[] = [];
  const publishState = () => sendShellEvent(window, 'shell.coreState', state);
  const pendingTargets = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const rejectTargets = () => {
    for (const target of pendingTargets.values()) {
      clearTimeout(target.timer);
      target.reject(new Error('Core unavailable'));
    }
    pendingTargets.clear();
  };
  const acknowledge = (token: string) => {
    const target = pendingTargets.get(token);
    if (!target) return;
    clearTimeout(target.timer);
    pendingTargets.delete(token);
    target.resolve();
  };
  const awaitAck = (token: string, message: unknown) =>
    new Promise<void>((resolve, reject) => {
      if (!core || !coreReady || stopped) {
        reject(new Error('Core unavailable'));
        return;
      }
      const timer = setTimeout(() => {
        pendingTargets.delete(token);
        reject(new Error('Core unavailable'));
      }, EXPORT_TARGET_TIMEOUT_MS);
      pendingTargets.set(token, { resolve, reject, timer });
      core.postMessage(message);
    });
  const connect = () => {
    if (!core || !coreReady || !pageReady || connected || window.isDestroyed()) return;
    connected = true;
    const { port1, port2 } = new MessageChannelMain();
    core.postMessage({ type: 'renderer-port' }, [port2]);
    window.webContents.postMessage('danesh:port', null, [port1]);
    onRendererConnected();
  };
  const sendInit = (child: Electron.UtilityProcess) =>
    child.postMessage({
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
      probesDir: app.isPackaged
        ? join(process.resourcesPath, 'probes')
        : join(app.getAppPath(), '..', '..', 'resources', 'probes'),
    });
  const supervisor = createUtilitySupervisor({
    entries: { core: 'core.js', ...hostEntries },
    logger,
    onSpawn: (kind, child) => {
      if (kind !== 'core') {
        if (core) brokerHost(kind, child, core);
        return;
      }
      core = child;
      child.on('message', (message: unknown) => {
        if (stopped || core !== child) return;
        handleCoreControl(
          message,
          {
            ready: () => {
              coreReady = true;
              state = { state: 'ready' };
              // Deliver the replacement port before ready observers issue new calls.
              connect();
              publishState();
            },
            exportTargetReady: acknowledge,
            importSourceReady: acknowledge,
            spawnHost: hosts.spawnHost,
            stopHost: hosts.stopHost,
            killHost: hosts.killUnexpected,
          },
          logger,
        );
      });
      const delay = __TEST_HOOKS__ ? testReadinessDelayMs() : 0;
      if (delay) initTimer = setTimeout(() => sendInit(child), delay);
      else sendInit(child);
    },
  });
  const hosts = createHosts(supervisor, () => core);
  supervisor.subscribe((event) => {
    if (stopped || event.kind !== 'core' || event.type !== 'exited' || event.requested) return;
    const failedDuringBoot = !coreReady;
    core = undefined;
    coreReady = connected = false;
    if (initTimer) clearTimeout(initTimer);
    rejectTargets();
    hosts.stop();
    if (failedDuringBoot) {
      const now = Date.now();
      bootFailures = bootFailures.filter((time) => now - time <= BOOT_FAILURE_WINDOW_MS);
      bootFailures.push(now);
    }
    state =
      bootFailures.length >= MAX_BOOT_FAILURES
        ? { state: 'failed', logsDir: join(app.getPath('userData'), 'logs') }
        : { state: 'starting' };
    if (state.state === 'failed') supervisor.requestStop('core');
    if (!window.isDestroyed()) publishState();
  });
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) connected = pageReady = false;
  });
  ipcMain.on('danesh:hello', (event) => {
    const trusted =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppOrigin(event.senderFrame.url, devUrl);
    if (!trusted) {
      logger.log(
        'rpc.rejected',
        { schema: 'hello', sender: 'renderer', errorClass: 'UntrustedSender' },
        'warn',
      );
      return;
    }
    pageReady = true;
    connect();
    publishState();
  });
  void supervisor.spawn('core').catch(() => {
    state = { state: 'failed', logsDir: join(app.getPath('userData'), 'logs') };
    publishState();
  });
  return {
    registerTarget: (token: string, path: string, ttlMs?: number) =>
      awaitAck(token, { type: 'export-target', token, path, ...(ttlMs ? { ttlMs } : {}) }),
    registerSource: (token: string, path: string, fileName: string) =>
      awaitAck(token, { type: 'import-source', token, path, fileName }),
    canRelaunch: () => state.state === 'failed',
    stop: () => {
      stopped = true;
      core = undefined;
      if (initTimer) clearTimeout(initTimer);
      rejectTargets();
      supervisor.stopAll();
    },
  };
}
