// Captures the actual Electron window for Plan 01-17 visual inspection (both themes, sizes, zoom, states).
// Run after `pnpm build:test`: node .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-17-visual-check.mjs [filter]
import { _electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';

// DANESH_SHOT_DIR / DANESH_SHOT_PREFIX let later runs write elsewhere without overwriting earlier evidence.
const out = process.env.DANESH_SHOT_DIR ?? import.meta.dirname;
const prefix = process.env.DANESH_SHOT_PREFIX ?? '01-17-';
await (await import('node:fs/promises')).mkdir(out, { recursive: true });
const filter = process.argv[2] ?? '';
const root = await mkdtemp(join(tmpdir(), 'danesh-visual-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [resolve('apps/desktop'), '--user-data-dir=' + root], env, colorScheme: null });
const results = [];
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست' }).waitFor();
  const setSize = (width, height) => app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.unmaximize(); win.setContentSize(w, h); }, [width, height]);
  const setZoom = (factor) => app.evaluate(({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(f), factor);
  // Electron's own capture of the composited window: correct at any zoom factor, unlike a CSS-pixel page screenshot.
  const capture = async () => Buffer.from(await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')), 'base64');
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(350); };
  const shot = async (name, keepPointer = false) => {
    if (filter && !name.includes(filter)) return;
    if (!keepPointer) await page.mouse.move(600, 400);
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.content, .title-bar, .sidebar')].some((el) => el.scrollWidth > el.clientWidth + 1), viewport: [innerWidth, innerHeight], csp: window.__cspViolations ?? [] }));
    const buffer = await capture();
    await writeFile(join(out, `${prefix}${name}.png`), buffer);
    results.push({ name, ...metrics });
  };
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.danesh.call('shell.setTheme', { theme: t }), theme);
    await page.waitForTimeout(400);
    await setZoom(1); await setSize(1040, 720);
    await go('/'); await shot(`${theme}-home-1040`);
    await go('/system-check');
    await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
    await page.getByRole('button', { name: 'اجرای دوباره', exact: true }).waitFor();
    await page.locator('[data-check-id="database"]').getByRole('button', { name: 'جزئیات فنی' }).click();
    await page.waitForTimeout(300);
    await shot(`${theme}-system-1040`);
    await go('/settings'); await shot(`${theme}-settings-1040`);
    await setSize(720, 520); await go('/'); await shot(`${theme}-home-720`);
    await go('/system-check'); await shot(`${theme}-system-720`);
    await setSize(1040, 720); await setZoom(2); await go('/settings'); await shot(`${theme}-settings-zoom200`);
    await go('/system-check'); await shot(`${theme}-system-zoom200`);
    await setZoom(1);
    // Hover states on the chrome.
    await go('/');
    const close = page.getByRole('button', { name: 'بستن' });
    // Collapsed rail with a tooltip, then a keyboard focus ring on a sidebar item.
    await page.getByRole('button', { name: 'جمع کردن نوار کناری' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('navigation').getByRole('link', { name: 'بررسی سامانه' }).hover();
    await page.waitForTimeout(800);
    await shot(`${theme}-rail-tooltip`, true);
    await page.mouse.move(600, 600);
    await page.getByRole('navigation').getByRole('link', { name: 'خانه' }).focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await shot(`${theme}-rail-focus`, true);
    await page.getByRole('button', { name: 'باز کردن نوار کناری' }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.documentElement.toggleAttribute('data-window-inactive', true));
    await shot(`${theme}-inactive`);
    await page.evaluate(() => document.documentElement.toggleAttribute('data-window-inactive', false));
    if (await close.count()) { await close.hover(); await page.waitForTimeout(700); if (!filter || `${theme}-close-hover`.includes(filter)) { await writeFile(join(out, `${prefix}${theme}-close-hover.png`), await page.screenshot({ clip: { x: (await page.evaluate(() => innerWidth)) - 360, y: 0, width: 360, height: 120 } })); } }
  }
  await writeFile(join(out, `${prefix}visual-results.json`), JSON.stringify({ recordedAt: new Date().toISOString(), platform: process.platform, results }, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  await app.close();
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('danesh-visual-')) throw new Error('Unsafe cleanup');
  await rm(root, { recursive: true, force: true });
}
