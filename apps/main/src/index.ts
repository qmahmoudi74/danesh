import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { effectiveTheme } from '@danesh/contracts/preferences.ts';
import { TEST_HOOKS_SENTINEL } from '@danesh/contracts/test-rpc.ts';
import { createJsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, powerSaveBlocker } from 'electron';
import { startCore } from './core-link.ts';
import { getChromiumBlockedCount, installChromiumEgressBlock } from './egress-l1.ts';
import { createPreferenceStore } from './preferences.ts';
import { registerAppProtocol, registerAppScheme } from './protocol.ts';
import { registerShellIpc, sendShellEvent } from './shell-ipc.ts';
import { parseSmokeArgs, SMOKE_EXIT, SMOKE_TIMEOUT_MS, type SmokeArgs } from './smoke-mode.ts';
import { resolveUserDataPath, userDataSwitch } from './user-data.ts';
import { createMainWindow, performWindowAction, readWindowState } from './window.ts';
import { applyTheme, initialPlacement, installWindowSession } from './window-session.ts';

type SmokeRun = Extract<SmokeArgs, { outPath: string }>;

// Headless smoke mode refuses bad arguments before any window, Core or library folder exists.
const smoke = parseSmokeArgs(process.argv, [
  process.resourcesPath,
  app.getAppPath(),
  dirname(app.getPath('exe')),
]);
if (smoke && 'error' in smoke) {
  process.stderr.write(`danesh --smoke-test: ${smoke.error}\n`);
  app.exit(SMOKE_EXIT.invalidArguments);
} else {
  // The library location is final before anything else touches userData (D-13).
  const libraryRoot = resolveUserDataPath({
    platform: process.platform,
    localAppData: process.env.LOCALAPPDATA,
    userDataDirSwitch: userDataSwitch(process.argv),
    defaultUserData: app.getPath('userData'),
  });
  mkdirSync(libraryRoot, { recursive: true });
  app.setPath('userData', libraryRoot);
  app.setPath('sessionData', libraryRoot);
  // One instance per library: a second launch focuses the first window and exits without starting another Core.
  if (!app.requestSingleInstanceLock()) app.quit();
  else start(libraryRoot, smoke);
}

function start(libraryRoot: string, smokeRun: SmokeRun | null): void {
  // Timer throttling and process priority are separate. Measure the hidden smoke renderer
  // with the same scheduling priority as a visible UI while the engine hosts compete for CPU.
  if (smokeRun) app.commandLine.appendSwitch('disable-renderer-backgrounding');
  const logger = createJsonlLogger({ dir: join(libraryRoot, 'logs'), name: 'main' });
  const preferences = createPreferenceStore(libraryRoot, () =>
    logger.log('preferences.save-failed', {}, 'error'),
  );
  const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  if (__TEST_HOOKS__) {
    Object.assign(globalThis, {
      __daneshChromiumBlocked: getChromiumBlockedCount,
      __daneshTestBuild: TEST_HOOKS_SENTINEL,
    });
  }
  registerAppScheme();

  let stopCore = () => {};
  app
    .whenReady()
    .then(() => {
      // macOS puts an app without a visible window into App Nap, which coalesces its timers; Chromium's throttling
      // switches cannot prevent that. A user's Danesh window is visible, so the headless run holds the activity a
      // visible app has (an NSProcessInfo activity), to measure the same scheduling. Thresholds are unchanged.
      if (smokeRun && process.platform === 'darwin')
        powerSaveBlocker.start('prevent-app-suspension');
      installChromiumEgressBlock(logger, devUrl);
      registerAppProtocol(join(import.meta.dirname, '../renderer'));

      // The theme and placement are decided before the window exists, so its first frame is already right.
      const initialTheme = applyTheme(effectiveTheme(preferences.get()));
      const placement = initialPlacement(preferences);
      const window = createMainWindow({
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        devUrl,
        bounds: placement.bounds,
        dark: initialTheme.dark,
        headless: !!smokeRun,
      });
      const session = installWindowSession({
        window,
        preferences,
        placement,
        initialTheme,
        headless: !!smokeRun,
      });
      app.on('second-instance', () => {
        if (window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });

      // Smoke mode: once the renderer is connected, hand it a token whose file Core is allowed to write, then wait.
      let smokeStarted = false;
      const startSmokeRun = (run: SmokeRun) => {
        if (smokeStarted) return;
        smokeStarted = true;
        const token = randomUUID();
        // The token must outlive a slow first run, so it lives as long as the smoke timeout.
        core
          .registerTarget(token, run.outPath, SMOKE_TIMEOUT_MS)
          .then(() => sendShellEvent(window, 'shell.smokeRun', { token }))
          .catch(() => {
            logger.log('smoke.target-failed', {}, 'error');
            app.exit(SMOKE_EXIT.fail);
          });
      };
      if (smokeRun) {
        setTimeout(() => {
          logger.log('smoke.timeout', { durationMs: SMOKE_TIMEOUT_MS }, 'error');
          app.exit(SMOKE_EXIT.timeout);
        }, SMOKE_TIMEOUT_MS).unref();
      }

      const core = startCore({
        window,
        logger,
        devUrl,
        onRendererConnected: () => smokeRun && startSmokeRun(smokeRun),
      });
      stopCore = core.stop;

      registerShellIpc(
        window,
        {
          registerTarget: core.registerTarget,
          registerSource: core.registerSource,
          windowAction: (action) => performWindowAction(window, action),
          windowState: () => readWindowState(window),
          getTheme: session.getTheme,
          setTheme: session.setTheme,
          smokeDone: (overall) => {
            if (!smokeRun) return false;
            logger.log('smoke.done', { code: overall });
            setImmediate(() => app.exit(overall === 'pass' ? SMOKE_EXIT.pass : SMOKE_EXIT.fail));
            return true;
          },
        },
        logger,
        devUrl,
      );

      window.loadURL(devUrl ?? 'app://danesh/index.html').catch(() => {
        logger.log('window.load-failed', {}, 'error');
        app.exit(1);
      });
    })
    .catch(() => {
      logger.log('main.start-failed', {}, 'error');
      app.exit(1);
    });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    stopCore();
    logger.close();
  });
}
