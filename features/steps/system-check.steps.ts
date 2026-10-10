import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { genericFail, summary } from '../../apps/renderer/src/lib/copy.ts';
import { SystemInfoSchema } from '../../packages/contracts/src/rpc.ts';
import { SmokeReportSchema } from '../../packages/contracts/src/smoke-report.ts';
import { Given, Then, When } from './fixtures.ts';

Given('Danesh is launched with that library folder on System check', async ({ harness }) => {
  await harness.launch();
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
});
Given(
  'the test build of Danesh is launched with that library folder on System check',
  async ({ harness }) => {
    await harness.launch();
    await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  },
);
Given('a System check run has completed', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(
    harness.page!.locator('[data-check-id="database"]').getByText('موفق', { exact: true }),
  ).toBeVisible();
  await expect(
    harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
  ).toBeEnabled();
});
Given(
  "Main's save dialog is stubbed to select a writable report file",
  async ({ harness, libraryRoot }) => {
    await harness.app!.evaluate(
      ({ dialog }, path) => {
        dialog.showSaveDialog = async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return { canceled: false, filePath: path };
        };
      },
      join(libraryRoot, 'گزارش آزمون.json'),
    );
  },
);
Given(
  "a run has completed and Main's save dialog selects an unwritable location",
  async ({ harness, libraryRoot }) => {
    await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
    await expect(
      harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
    ).toBeEnabled();
    await harness.app!.evaluate(
      ({ dialog }, path) => {
        dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
      },
      join(libraryRoot, 'missing-parent', 'report.json'),
    );
  },
);
When('I press «ذخیرهٔ گزارش»', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }).click();
});
Then('the control reads «در حال ذخیره…» and is disabled while saving', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'در حال ذخیره…', exact: true }),
  ).toBeDisabled();
});
Then(
  'the saved JSON validates against the smoke-report schema',
  async ({ libraryRoot, harness }) => {
    await expect(harness.page!.getByRole('status')).toContainText('گزارش ذخیره شد.');
    SmokeReportSchema.parse(
      JSON.parse(await readFile(join(libraryRoot, 'گزارش آزمون.json'), 'utf8')),
    );
  },
);
Then(
  'its check ids, statuses and order equal those displayed on screen',
  async ({ libraryRoot, harness }) => {
    const report = SmokeReportSchema.parse(
      JSON.parse(await readFile(join(libraryRoot, 'گزارش آزمون.json'), 'utf8')),
    );
    expect(
      await harness.page!.locator('[data-check-id]').evaluateAll((rows) =>
        rows.map((row) => ({
          checkId: row.getAttribute('data-check-id'),
          status: row.getAttribute('data-status'),
        })),
      ),
    ).toEqual(report.checks.map(({ checkId, status }) => ({ checkId, status })));
  },
);
Then('«گزارش ذخیره شد.» is announced and focus returns to «ذخیرهٔ گزارش»', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('گزارش ذخیره شد.');
  await expect(
    harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
  ).toBeFocused();
});
Then(
  'the status region announces «ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.»',
  async ({ harness }) => {
    await expect(harness.page!.getByRole('status')).toContainText(
      'ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.',
    );
  },
);
Then('no stack trace or raw error is shown outside technical details', async ({ harness }) => {
  expect(await harness.page!.locator('main').innerText()).not.toMatch(
    /Error:|ENOENT|EACCES|\bat .*\(.*:\d+/,
  );
});
When("I press «ذخیرهٔ گزارش» and cancel Main's save dialog", async ({ harness }) => {
  await harness.app!.evaluate(({ dialog }) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: true, filePath: '' });
  });
  await harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }).click();
});
Then(
  'no report file is written and no export message is announced',
  async ({ harness, libraryRoot }) => {
    await expect(
      harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
    ).toBeEnabled();
    // ui-preferences.json is the shell's own window/theme state (Plan 01-17), not an export.
    expect(
      (await readdir(libraryRoot)).filter(
        (file) =>
          file !== 'ui-preferences.json' && (file.endsWith('.json') || file.includes('.tmp-')),
      ),
    ).toEqual([]);
    expect(await harness.page!.getByRole('status').innerText()).not.toMatch(
      /گزارش ذخیره شد|ذخیرهٔ گزارش انجام نشد/,
    );
  },
);
Then('focus returns to «ذخیرهٔ گزارش»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
  ).toBeFocused();
});

When('I open System check before any run', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
});
Then('the empty heading is «هنوز بررسی انجام نشده»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: 'هنوز بررسی انجام نشده', exact: true }),
  ).toBeVisible();
});
Then(
  'the empty body is «برای دیدن وضعیت بخش‌های اصلی برنامه، بررسی را اجرا کنید.»',
  async ({ harness }) => {
    await expect(
      harness.page!.getByText('برای دیدن وضعیت بخش‌های اصلی برنامه، بررسی را اجرا کنید.', {
        exact: true,
      }),
    ).toBeVisible();
  },
);
Then('«اجرای بررسی» is available and no check has started automatically', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }),
  ).toBeEnabled();
  await expect(harness.page!.locator('[data-check-id]')).toHaveCount(0);
});
Then(
  '«ذخیرهٔ گزارش» is disabled with visible reason «پس از اجرای بررسی فعال می‌شود.»',
  async ({ harness }) => {
    await expect(
      harness.page!.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true }),
    ).toBeDisabled();
    await expect(
      harness.page!.getByText('پس از اجرای بررسی فعال می‌شود.', { exact: true }),
    ).toBeVisible();
  },
);

When('I press «اجرای بررسی»', async ({ harness }) => {
  if (Date.now() >= harness.coreStalledUntil)
    await harness.page!.evaluate(() => window.danesh.call('test.checkRun', { delayMs: 400 }));
  await harness.page!.evaluate(() => {
    const snapshots: { checkId: string; status: string }[][] = [];
    Object.assign(window, { __rowSnapshots: snapshots });
    new MutationObserver(() =>
      snapshots.push(
        [...document.querySelectorAll('[data-check-id]')].map((row) => ({
          checkId: row.getAttribute('data-check-id') ?? '',
          status: row.getAttribute('data-status') ?? '',
        })),
      ),
    ).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-status'],
    });
  });
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
});
Then('the Run control reads «در حال بررسی…» and cannot be re-triggered', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'در حال بررسی…', exact: true }),
  ).toBeDisabled();
});
Then(
  'each reported row moves from «در انتظار» through «در حال اجرا» to its final status',
  async ({ harness }) => {
    await expect(
      harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }),
    ).toBeEnabled();
    const snapshots = await harness.page!.evaluate(
      () =>
        (window as Window & { __rowSnapshots?: { checkId: string; status: string }[][] })
          .__rowSnapshots ?? [],
    );
    for (const id of ['app-launch', 'database']) {
      const states = snapshots.flatMap((rows) =>
        rows.filter((row) => row.checkId === id).map((row) => row.status),
      );
      expect(states).toContain('pending');
      expect(states).toContain('running');
      expect(states).toContain('pass');
      expect(states.indexOf('pending')).toBeLessThan(states.indexOf('running'));
      expect(states.indexOf('running')).toBeLessThan(states.indexOf('pass'));
    }
  },
);
Then('rows remain in report order throughout the run', async ({ harness }) => {
  const snapshots = await harness.page!.evaluate(
    () =>
      (window as Window & { __rowSnapshots?: { checkId: string; status: string }[][] })
        .__rowSnapshots ?? [],
  );
  // Rows appear once in report order and never reorder (the applicable check set grows with later plans).
  const final = snapshots.at(-1)!.map((row) => row.checkId);
  expect(final.slice(0, 2)).toEqual(['app-launch', 'database']);
  for (const rows of snapshots)
    if (rows.length) expect(rows.map((row) => row.checkId)).toEqual(final);
});
When('the run completes', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }),
  ).toBeEnabled();
});
Then('zero failed rows yield the summary «همهٔ بررسی‌ها موفق بود»', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('همهٔ بررسی‌ها موفق بود');
});
Then(
  /^any failed rows yield «\{n\} بررسی ناموفق بود\. برای هر مورد، توضیح و راه‌حل زیر آن نوشته شده است\.» with the actual count in Persian digits$/,
  async ({ harness }) => {
    await harness.page!.evaluate(() =>
      window.danesh.call('test.checkRun', {
        delayMs: 100,
        checks: [
          {
            checkId: 'app-launch',
            status: 'pass',
            durationMs: 1,
            detail: 'Fixture pass',
            fields: {},
          },
          {
            checkId: 'database',
            status: 'fail',
            durationMs: 1,
            detail: 'Fixture failure',
            fields: {},
          },
        ],
      }),
    );
    await harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }).click();
    await expect(harness.page!.getByRole('status')).toContainText(summary(1));
    expect(await harness.page!.locator('[data-status="fail"]').count()).toBe(1);
    expect(
      await harness.page!.evaluate(
        () => (window as Window & { __cspViolations?: string[] }).__cspViolations,
      ),
    ).toEqual([]);
  },
);
Then('focus stays on the Run control, now labelled «اجرای دوباره»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }),
  ).toBeFocused();
});
Given('a test check is held running for more than 10 seconds', async ({ harness }) => {
  await harness.page!.evaluate(() => window.danesh.call('test.checkRun', { delayMs: 11000 }));
});
When('I start the run and wait 10 seconds', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(
    harness.page!.getByText('اولین اجرا ممکن است کمی طول بکشد.', { exact: true }),
  ).toBeVisible({ timeout: 12000 });
});
Then('«اولین اجرا ممکن است کمی طول بکشد.» appears', async ({ harness }) => {
  await expect(
    harness.page!.getByText('اولین اجرا ممکن است کمی طول بکشد.', { exact: true }),
  ).toBeVisible();
});
Then('Run remains disabled until the run settles', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('button', { name: 'در حال بررسی…', exact: true }),
  ).toBeDisabled();
  await expect(
    harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
});
When('a test report contains pass and fail rows plus an unknown check id', async ({ harness }) => {
  await harness.page!.evaluate(() =>
    window.danesh.call('test.checkRun', {
      delayMs: 100,
      checks: [
        {
          checkId: 'app-launch',
          status: 'pass',
          durationMs: 1,
          detail: 'Fixture pass',
          fields: {},
        },
        {
          checkId: 'database',
          status: 'fail',
          durationMs: 1,
          detail: 'Fixture failure',
          fields: {},
        },
        {
          checkId: 'future-check',
          status: 'fail',
          durationMs: 1,
          detail: 'Fixture unknown',
          fields: {},
        },
      ],
    }),
  );
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(harness.page!.getByRole('status')).toContainText(summary(2));
});
Then('failures are not sorted ahead of the report order', async ({ harness }) => {
  expect(
    await harness
      .page!.locator('[data-check-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-check-id'))),
  ).toEqual(['app-launch', 'database', 'future-check']);
});
Then('no absent check is displayed as passed', async ({ harness }) => {
  await expect(harness.page!.locator('[data-check-id]')).toHaveCount(3);
  await expect(harness.page!.locator('[data-check-id="engine-llm"]')).toHaveCount(0);
});
Then(
  'the unknown id is displayed inside an LTR isolate with the generic result sentence',
  async ({ harness }) => {
    await expect(
      harness.page!.locator('[data-check-id="future-check"] h2 bdi[dir="ltr"]'),
    ).toHaveText('future-check');
    await expect(harness.page!.locator('[data-check-id="future-check"]')).toContainText(
      genericFail,
    );
  },
);
Then('every status shows its Persian word alongside its icon', async ({ harness }) => {
  for (const id of ['app-launch', 'database', 'future-check']) {
    const badge = harness.page!.locator(`[data-check-id="${id}"] .status-badge`);
    await expect(badge).toContainText(id === 'app-launch' ? 'موفق' : 'ناموفق');
    await expect(badge.locator('svg[aria-hidden="true"]')).toBeVisible();
  }
});
Given('the library folder also contains an apostrophe', ({ libraryRoot }) => {
  expect(libraryRoot).toContain("'");
});
Given('Danesh is launched with that exact library folder', async ({ harness }) => {
  await harness.launch();
});
When('I open «اطلاعات محیط اجرا» on System check', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await harness.page!.getByRole('button', { name: 'اطلاعات محیط اجرا', exact: true }).click();
});
Then('the exact library path appears inside an LTR isolate', async ({ harness, libraryRoot }) => {
  await expect(
    harness
      .page!.getByRole('region', { name: 'جزئیات فنی اطلاعات محیط اجرا', exact: true })
      .locator('bdi[dir="ltr"]')
      .filter({ hasText: libraryRoot }),
  ).toHaveText(libraryRoot);
});
Then(
  'app version, Electron version, OS name, OS version, architecture and system locale are shown',
  async ({ harness }) => {
    const info = SystemInfoSchema.parse(
      await harness.page!.evaluate(() => window.danesh.call('system.info', {})),
    );
    const expected = await harness.app!.evaluate(({ app }) => ({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      locale: app.getSystemLocale(),
      arch: process.arch,
    }));
    expect(info).toMatchObject(expected);
    expect(info.osName).toBeTruthy();
    expect(info.osVersion).toMatch(/\d/);
    for (const key of [
      'appVersion',
      'electronVersion',
      'osName',
      'osVersion',
      'arch',
      'locale',
    ] as const)
      await expect(
        harness.page!.getByRole('region', { name: 'جزئیات فنی اطلاعات محیط اجرا', exact: true }),
      ).toContainText(info[key]);
  },
);
Given('Core is unreachable', async ({ harness }) => {
  await harness.page!.evaluate(() => window.danesh.call('system.info', {}));
  await harness.page!.evaluate(() => window.danesh.call('test.coreStall', { ms: 12000 }));
  harness.coreStalledUntil = Date.now() + 12000;
});
Then(
  'a run-level alert reads «ارتباط با بخش اصلی برنامه برقرار نشد. دوباره تلاش کنید؛ اگر مشکل ماند، برنامه را ببندید و دوباره باز کنید.»',
  async ({ harness }) => {
    await expect(harness.page!.getByRole('alert')).toContainText(
      'ارتباط با بخش اصلی برنامه برقرار نشد. دوباره تلاش کنید؛ اگر مشکل ماند، برنامه را ببندید و دوباره باز کنید.',
      { timeout: 12000 },
    );
  },
);
Then('its action is «تلاش دوبارهٔ بررسی»', async ({ harness }) => {
  await expect(
    harness
      .page!.getByRole('alert')
      .getByRole('button', { name: 'تلاش دوبارهٔ بررسی', exact: true }),
  ).toBeEnabled();
});
When('Core becomes reachable and I press «تلاش دوبارهٔ بررسی»', async ({ harness }) => {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, harness.coreStalledUntil - Date.now() + 100)),
  );
  expect(
    await harness.page!.evaluate(() => window.danesh.call('system.ping', { n: 7 })),
  ).toMatchObject({ n: 7 });
  await harness.page!.getByRole('button', { name: 'تلاش دوبارهٔ بررسی', exact: true }).click();
});
Then('the run completes and the unreachable-Core alert clears', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toContainText('همهٔ بررسی‌ها موفق بود');
  await expect(harness.page!.getByRole('alert')).toHaveCount(0);
});

// Plan 01-08: runs only against the packaged DaneshTest build (DANESH_E2E_PACKAGED=1 sets DANESH_TEST_EXE).
Given(
  'the packaged test build of Danesh is launched with that library folder on System check',
  async ({ harness, $test }) => {
    $test.skip(
      !process.env.DANESH_TEST_EXE,
      'needs the packaged test build: run with DANESH_E2E_PACKAGED=1',
    );
    await harness.launch();
    await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  },
);
When('I run System check', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(
    harness.page!.getByRole('button', { name: 'اجرای دوباره', exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
});
Then('«قفل‌های امنیتی برنامه» shows «ناموفق»', async ({ harness }) => {
  const row = harness.page!.locator('[data-check-id="fuses"]');
  await expect(
    row.getByRole('heading', { name: 'قفل‌های امنیتی برنامه', exact: true }),
  ).toBeVisible();
  await expect(row.locator('.status-badge')).toHaveText('ناموفق');
  await row.getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
  // The only differing fuse in the test build is the inspect fuse Playwright needs.
  await expect(row.getByRole('region')).toContainText('EnableNodeCliInspectArguments');
});
Then(
  'its sentence is «تنظیمات امنیتی با نسخهٔ نهایی مطابقت ندارد. این نسخه برای آزمایش ساخته شده است.»',
  async ({ harness }) => {
    await expect(harness.page!.locator('[data-check-id="fuses"] .check-result')).toHaveText(
      'تنظیمات امنیتی با نسخهٔ نهایی مطابقت ندارد. این نسخه برای آزمایش ساخته شده است.',
    );
  },
);

// Plan 01-09: packaging probes, responsiveness and single-probe failure isolation.
const engineIds = ['engine-llm', 'engine-ocr', 'engine-tts'] as const;
const technical = async (
  harness: { page: import('@playwright/test').Page | undefined },
  checkId: string,
) => {
  const row = harness.page!.locator(`[data-check-id="${checkId}"]`);
  const trigger = row.getByRole('button', { name: 'جزئیات فنی', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const region = row.getByRole('region');
  return {
    text: await region.innerText(),
    fields: JSON.parse(await region.locator('pre').innerText()) as Record<string, unknown>,
  };
};
Given(
  'Danesh is launched with that library folder and all three bundled probe assets are available',
  async ({ harness }) => {
    const lock = JSON.parse(readFileSync('tools/probes.lock.json', 'utf8')) as {
      entries: { target: string }[];
    };
    const missing = lock.entries
      .filter((entry) => !existsSync(join('resources/probes', entry.target)))
      .map((entry) => entry.target);
    expect(missing, 'run pnpm probes:fetch').toEqual([]);
    await harness.launch();
    await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  },
);
// Regexes: parentheses are optional-text syntax in Cucumber expressions.
Then(
  /^«موتور مدل زبانی \(نمونهٔ آزمایشی\)», «موتور تشخیص متن \(نمونهٔ آزمایشی\)» and «موتور گفتار \(نمونهٔ آزمایشی\)» show «موفق»$/,
  async ({ harness }) => {
    for (const [id, name] of [
      ['engine-llm', 'موتور مدل زبانی (نمونهٔ آزمایشی)'],
      ['engine-ocr', 'موتور تشخیص متن (نمونهٔ آزمایشی)'],
      ['engine-tts', 'موتور گفتار (نمونهٔ آزمایشی)'],
    ] as const) {
      const row = harness.page!.locator(`[data-check-id="${id}"]`);
      await expect(row.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(row.locator('.status-badge')).toHaveText('موفق');
    }
  },
);
Then(
  "each row's technical details contain a distinct host process id and a lowercase 64-hex output SHA-256",
  async ({ harness }) => {
    const pids = new Set<number>();
    for (const id of engineIds) {
      const { text, fields } = await technical(harness, id);
      expect(text).toMatch(/outputSha256\s+[0-9a-f]{64}\b/);
      expect(Number.isInteger(fields.hostPid)).toBe(true);
      pids.add(fields.hostPid as number);
    }
    expect(pids.size).toBe(3);
  },
);
Then('the host ids differ from Main, Core and the renderer', async ({ harness }) => {
  const mainPid = await harness.app!.evaluate(() => process.pid);
  const rendererPid = await harness.app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
  );
  for (const id of engineIds) {
    const { fields } = await technical(harness, id);
    expect([mainPid, rendererPid, fields.corePid]).not.toContain(fields.hostPid);
  }
});
Then('model names, versions and hashes appear only inside «جزئیات فنی»', async ({ harness }) => {
  const outside = await harness.page!.locator('main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.technical').forEach((node) => {
      node.remove();
    });
    return copy.innerText;
  });
  expect(outside).not.toMatch(
    /stories15M|gguf|traineddata|mana|onnx|tesseract|llama|\b[0-9a-f]{64}\b|\d+\.\d+\.\d+/i,
  );
  for (const id of engineIds)
    await expect(harness.page!.locator(`[data-check-id="${id}"] h2`)).toContainText(
      '(نمونهٔ آزمایشی)',
    );
});

When('the LLM, OCR and TTS probes run concurrently', async ({ harness }) => {
  const page = harness.page!;
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  // All three engine rows are running at the same moment.
  await expect
    .poll(
      () =>
        page
          .locator(
            engineIds.map((id) => `[data-check-id="${id}"][data-status="running"]`).join(', '),
          )
          .count(),
      { intervals: [20] },
    )
    .toBe(3);
});
Then('navigation and keyboard input remain responsive', async ({ harness }) => {
  const page = harness.page!;
  const delays: number[] = [];
  for (let press = 0; press < 5; press++) {
    const before = await page.evaluate(() => document.activeElement?.outerHTML ?? '');
    const started = Date.now();
    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.outerHTML ?? ''))
      .not.toBe(before);
    delays.push(Date.now() - started);
  }
  expect(Math.max(...delays)).toBeLessThan(250);
});
Then('«پاسخ‌گویی برنامه» shows «موفق»', async ({ harness }) => {
  const row = harness.page!.locator('[data-check-id="ui-responsive"]');
  await expect(row.getByRole('heading', { name: 'پاسخ‌گویی برنامه', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(row.locator('.status-badge')).toHaveText('موفق');
});
Then(
  'its technical details report at least 100 heartbeat samples, p95 lateness at most 50 ms and maximum lateness at most 250 ms',
  async ({ harness }) => {
    const { fields } = await technical(harness, 'ui-responsive');
    expect(fields.method).toBe('nearest-rank');
    expect(fields.sampleCount as number).toBeGreaterThanOrEqual(100);
    expect(fields.p95 as number).toBeLessThanOrEqual(50);
    expect(fields.max as number).toBeLessThanOrEqual(250);
  },
);

const canned = (checkId: string) => ({
  checkId,
  status: 'pass',
  durationMs: 1,
  detail: 'Fixture pass',
  fields: {},
});
Given(
  'the check-run fixture supplies successful results for the other checks',
  async ({ harness }) => {
    await harness.page!.evaluate(
      (checks) => window.danesh.call('test.checkRun', { delayMs: 0, checks, live: ['engine-ocr'] }),
      ['app-launch', 'database', 'engine-llm', 'engine-tts', 'ui-responsive'].map(canned),
    );
  },
);
Given('the OCR probe is forced to crash on every execution in this run', async ({ harness }) => {
  await harness.page!.evaluate(() =>
    window.danesh.call('test.probeFault', { kind: 'ocr', mode: 'crash' }),
  );
});
Then(/^only «موتور تشخیص متن \(نمونهٔ آزمایشی\)» shows «ناموفق»$/, async ({ harness }) => {
  const failed = harness.page!.locator('[data-check-id][data-status="fail"]');
  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute('data-check-id', 'engine-ocr');
  const { fields } = await technical(harness, 'engine-ocr');
  expect(fields.errorClass).toBe('HostExited');
  expect(fields.hostExitCode).toBe(1);
});
Then('every other expected row is still reported', async ({ harness }) => {
  expect(
    await harness
      .page!.locator('[data-check-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-check-id'))),
  ).toEqual(['app-launch', 'database', 'engine-llm', 'engine-ocr', 'engine-tts', 'ui-responsive']);
});
Then(
  'the summary reads «۱ بررسی ناموفق بود. برای هر مورد، توضیح و راه‌حل زیر آن نوشته شده است.»',
  async ({ harness }) => {
    await expect(harness.page!.getByRole('status')).toContainText(
      '۱ بررسی ناموفق بود. برای هر مورد، توضیح و راه‌حل زیر آن نوشته شده است.',
    );
  },
);
