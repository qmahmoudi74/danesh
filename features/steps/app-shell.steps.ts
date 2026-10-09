import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures.ts';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { EngineEchoOutputSchema } from '../../packages/contracts/src/test-rpc.ts';

Given('an isolated library folder whose path contains Persian letters and a space', ({ libraryRoot }) => {
  expect(libraryRoot).toMatch(/[\u0600-\u06ff]/); expect(libraryRoot).toContain(' ');
});
Given('Danesh is launched with that library folder', async ({ harness }) => { await harness.launch(); });
Given('the test build of Danesh is launched with that library folder', async ({ harness }) => { await harness.launch(); });
When('a test-only echo travels through Core to the sample engine host', async ({ harness }) => {
  const output = await harness.page!.evaluate(() => window.danesh.call('test.engineEcho', {}));
  harness.echo = EngineEchoOutputSchema.parse(output);
});
Then("the returned host process id differs from Core, Main and the window's renderer process ids", async ({ harness }) => {
  const echo = harness.echo;
  if (!echo) throw new Error('Echo not received');
  const mainPid = await harness.app!.evaluate(() => process.pid);
  const rendererPid = await harness.app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId());
  expect(new Set([echo.hostPid, echo.corePid, mainPid, rendererPid]).size).toBe(4);
  expect(echo.hostPid).toBeGreaterThan(0); expect(echo.corePid).toBeGreaterThan(0);
});
When('I open System check and press «اجرای بررسی»', async ({ harness }) => {
  const page = harness.page; if (!page) throw new Error('App not launched');
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
});
Then('the «اجرای برنامه» and «پایگاه داده» rows show «موفق»', async ({ harness }) => {
  const page = harness.page; if (!page) throw new Error('App not launched');
  for (const id of ['app-launch', 'database']) await expect(page.locator(`[data-check-id="${id}"]`).getByText('موفق', { exact: true })).toBeVisible();
  expect(page.url()).toMatch(/^app:\/\/danesh\//);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.locator('meta[property="csp-nonce"]').getAttribute('content')).not.toBe('__CSP_NONCE__');
  expect(await page.evaluate(() => (window as Window & { __cspViolations?: string[] }).__cspViolations)).toEqual([]);
});
Then("their technical details record a Core process id different from the window's renderer process id", async ({ harness }) => {
  if (!harness.page || !harness.app) throw new Error('App not launched');
  const rendererPid = await harness.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId());
  for (const id of ['app-launch', 'database']) {
    await harness.page.locator(`[data-check-id="${id}"]`).getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
    const fields: unknown = JSON.parse(await harness.page.locator(`[data-check-id="${id}"] pre`).innerText());
    expect(fields).toHaveProperty('corePid');
    if (typeof fields !== 'object' || fields === null || !('corePid' in fields)) throw new Error('Missing pid');
    expect(fields.corePid).not.toBe(rendererPid);
  }
});
When("the page's runtime surface is inspected", async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'دانش', exact: true })).toBeVisible(); });
Then('"typeof require" and "typeof process" are both "undefined"', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => [typeof require, typeof process])).toEqual(['undefined', 'undefined']);
});
Then('"window.danesh" exposes only "call" and "on"', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => Object.keys(window.danesh).sort())).toEqual(['call', 'on']);
});
Then('neither ipcRenderer nor the private MessagePort is exposed to the page', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => ['ipcRenderer', 'port', 'messagePort'].some((key) => key in window || key in window.danesh))).toBe(false);
  expect(await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 42 }))).toMatchObject({ n: 42 });
});
Given('one System check run has written a database probe row', async ({ harness }) => {
  const page = harness.page!;
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(page.locator('[data-check-id="database"]').getByText('موفق', { exact: true })).toBeVisible();
  await page.locator('[data-check-id="database"]').getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
  const fields = JSON.parse(await page.locator('[data-check-id="database"] pre').innerText()) as { count: number };
  harness.firstCount = fields.count; expect(harness.firstCount).toBe(1);
});
When('the app is closed and reopened with the same library folder', async ({ harness }) => { await harness.close(); await harness.launch(); });
When('I run System check again', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
});
Then('the database check reads the probe row written by the first run', async ({ harness, libraryRoot }) => {
  await expect(harness.page!.locator('[data-check-id="database"]').getByText('موفق', { exact: true })).toBeVisible();
  await harness.page!.locator('[data-check-id="database"]').getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
  const fields = JSON.parse(await harness.page!.locator('[data-check-id="database"] pre').innerText()) as { count: number; journal_mode: string; user_version: number };
  expect(fields.count).toBe(harness.firstCount + 1); expect(fields.journal_mode).toBe('wal'); expect(fields.user_version).toBe(1);
  await harness.close();
  const Sqlite = createRequire(import.meta.url)('better-sqlite3') as typeof Database;
  const db = new Sqlite(join(libraryRoot, 'danesh.db'), { readonly: true });
  try {
    expect(db.prepare('SELECT id FROM system_check_probe ORDER BY id').all()).toEqual([{ id: 1 }, { id: 2 }]);
    const sql = readFileSync('packages/storage/migrations/0001_init.sql', 'utf8').replace(/\r\n/g, '\n');
    expect(db.prepare('SELECT id, checksum, app_version FROM schema_migration').all()).toEqual([{ id: '0001', checksum: createHash('sha256').update(sql).digest('hex'), app_version: '0.1.0' }]);
    expect(db.prepare('SELECT strict FROM pragma_table_list WHERE name IN (?, ?)').all('schema_migration', 'system_check_probe')).toEqual([{ strict: 1 }, { strict: 1 }]);
  } finally { db.close(); }
});

Given('Danesh is launched with that library folder and Core is ready', async ({ harness }) => { await harness.launch(); await expect(harness.page!.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست', exact: true })).toBeVisible(); });
Then('the document has lang "fa" and dir "rtl"', async ({ harness }) => { await expect(harness.page!.locator('html')).toHaveAttribute('lang', 'fa'); await expect(harness.page!.locator('html')).toHaveAttribute('dir', 'rtl'); });
Then('the heading and window title are «دانش»', async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'دانش', exact: true, level: 1 })).toBeVisible(); await expect(harness.page!).toHaveTitle('دانش'); });
Then('the banner title is «نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست»', async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست', exact: true })).toBeVisible(); });
Then('the only action in the Home content is «بررسی سامانه»', async ({ harness }) => { const main = harness.page!.locator('main'); await expect(main.getByRole('button')).toHaveCount(1); await expect(main.getByRole('link')).toHaveCount(0); await expect(main.getByRole('button', { name: 'بررسی سامانه', exact: true })).toBeEnabled(); await expect(harness.page!.locator('footer bdi[dir="ltr"]')).toHaveText('0.1.0'); });
Then('the Home content has no import, reader, curriculum or search control', async ({ harness }) => { const main = harness.page!.locator('main'); expect(await main.getByRole('button').allTextContents()).toEqual(['بررسی سامانه']); await expect(main.locator('input, textarea, nav, [role="tablist"], [role="searchbox"]')).toHaveCount(0); expect(await harness.page!.getByRole('navigation').getByRole('link').allTextContents()).toEqual(['خانه', 'بررسی سامانه', 'تنظیمات']); });
Then('no disabled study-feature placeholder is shown', async ({ harness }) => { await expect(harness.page!.locator('button[disabled], [aria-disabled="true"]')).toHaveCount(0); });
When('I choose «نمایش» then «بررسی سامانه» using CmdOrCtrl+2', async ({ harness }) => {
  await harness.app!.evaluate(({ Menu, BrowserWindow }) => {
    const menu = Menu.getApplicationMenu();
    const item = menu?.items.find((entry) => entry.label === 'نمایش')?.submenu?.items.find((entry) => entry.label === 'بررسی سامانه');
    if (!item || item.accelerator !== 'CmdOrCtrl+2') throw new Error('Missing menu accelerator');
    Reflect.apply(item.click, item, [item, BrowserWindow.getAllWindows()[0], { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, triggeredByAccelerator: true }]);
  });
});
Then(/^the route is "#\/system-check" and its h1 «بررسی سامانه» has focus$/, async ({ harness }) => { await expect(harness.page!).toHaveURL(/#\/system-check$/); await expect(harness.page!.getByRole('heading', { name: 'بررسی سامانه', level: 1, exact: true })).toBeFocused(); });
Then('the window title is «بررسی سامانه — دانش»', async ({ harness }) => { await expect(harness.page!).toHaveTitle('بررسی سامانه — دانش'); });
When('an unknown hash route is selected', async ({ harness }) => { await harness.page!.evaluate(() => { location.hash = '/unknown-route'; }); });
Then('Home is rendered with the heading and window title «دانش»', async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'دانش', exact: true, level: 1 })).toBeFocused(); await expect(harness.page!).toHaveTitle('دانش'); });

Given('the test build delays Core readiness for more than 5 seconds', ({ harness }) => { harness.coreReadyDelayMs = 8000; });
Then('Home initially shows «در حال آماده‌سازی…» with a running spinner', async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'در حال آماده‌سازی…', exact: true })).toBeVisible(); await expect(harness.page!.locator('.spinner')).toBeVisible(); });
Then('after 5 seconds it also shows «آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.»', async ({ harness }) => { await expect(harness.page!.getByText('آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.', { exact: true })).toBeVisible({ timeout: 6500 }); });
Then('«بررسی سامانه» stays enabled throughout', async ({ harness }) => { await expect(harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true })).toBeEnabled(); });
When('Core reports ready', async ({ harness }) => { await expect(harness.page!.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست', exact: true })).toBeVisible({ timeout: 5000 }); });
Then('the preparation messages clear and the foundation banner appears', async ({ harness }) => { await expect(harness.page!.getByText('در حال آماده‌سازی…', { exact: true })).toHaveCount(0); await expect(harness.page!.getByText('آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.', { exact: true })).toHaveCount(0); await expect(harness.page!.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست', exact: true })).toBeVisible(); });
