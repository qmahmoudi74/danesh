import { randomUUID } from 'node:crypto';
import { basename, isAbsolute, join } from 'node:path';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import { shellEventPayloads, type WindowAction } from '@danesh/contracts/shell.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, type BrowserWindow, dialog, ipcMain } from 'electron';
import { dispatchShellRequest, ShellFailure } from './policy/shell-dispatch.ts';
import { isAppOrigin } from './policy/web-preferences.ts';

export function sendShellEvent(window: BrowserWindow, topic: string, payload: unknown): void {
  const parsed = shellEventPayloads[topic]?.safeParse(payload);
  if (!Object.hasOwn(shellEventPayloads, topic) || !parsed?.success)
    throw new Error('Invalid shell event');
  if (!window.isDestroyed())
    window.webContents.send('danesh:shell-event', { topic, payload: parsed.data });
}

export type ShellServices = {
  registerTarget: (token: string, path: string) => Promise<void>;
  registerSource: (token: string, path: string, fileName: string) => Promise<void>;
  windowAction: (action: WindowAction) => void;
  windowState: () => unknown;
  getTheme: () => unknown;
  setTheme: (theme: ThemePreference) => unknown;
  canRelaunch: () => boolean;
  /** Returns false outside smoke mode, where the method is unavailable. */
  smokeDone: (overall: 'pass' | 'fail') => boolean;
};

export function registerShellIpc(
  window: BrowserWindow,
  services: ShellServices,
  logger: Pick<JsonlLogger, 'log'>,
  devUrl?: string,
): void {
  let choosing = false;
  const chooseExportPath = async () => {
    if (choosing) throw new ShellFailure('UNAVAILABLE');
    choosing = true;
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const result = await dialog.showSaveDialog(window, {
        defaultPath: join(app.getPath('documents'), `danesh-system-check-${stamp}.json`),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      let token: string | null = null;
      if (!result.canceled && result.filePath) {
        if (!isAbsolute(result.filePath)) throw new ShellFailure('INVALID_INPUT');
        token = randomUUID();
        await services.registerTarget(token, result.filePath);
      }
      return { token };
    } finally {
      choosing = false;
    }
  };
  // The page learns only the file name and a single-use token; Core receives the path from Main.
  const choosePdf = async () => {
    if (choosing) throw new ShellFailure('UNAVAILABLE');
    choosing = true;
    try {
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      const path = result.canceled ? undefined : result.filePaths[0];
      if (!path) return { token: null };
      if (!isAbsolute(path)) throw new ShellFailure('INVALID_INPUT');
      const token = randomUUID();
      const fileName = basename(path).slice(0, 1000);
      await services.registerSource(token, path, fileName);
      return { token, fileName };
    } finally {
      choosing = false;
    }
  };
  const handlers = {
    'shell.relaunch': () => {
      if (!services.canRelaunch()) throw new ShellFailure('UNAVAILABLE');
      app.relaunch();
      app.exit(0);
      return {};
    },
    'shell.chooseExportPath': chooseExportPath,
    'shell.choosePdf': choosePdf,
    'shell.window': ({ action }: { action: WindowAction }) => {
      services.windowAction(action);
      return {};
    },
    'shell.windowState': () => services.windowState(),
    'shell.getTheme': () => services.getTheme(),
    'shell.setTheme': ({ theme }: { theme: ThemePreference }) => services.setTheme(theme),
    'shell.smokeDone': ({ overall }: { overall: 'pass' | 'fail' }) => {
      if (!services.smokeDone(overall)) throw new ShellFailure('UNAVAILABLE');
      return {};
    },
  };
  ipcMain.handle('danesh:shell', (event, value: unknown) => {
    const trusted =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAppOrigin(event.senderFrame.url, app.isPackaged ? undefined : devUrl);
    return dispatchShellRequest(trusted, value, handlers, (rejection) =>
      logger.log(
        'rpc.rejected',
        {
          schema: rejection.schema,
          sender: 'renderer-shell',
          errorClass: rejection.errorClass,
          byteLength: rejection.byteLength,
          code: rejection.code,
        },
        'warn',
      ),
    );
  });
}
