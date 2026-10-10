import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { Given, Then, When } from './fixtures.ts';

const require = createRequire(import.meta.url);
const secondInstance = new WeakMap<object, { exitCode: number | null; elapsedMs: number }>();

Given('Danesh is already launched with that library folder', async ({ harness }) => {
  await harness.launch();
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible();
});
When(
  'a second instance is launched with the same library folder',
  async ({ harness, libraryRoot }) => {
    // Move focus away first so the assertion below proves the second launch brought the first window back.
    await harness.app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur());
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const started = Date.now();
    const child = spawn(
      require('electron') as string,
      [resolve('apps/desktop'), `--user-data-dir=${libraryRoot}`],
      { env, stdio: 'ignore' },
    );
    const exitCode = await new Promise<number | null>((done, fail) => {
      const timer = setTimeout(() => {
        child.kill();
        fail(new Error('Second instance did not exit within 10 s'));
      }, 10_000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        done(code);
      });
    });
    secondInstance.set(harness, { exitCode, elapsedMs: Date.now() - started });
  },
);
Then('the second process exits and the first window receives focus', async ({ harness }) => {
  const result = secondInstance.get(harness)!;
  expect(result.exitCode).toBe(0);
  expect(result.elapsedMs).toBeLessThan(10_000);
  await expect
    .poll(() =>
      harness.app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused()),
    )
    .toBe(true);
});
Then('exactly one Core process has the library open', async ({ harness }) => {
  const cores = await harness.app!.evaluate(
    ({ app }) =>
      app
        .getAppMetrics()
        .filter((metric) => metric.serviceName === 'Danesh Core' || metric.name === 'Danesh Core')
        .length,
  );
  expect(cores).toBe(1);
  expect(
    await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 3 })),
  ).toMatchObject({ n: 3 });
});
