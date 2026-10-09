import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { shellMethods, shellEventPayloads } from '@danesh/contracts/shell.ts';
import { RpcRequestSchema, type RpcErrorCode } from '@danesh/contracts/rpc.ts';
import { isTrustedShellOrigin } from './policy/shell-origin.ts';
export { isTrustedShellOrigin } from './policy/shell-origin.ts';

export function sendShellEvent(window: BrowserWindow, topic: string, payload: unknown): void {
  const parsed = shellEventPayloads[topic]?.safeParse(payload);
  if (!Object.hasOwn(shellEventPayloads, topic) || !parsed?.success) throw new Error('Invalid shell event');
  if (!window.isDestroyed()) window.webContents.send('danesh:shell-event', { topic, payload: parsed.data });
}

export function registerShellIpc(window: BrowserWindow, registerTarget: (token: string, path: string) => Promise<void>, devUrl?: string): void {
  const fail = (code: RpcErrorCode) => ({ id: 1, ok: false as const, error: { code } });
  let choosing = false;
  ipcMain.handle('danesh:shell', async (event, value: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isTrustedShellOrigin(event.senderFrame.url, app.isPackaged ? undefined : devUrl)) return fail('INVALID_INPUT');
    const request = RpcRequestSchema.safeParse(value);
    if (!request.success) return fail('INVALID_INPUT');
    const contract = Object.hasOwn(shellMethods, request.data.method) ? shellMethods[request.data.method] : undefined;
    if (!contract) return fail('UNKNOWN_METHOD');
    if (Buffer.byteLength(JSON.stringify(request.data.input) ?? '', 'utf8') > contract.maxInputBytes) return fail('PAYLOAD_TOO_LARGE');
    if (!contract.input.safeParse(request.data.input).success) return fail('INVALID_INPUT');
    if (choosing) return fail('UNAVAILABLE');
    choosing = true;
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const result = await dialog.showSaveDialog(window, { defaultPath: join(app.getPath('documents'), `danesh-system-check-${stamp}.json`), filters: [{ name: 'JSON', extensions: ['json'] }] });
      let token: string | null = null;
      if (!result.canceled && result.filePath) {
        if (!isAbsolute(result.filePath)) return fail('INVALID_INPUT');
        token = randomUUID(); await registerTarget(token, result.filePath);
      }
      return { id: 1, ok: true as const, output: { token } };
    } catch { return fail('UNAVAILABLE'); }
    finally { choosing = false; }
  });
}
