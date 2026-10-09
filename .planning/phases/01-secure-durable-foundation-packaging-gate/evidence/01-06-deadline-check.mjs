import { _electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
const root = await mkdtemp(join(tmpdir(), 'danesh-deadline-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [resolve('apps/desktop'), '--user-data-dir=' + root], env });
try {
  const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => window.danesh.call('test.coreStall', { ms: 13000 }));
  const stalledAt = Date.now();
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    const original = contents.postMessage.bind(contents);
    contents.postMessage = (channel, ...args) => { if (channel === 'danesh:port') setTimeout(() => original(channel, ...args), 3000); else original(channel, ...args); };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const started = performance.now();
    try { await window.danesh.call('system.ping', { n: 42 }); return { code: 'unexpected-success', elapsedMs: performance.now() - started }; }
    catch (error) { return { code: error.code ?? error.message, elapsedMs: performance.now() - started }; }
  });
  if (result.code !== 'UNAVAILABLE' || result.elapsedMs < 9800 || result.elapsedMs > 11500) throw new Error(JSON.stringify(result));
  await new Promise(resolve => setTimeout(resolve, Math.max(0, stalledAt + 13100 - Date.now())));
  const recovered = await page.evaluate(() => window.danesh.call('system.ping', { n: 42 }));
  if (recovered.n !== 42) throw new Error('Connection did not recover');
  await writeFile(join(import.meta.dirname, '01-06-deadline-result.json'), JSON.stringify({ recordedAt: new Date().toISOString(), note: 'Actual test-build IPC with a 3-second Main port-transfer delay and 13-second Core stall; deadline covers both connection and response waits.', result, recovered }, null, 2) + '\n');
  console.log(JSON.stringify({ result, recovered }));
} finally {
  await app.close();
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('danesh-deadline-')) throw new Error('Unsafe cleanup');
  await rm(root, { recursive: true, force: true });
}
