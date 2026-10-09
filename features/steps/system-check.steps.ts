import { expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Given, When, Then } from './fixtures.ts';
import { SmokeReportSchema } from '../../packages/contracts/src/smoke-report.ts';

Given('Danesh is launched with that library folder on System check', async ({ harness }) => {
  await harness.launch(); await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
});
Given('the test build of Danesh is launched with that library folder on System check', async ({ harness }) => {
  await harness.launch(); await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
});
Given('a System check run has completed', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(harness.page!.locator('[data-check-id="database"]').getByText('موفق', { exact: true })).toBeVisible();
  await expect(harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeEnabled();
});
Given("Main's save dialog is stubbed to select a writable report file", async ({ harness, libraryRoot }) => {
  await harness.app!.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => { await new Promise((resolve) => setTimeout(resolve, 300)); return { canceled: false, filePath: path }; }; }, join(libraryRoot, 'گزارش آزمون.json'));
});
Given("a run has completed and Main's save dialog selects an unwritable location", async ({ harness, libraryRoot }) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeEnabled();
  await harness.app!.evaluate(({ dialog }, path) => { dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path }); }, join(libraryRoot, 'missing-parent', 'report.json'));
});
When('I press «ذخیرهٔ گزارش»', async ({ harness }) => { await harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }).click(); });
Then('the control reads «در حال ذخیره…» and is disabled while saving', async ({ harness }) => { await expect(harness.page!.getByRole('button', { name: 'در حال ذخیره…', exact: true })).toBeDisabled(); });
Then('the saved JSON validates against the smoke-report schema', async ({ libraryRoot, harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('گزارش ذخیره شد.');
  SmokeReportSchema.parse(JSON.parse(await readFile(join(libraryRoot, 'گزارش آزمون.json'), 'utf8')));
});
Then('its check ids, statuses and order equal those displayed on screen', async ({ libraryRoot, harness }) => {
  const report = SmokeReportSchema.parse(JSON.parse(await readFile(join(libraryRoot, 'گزارش آزمون.json'), 'utf8')));
  expect(await harness.page!.locator('[data-check-id]').evaluateAll((rows) => rows.map((row) => ({ checkId: row.getAttribute('data-check-id'), status: row.getAttribute('data-status') })))).toEqual(report.checks.map(({ checkId, status }) => ({ checkId, status })));
});
Then('«گزارش ذخیره شد.» is announced and focus returns to «ذخیرهٔ گزارش»', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('گزارش ذخیره شد.'); await expect(harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeFocused();
});
Then('the status region announces «ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.»', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.');
});
Then('no stack trace or raw error is shown outside technical details', async ({ harness }) => { expect(await harness.page!.locator('main').innerText()).not.toMatch(/Error:|ENOENT|EACCES|\bat .*\(.*:\d+/); });
When("I press «ذخیرهٔ گزارش» and cancel Main's save dialog", async ({ harness }) => {
  await harness.app!.evaluate(({ dialog }) => { dialog.showSaveDialog = () => Promise.resolve({ canceled: true, filePath: '' }); });
  await harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }).click();
});
Then('no report file is written and no export message is announced', async ({ harness, libraryRoot }) => {
  await expect(harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeEnabled();
  expect((await readdir(libraryRoot)).filter((file) => file.endsWith('.json') || file.includes('.tmp-'))).toEqual([]);
  expect(await harness.page!.getByRole('status').innerText()).not.toMatch(/گزارش ذخیره شد|ذخیرهٔ گزارش انجام نشد/);
});
Then('focus returns to «ذخیرهٔ گزارش»', async ({ harness }) => { await expect(harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeFocused(); });
