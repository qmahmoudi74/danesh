import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import { shellEventPayloads, type WindowAction } from '@danesh/contracts/shell.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, type BrowserWindow, dialog, ipcMain } from 'electron';
import { dispatchShellRequest, ShellFailure } from './policy/shell-dispatch.ts';
import { isTrustedShellOrigin } from './policy/shell-origin.ts';

export { isTrustedShellOrigin } from './policy/shell-origin.ts';

export function sendShellEvent(window: BrowserWindow, topic: string, payload: unknown): void {
  const parsed = shellEventPayloads[topic]?.safeParse(payload);
  if (!Object.hasOwn(shellEventPayloads, topic) || !parsed?.success)
    throw new Error('Invalid shell event');
  if (!window.isDestroyed())
    window.webContents.send('danesh:shell-event', { topic, payload: parsed.data });
}

export type ShellServices = {
  registerTarget: (token: string, path: string) => Promise<void>;
  windowAction: (action: WindowAction) => void;
  windowState: () => unknown;
  getTheme: () => unknown;
  setTheme: (theme: ThemePreference) => unknown;
  showAppMenu: (x: number, y: number) => void;
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
  const handlers = {
    'shell.chooseExportPath': chooseExportPath,
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
    'shell.showAppMenu': ({ x, y }: { x: number; y: number }) => {
      services.showAppMenu(x, y);
      return {};
    },
  };
  ipcMain.handle('danesh:shell', (event, value: unknown) => {
    const trusted =
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isTrustedShellOrigin(event.senderFrame.url, app.isPackaged ? undefined : devUrl);
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
