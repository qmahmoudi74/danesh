import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures.ts';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

Given('an isolated library folder whose path contains Persian letters and a space', ({ libraryRoot }) => {
  expect(libraryRoot).toMatch(/[\u0600-\u06ff]/); expect(libraryRoot).toContain(' ');
});
Given('Danesh is launched with that library folder', async ({ harness }) => { await harness.launch(); });
Given('the test build of Danesh is launched with that library folder', async ({ harness }) => { await harness.launch(); });
When('a test-only echo travels through Core to the sample engine host', async ({ harness }) => {
  const output = await harness.page!.evaluate(() => window.danesh.call('test.engineEcho', {}));
  Object.assign(harness, { echo: output });
});
Then("the returned host process id differs from Core, Main and the window's renderer process ids", async ({ harness }) => {
  const echo = (harness as typeof harness & { echo: { hostPid: number; corePid: number } }).echo;
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
  expect(await page.evaluate(() => (window as Window & { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});
Then("their technical details record a Core process id different from the window's renderer process id", async ({ harness }) => {
  if (!harness.page || !harness.app) throw new Error('App not launched');
  const rendererPid = await harness.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId());
  for (const id of ['app-launch', 'database']) {
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
