import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { _electron, expect } from '@playwright/test';
import type Database from 'better-sqlite3';
import { ResponsivenessInputSchema } from '../../packages/contracts/src/responsiveness.ts';
import { SmokeReportSchema } from '../../packages/contracts/src/smoke-report.ts';
import { EngineEchoOutputSchema } from '../../packages/contracts/src/test-rpc.ts';
import { Given, Then, When } from './fixtures.ts';

Given(
  'an isolated library folder whose path contains Persian letters and a space',
  ({ libraryRoot }) => {
    expect(libraryRoot).toMatch(/[\u0600-\u06ff]/);
    expect(libraryRoot).toContain(' ');
  },
);
Given('Danesh is launched with that library folder', async ({ harness }) => {
  await harness.launch();
  expect(
    await harness.app!.evaluate(({ app }) =>
      app.commandLine.hasSwitch('disable-renderer-backgrounding'),
    ),
  ).toBe(false);
});
Given('the test build of Danesh is launched with that library folder', async ({ harness }) => {
  await harness.launch();
});
When('a test-only echo travels through Core to the sample engine host', async ({ harness }) => {
  const output = await harness.page!.evaluate(() => window.danesh.call('test.engineEcho', {}));
  harness.echo = EngineEchoOutputSchema.parse(output);
});
Then(
  "the returned host process id differs from Core, Main and the window's renderer process ids",
  async ({ harness }) => {
    const echo = harness.echo;
    if (!echo) throw new Error('Echo not received');
    const mainPid = await harness.app!.evaluate(() => process.pid);
    const rendererPid = await harness.app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId(),
    );
    expect(new Set([echo.hostPid, echo.corePid, mainPid, rendererPid]).size).toBe(4);
    expect(echo.hostPid).toBeGreaterThan(0);
    expect(echo.corePid).toBeGreaterThan(0);
  },
);
When('I open System check and press «اجرای بررسی»', async ({ harness }) => {
  const page = harness.page;
  if (!page) throw new Error('App not launched');
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
});
Then('the «اجرای برنامه» and «پایگاه داده» rows show «موفق»', async ({ harness }) => {
  const page = harness.page;
  if (!page) throw new Error('App not launched');
  for (const id of ['app-launch', 'database'])
    await expect(
      page.locator(`[data-check-id="${id}"]`).getByText('موفق', { exact: true }),
    ).toBeVisible();
  expect(page.url()).toMatch(/^app:\/\/danesh\//);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.locator('meta[property="csp-nonce"]').getAttribute('content')).not.toBe(
    '__CSP_NONCE__',
  );
  expect(
    await page.evaluate(() => (window as Window & { __cspViolations?: string[] }).__cspViolations),
  ).toEqual([]);
});
Then(
  "their technical details record a Core process id different from the window's renderer process id",
  async ({ harness }) => {
    if (!harness.page || !harness.app) throw new Error('App not launched');
    const rendererPid = await harness.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId(),
    );
    for (const id of ['app-launch', 'database']) {
      await harness.page
        .locator(`[data-check-id="${id}"]`)
        .getByRole('button', { name: 'جزئیات فنی', exact: true })
        .click();
      const fields: unknown = JSON.parse(
        await harness.page.locator(`[data-check-id="${id}"] pre`).innerText(),
      );
      expect(fields).toHaveProperty('corePid');
      if (typeof fields !== 'object' || fields === null || !('corePid' in fields))
        throw new Error('Missing pid');
      expect(fields.corePid).not.toBe(rendererPid);
    }
  },
);
When("the page's runtime surface is inspected", async ({ harness }) => {
  await expect(harness.page!.getByRole('heading', { name: 'دانش', exact: true })).toBeVisible();
});
Then('"typeof require" and "typeof process" are both "undefined"', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => [typeof require, typeof process])).toEqual([
    'undefined',
    'undefined',
  ]);
});
Then('"window.danesh" exposes only "call" and "on"', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => Object.keys(window.danesh).sort())).toEqual([
    'call',
    'on',
  ]);
});
Then(
  'neither ipcRenderer nor the private MessagePort is exposed to the page',
  async ({ harness }) => {
    expect(
      await harness.page!.evaluate(() =>
        ['ipcRenderer', 'port', 'messagePort'].some((key) => key in window || key in window.danesh),
      ),
    ).toBe(false);
    expect(
      await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 42 })),
    ).toMatchObject({ n: 42 });
  },
);
Given('one System check run has written a database probe row', async ({ harness }) => {
  const page = harness.page!;
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(
    page.locator('[data-check-id="database"]').getByText('موفق', { exact: true }),
  ).toBeVisible();
  await page
    .locator('[data-check-id="database"]')
    .getByRole('button', { name: 'جزئیات فنی', exact: true })
    .click();
  const fields = JSON.parse(await page.locator('[data-check-id="database"] pre').innerText()) as {
    count: number;
  };
  harness.firstCount = fields.count;
  expect(harness.firstCount).toBe(1);
});
When('the app is closed and reopened with the same library folder', async ({ harness }) => {
  await harness.close();
  await harness.launch();
});
When('I run System check again', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
});
Then(
  'the database check reads the probe row written by the first run',
  async ({ harness, libraryRoot }) => {
    await expect(
      harness.page!.locator('[data-check-id="database"]').getByText('موفق', { exact: true }),
    ).toBeVisible();
    await harness
      .page!.locator('[data-check-id="database"]')
      .getByRole('button', { name: 'جزئیات فنی', exact: true })
      .click();
    const fields = JSON.parse(
      await harness.page!.locator('[data-check-id="database"] pre').innerText(),
    ) as { count: number; journal_mode: string; user_version: number };
    expect(fields.count).toBe(harness.firstCount + 1);
    expect(fields.journal_mode).toBe('wal');
    const migrationFiles = readdirSync('packages/storage/migrations')
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(fields.user_version).toBe(Number(migrationFiles.at(-1)?.slice(0, 4)));
    await harness.close();
    const Sqlite = createRequire(import.meta.url)('better-sqlite3') as typeof Database;
    const db = new Sqlite(join(libraryRoot, 'danesh.db'), { readonly: true });
    try {
      expect(db.prepare('SELECT id FROM system_check_probe ORDER BY id').all()).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
      expect(
        db.prepare('SELECT id, checksum, app_version FROM schema_migration ORDER BY id').all(),
      ).toEqual(
        migrationFiles.map((name) => ({
          id: name.slice(0, 4),
          checksum: createHash('sha256')
            .update(
              readFileSync(join('packages/storage/migrations', name), 'utf8').replace(
                /\r\n/g,
                '\n',
              ),
            )
            .digest('hex'),
          app_version: '0.1.0',
        })),
      );
      expect(
        db
          .prepare('SELECT strict FROM pragma_table_list WHERE name IN (?, ?)')
          .all('schema_migration', 'system_check_probe'),
      ).toEqual([{ strict: 1 }, { strict: 1 }]);
    } finally {
      db.close();
    }
  },
);

Given('Danesh is launched with that library folder and Core is ready', async ({ harness }) => {
  await harness.launch();
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible();
});
Then('the document has lang "fa" and dir "rtl"', async ({ harness }) => {
  await expect(harness.page!.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(harness.page!.locator('html')).toHaveAttribute('dir', 'rtl');
});
Then('the heading and window title are «دانش»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: 'دانش', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(harness.page!).toHaveTitle('دانش');
});
Then('the banner title is «نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible();
});
Then('the only action in the Home content is «بررسی سامانه»', async ({ harness }) => {
  const main = harness.page!.locator('main');
  await expect(main.getByRole('button')).toHaveCount(1);
  await expect(main.getByRole('link')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'بررسی سامانه', exact: true })).toBeEnabled();
  await expect(harness.page!.locator('footer bdi[dir="ltr"]')).toHaveText('0.1.0');
});
Then(
  'the Home content has no import, reader, curriculum or search control',
  async ({ harness }) => {
    const main = harness.page!.locator('main');
    expect(await main.getByRole('button').allTextContents()).toEqual(['بررسی سامانه']);
    await expect(
      main.locator('input, textarea, nav, [role="tablist"], [role="searchbox"]'),
    ).toHaveCount(0);
    expect(await harness.page!.getByRole('navigation').getByRole('link').allTextContents()).toEqual(
      ['خانه', 'بررسی سامانه', 'تنظیمات'],
    );
  },
);
Then('no disabled study-feature placeholder is shown', async ({ harness }) => {
  await expect(harness.page!.locator('button[disabled], [aria-disabled="true"]')).toHaveCount(0);
});
Then(
  /^the route is "#\/system-check" and its h1 «بررسی سامانه» has focus$/,
  async ({ harness }) => {
    await expect(harness.page!).toHaveURL(/#\/system-check$/);
    await expect(
      harness.page!.getByRole('heading', { name: 'بررسی سامانه', level: 1, exact: true }),
    ).toBeFocused();
  },
);
Then('the window title is «بررسی سامانه — دانش»', async ({ harness }) => {
  await expect(harness.page!).toHaveTitle('بررسی سامانه — دانش');
});
When('an unknown hash route is selected', async ({ harness }) => {
  await harness.page!.evaluate(() => {
    location.hash = '/unknown-route';
  });
});
Then('Home is rendered with the heading and window title «دانش»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: 'دانش', exact: true, level: 1 }),
  ).toBeFocused();
  await expect(harness.page!).toHaveTitle('دانش');
});

Given('the test build delays Core readiness for more than 5 seconds', ({ harness }) => {
  harness.coreReadyDelayMs = 8000;
});
Then('Home initially shows «در حال آماده‌سازی…» with a running spinner', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: 'در حال آماده‌سازی…', exact: true }),
  ).toBeVisible();
  await expect(harness.page!.locator('.spinner')).toBeVisible();
});
Then(
  'after 5 seconds it also shows «آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.»',
  async ({ harness }) => {
    await expect(
      harness.page!.getByText('آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.', { exact: true }),
    ).toBeVisible({ timeout: 6500 });
  },
);
Then('«بررسی سامانه» stays enabled throughout', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }),
  ).toBeEnabled();
});
When('Core reports ready', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible({ timeout: 5000 });
});
Then('the preparation messages clear and the foundation banner appears', async ({ harness }) => {
  await expect(harness.page!.getByText('در حال آماده‌سازی…', { exact: true })).toHaveCount(0);
  await expect(
    harness.page!.getByText('آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible();
});

// Plan 01-07: the rejection scenarios. The Persian payload is mixed-script on purpose (ZWNJ and Latin digits).
const persianPayload = 'دانش‌آموز ۴۲ 42';
const rejections = new WeakMap<object, { code: string; logBefore: string }>();
const coreLog = (root: string) => {
  const path = join(root, 'logs', 'core.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};
When(
  '"system.ping" receives a non-integer Persian string directly at Core',
  async ({ harness, libraryRoot }) => {
    await expect(
      harness.page!.getByRole('heading', {
        name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
        exact: true,
      }),
    ).toBeVisible();
    const logBefore = coreLog(libraryRoot);
    const code = await harness.page!.evaluate(async (text) => {
      try {
        await window.danesh.call('test.raw', { method: 'system.ping', input: { n: text } });
        return 'unexpected-success';
      } catch (error) {
        return (error as Error).message;
      }
    }, persianPayload);
    rejections.set(harness, { code, logBefore });
  },
);
Then('the request fails with INVALID_INPUT', ({ harness }) => {
  expect(rejections.get(harness)?.code).toBe('INVALID_INPUT');
});
Then(
  /^"logs\/core\.jsonl" gains a record with schema "system\.ping", sender "renderer", error class and byte length$/,
  async ({ harness, libraryRoot }) => {
    await expect
      .poll(() => coreLog(libraryRoot).length)
      .toBeGreaterThan(rejections.get(harness)!.logBefore.length);
    const added = coreLog(libraryRoot)
      .slice(rejections.get(harness)!.logBefore.length)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const record = added.find(
      (line) => line.event === 'rpc.rejected' && line.schema === 'system.ping',
    );
    expect(record).toMatchObject({
      schema: 'system.ping',
      sender: 'renderer',
      errorClass: 'SchemaMismatch',
      code: 'INVALID_INPUT',
    });
    expect(record?.byteLength).toBe(
      Buffer.byteLength(JSON.stringify({ n: persianPayload }), 'utf8'),
    );
    expect(record).not.toHaveProperty('input');
  },
);
Then(
  'the log contains neither the Persian string nor its escaped representation',
  ({ libraryRoot }) => {
    const text = coreLog(libraryRoot);
    for (const needle of [
      persianPayload,
      'دانش',
      '‌',
      JSON.stringify(persianPayload).slice(1, -1),
      '\u0645',
      '\u200c',
    ])
      expect(text).not.toContain(needle);
    expect(text).not.toMatch(/[؀-ۿ‌]/);
  },
);
When('a malformed call is rejected', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible();
  harness.echo = {
    hostPid: 0,
    corePid: (
      (await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 1 }))) as {
        corePid: number;
      }
    ).corePid,
  };
  const code = await harness.page!.evaluate(async () => {
    try {
      await window.danesh.call('test.raw', {
        method: 'system.ping',
        input: { n: 'x', extra: true },
      });
      return 'unexpected-success';
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(code).toBe('INVALID_INPUT');
});
When('a valid "system.ping" call is sent immediately afterwards', async ({ harness }) => {
  rejections.set(harness, {
    code: JSON.stringify(
      await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 7 })),
    ),
    logBefore: '',
  });
});
Then('the valid ping succeeds on the same connection', ({ harness }) => {
  // Same Core process and no reconnect: the rejection did not tear down the private port.
  expect(JSON.parse(rejections.get(harness)!.code)).toEqual({
    n: 7,
    corePid: harness.echo!.corePid,
  });
});

// Plan 01-07: CSP and navigation lockdown, including a reload that happens while Core is still starting.
When('Home and System check are visited while CSP violations are recorded', async ({ harness }) => {
  await harness.close();
  harness.coreReadyDelayMs = 4000;
  await harness.launch(); // the harness reloads the page and asserts a fresh-nonce CSP header while Core is still delayed
  expect(
    await harness.page!.evaluate(() => [
      typeof require,
      typeof process,
      Object.keys(window.danesh).sort().join(),
    ]),
  ).toEqual(['undefined', 'undefined', 'call,on']);
  await expect(
    harness.page!.getByRole('heading', {
      name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست',
      exact: true,
    }),
  ).toBeVisible({ timeout: 8000 });
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await expect(
    harness.page!.getByRole('heading', { name: 'بررسی سامانه', level: 1, exact: true }),
  ).toBeVisible();
  await harness.page!.evaluate(() => {
    location.hash = '/';
  });
  await expect(
    harness.page!.getByRole('heading', { name: 'دانش', level: 1, exact: true }),
  ).toBeVisible();
});
Then('zero "securitypolicyviolation" events are recorded', async ({ harness }) => {
  expect(
    await harness.page!.evaluate(
      () => (window as Window & { __cspViolations?: string[] }).__cspViolations,
    ),
  ).toEqual([]);
});
When(/^page navigation to "https:\/\/example\.com" is attempted$/, async ({ harness }) => {
  await harness.page!.evaluate(() => {
    location.assign('https://example.com/');
  });
  await harness.page!.waitForTimeout(500);
});
Then('navigation is blocked before any external connection', async ({ harness }) => {
  // will-navigate cancels the navigation before Chromium issues a request, so not even the L1 egress block sees one.
  expect(harness.page!.url()).toMatch(/^app:\/\/danesh\//);
  expect(
    await harness.app!.evaluate(() =>
      (
        globalThis as unknown as { __daneshChromiumBlocked: () => number }
      ).__daneshChromiumBlocked(),
    ),
  ).toBe(0);
});
Then('"window.open" for that URL returns null', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => window.open('https://example.com/') === null)).toBe(
    true,
  );
  expect(
    await harness.app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
});
Then(/^the page remains on the app origin "app:\/\/danesh"$/, async ({ harness }) => {
  // URL.origin is 'null' for non-special schemes such as app:, so compare protocol and host.
  const url = new URL(harness.page!.url());
  expect([url.protocol, url.host]).toEqual(['app:', 'danesh']);
  // Read the DOM directly: Playwright locators keep waiting on the navigation that Main cancelled.
  expect(
    await harness.page!.evaluate(() => [
      document.readyState,
      document.querySelector('main h1')?.textContent,
    ]),
  ).toEqual(['complete', 'دانش']);
});

Given(
  'Danesh is launched headlessly in smoke mode with that library folder',
  async ({ harness, libraryRoot }) => {
    const require = createRequire(import.meta.url);
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value]],
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    harness.app = await _electron.launch({
      executablePath: env.DANESH_TEST_EXE ?? (require('electron') as string),
      args: [
        ...(env.DANESH_TEST_EXE ? [] : [resolve('apps/desktop')]),
        `--user-data-dir=${libraryRoot}`,
        '--smoke-test',
        `--smoke-out=${join(libraryRoot, 'headless-report.json')}`,
      ],
      env,
    });
    harness.page = await harness.app.firstWindow();
    await harness.page.waitForLoadState('domcontentloaded');
  },
);
Then(
  'the hidden renderer has foreground process scheduling and unthrottled timers',
  async ({ harness }) => {
    expect(
      await harness.app!.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        return {
          visible: window.isVisible(),
          backgroundThrottling: window.webContents.backgroundThrottling,
          foregroundScheduling: app.commandLine.hasSwitch('disable-renderer-backgrounding'),
        };
      }),
    ).toEqual({ visible: false, backgroundThrottling: false, foregroundScheduling: true });
  },
);
Then(
  'all three real engine probes finish and the renderer heartbeat meets the existing policy',
  async ({ harness, libraryRoot }) => {
    const reportPath = join(libraryRoot, 'headless-report.json');
    await expect.poll(() => existsSync(reportPath), { timeout: 40_000 }).toBe(true);
    const report = SmokeReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')));
    for (const checkId of ['engine-llm', 'engine-ocr', 'engine-tts', 'ui-responsive']) {
      expect(report.checks.find((check) => check.checkId === checkId)?.status).toBe('pass');
    }
    await harness.close();
  },
);

async function readHeadlessReport(libraryRoot: string) {
  const reportPath = join(libraryRoot, 'headless-report.json');
  await expect.poll(() => existsSync(reportPath), { timeout: 40_000 }).toBe(true);
  return SmokeReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')));
}
Then(
  'its smoke report contains an independent idle baseline and timestamped renderer samples',
  async ({ libraryRoot }) => {
    const report = await readHeadlessReport(libraryRoot);
    const check = report.checks.find((entry) => entry.checkId === 'ui-responsive')!;
    const raw = JSON.parse(String(check.fields.diagnostics)) as Record<string, unknown>;
    const { samplesMs, ...diagnostics } = raw;
    const parsed = ResponsivenessInputSchema.parse({
      runId: '00000000-0000-4000-8000-000000000000',
      intervalMs: 50,
      samplesMs,
      diagnostics,
    });
    expect(parsed.diagnostics!.idleSamplesMs.length).toBeGreaterThan(0);
    expect(parsed.diagnostics!.idleSamplesMs.length).toBeLessThanOrEqual(100);
    expect(parsed.samplesMs.length).toBe(check.fields.sampleCount);
    expect(parsed.samplesMs.length).toBeGreaterThanOrEqual(100);
    expect(parsed.diagnostics!.sampleElapsedMs[0]).toBeGreaterThanOrEqual(50);
  },
);
Then(
  'its engine rows record actual start and finish times without changing report order',
  async ({ libraryRoot, harness }) => {
    const report = await readHeadlessReport(libraryRoot);
    const engines = report.checks.filter((entry) => entry.checkId.startsWith('engine-'));
    expect(engines.map((entry) => entry.checkId)).toEqual([
      'engine-llm',
      'engine-ocr',
      'engine-tts',
    ]);
    for (const engine of engines) {
      expect(engine.status).toBe('pass');
      expect(Number(engine.fields.checkFinishedAtMs)).toBeGreaterThanOrEqual(
        Number(engine.fields.checkStartedAtMs),
      );
      expect(Number(engine.fields.hostCpuUserMs)).toBeGreaterThanOrEqual(0);
      expect(Number(engine.fields.hostRssAtFinishBytes)).toBeGreaterThan(0);
    }
    expect(Math.max(...engines.map((entry) => Number(entry.fields.checkStartedAtMs)))).toBeLessThan(
      Math.min(...engines.map((entry) => Number(entry.fields.checkFinishedAtMs))),
    );
    await harness.close();
  },
);
