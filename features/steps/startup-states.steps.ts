import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { newerDatabaseBody, readOnlyDatabaseBody } from '../../apps/renderer/src/lib/copy.ts';
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

// Plan 01-11: start-up states driven by real library files created before launch.
const Sqlite = require('better-sqlite3') as typeof import('better-sqlite3');
/** The newest schema this build ships: one numbered migration file per version. */
const latestSchemaVersion = readdirSync('packages/storage/migrations').filter((name) =>
  /^\d{4}_.+\.sql$/.test(name),
).length;
/** The test build appends one failing migration after the shipped ones (apps/core/src/boot.ts). */
const failingMigrationId = String(latestSchemaVersion + 1).padStart(4, '0');
const initialSql = readFileSync('packages/storage/migrations/0001_init.sql', 'utf8');
const libraryHashes = new WeakMap<object, string>();
const refusedTitle = 'این داده‌ها با نسخهٔ جدیدتری از دانش ساخته شده‌اند';
const readOnlyTitle = 'برنامه در حالت فقط‌خواندنی باز شد';
const infoTitle = 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست';

/** A library at schema version 1 (the checksum is the same LF-normalized SHA-256 Core computes). */
function createLibrary(root: string, { userVersion = 1, rows = [] as number[] } = {}): string {
  mkdirSync(root, { recursive: true });
  const path = join(root, 'danesh.db');
  const db = new Sqlite(path);
  db.exec(initialSql);
  db.prepare('INSERT INTO schema_migration VALUES (?, ?, ?, ?)').run(
    '0001',
    createHash('sha256').update(initialSql.replace(/\r\n/g, '\n')).digest('hex'),
    Date.now(),
    '0.0.1',
  );
  for (const at of rows) db.prepare('INSERT INTO system_check_probe (at) VALUES (?)').run(at);
  db.pragma(`user_version = ${userVersion}`);
  db.close();
  return path;
}
const readRows = (path: string) => {
  const db = new Sqlite(path, { readonly: true, fileMustExist: true });
  try {
    return (
      db.prepare('SELECT at FROM system_check_probe ORDER BY id').all() as { at: number }[]
    ).map((row) => row.at);
  } finally {
    db.close();
  }
};
const readVersion = (path: string) => {
  const db = new Sqlite(path, { readonly: true, fileMustExist: true });
  try {
    return db.pragma('user_version', { simple: true });
  } finally {
    db.close();
  }
};
const outsideTechnical = (harness: { page: Page | undefined }) =>
  harness.page!.locator('main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.technical').forEach((node) => {
      node.remove();
    });
    return copy.innerText;
  });
const openDetails = async (harness: { page: Page | undefined }) => {
  await harness
    .page!.getByRole('main')
    .getByRole('button', { name: 'جزئیات فنی', exact: true })
    .click();
  return harness
    .page!.getByRole('region', { name: 'جزئیات فنی وضعیت پایگاه داده', exact: true })
    .innerText();
};
const reachSystemCheck = async (harness: { page: Page | undefined }) => {
  await harness
    .page!.getByRole('navigation')
    .getByRole('link', { name: 'بررسی سامانه', exact: true })
    .click();
  await expect(
    harness.page!.getByRole('heading', { name: 'بررسی سامانه', level: 1, exact: true }),
  ).toBeVisible();
};
const checkDatabaseFailure = async (harness: { page: Page | undefined }, body: string) => {
  await harness.page!.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  const row = harness.page!.locator('[data-check-id="database"]');
  await expect(row).toHaveAttribute('data-status', 'fail');
  await expect(row.getByText(body, { exact: true })).toBeVisible();
};

Given('that library contains a database with a valid pending migration', ({ libraryRoot }) => {
  createLibrary(libraryRoot);
});
When('Danesh is launched with that library folder and Core becomes ready', async ({ harness }) => {
  await harness.launch();
  await expect(harness.page!.getByRole('heading', { name: infoTitle, exact: true })).toBeVisible();
});
Then('the pending migration has been applied', ({ libraryRoot }) => {
  expect(readVersion(join(libraryRoot, 'danesh.db'))).toBe(latestSchemaVersion);
});
Then('Home shows «نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست»', async ({ harness }) => {
  await expect(harness.page!.getByRole('heading', { name: infoTitle, exact: true })).toBeVisible();
});

Given(
  'that library contains a database from a newer Danesh with its SHA-256 recorded',
  ({ libraryRoot, harness }) => {
    const path = createLibrary(libraryRoot, { userVersion: 99 });
    libraryHashes.set(harness, createHash('sha256').update(readFileSync(path)).digest('hex'));
  },
);
Then('Home shows «این داده‌ها با نسخهٔ جدیدتری از دانش ساخته شده‌اند»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: refusedTitle, exact: true }),
  ).toBeVisible();
});
Then("the database file's SHA-256 is unchanged", async ({ harness, libraryRoot }) => {
  await harness.close();
  expect(
    createHash('sha256')
      .update(readFileSync(join(libraryRoot, 'danesh.db')))
      .digest('hex'),
  ).toBe(libraryHashes.get(harness));
});
Then('database and supported schema versions appear only in «جزئیات فنی»', async ({ harness }) => {
  // The app was closed by the previous step; relaunch to inspect the screen.
  await harness.launch();
  await expect(
    harness.page!.getByRole('heading', { name: refusedTitle, exact: true }),
  ).toBeVisible();
  expect(await outsideTechnical(harness)).not.toMatch(/99|\b2\b|۹۹/);
  const details = await openDetails(harness);
  expect(details).toMatch(/dbUserVersion\s+99/);
  expect(details).toMatch(new RegExp(`supportedVersion\\s+${latestSchemaVersion}\\b`));
});
Then(/^«بررسی سامانه» remains reachable through Home and the sidebar$/, async ({ harness }) => {
  await harness
    .page!.getByRole('main')
    .getByRole('button', { name: 'بررسی سامانه', exact: true })
    .click();
  await expect(
    harness.page!.getByRole('heading', { name: 'بررسی سامانه', level: 1, exact: true }),
  ).toBeVisible();
  await harness
    .page!.getByRole('navigation')
    .getByRole('link', { name: 'خانه', exact: true })
    .click();
  await reachSystemCheck(harness);
  await checkDatabaseFailure(harness, newerDatabaseBody);
});

Given(
  'that library contains prior rows and a pending migration that will fail',
  ({ libraryRoot, harness }) => {
    createLibrary(libraryRoot, { rows: [11, 22] });
    harness.extraEnv.DANESH_TEST_FAIL_MIGRATION = '1';
  },
);
Then('Home shows «برنامه در حالت فقط‌خواندنی باز شد»', async ({ harness }) => {
  await expect(
    harness.page!.getByRole('heading', { name: readOnlyTitle, exact: true }),
  ).toBeVisible();
});
Then(
  '«جزئیات فنی» shows the verified backup file path and failed migration id',
  async ({ harness, libraryRoot }) => {
    const details = await openDetails(harness);
    expect(details).toContain(join(libraryRoot, 'backups'));
    expect(details).toMatch(new RegExp(`failedMigrationId\\s+${failingMigrationId}\\b`));
  },
);
Then(
  'those technical values are absent from the primary Persian message',
  async ({ harness, libraryRoot }) => {
    const text = await outsideTechnical(harness);
    expect(text).not.toContain(libraryRoot);
    expect(text).not.toContain(failingMigrationId);
  },
);
Then(
  /^a write request is refused with READ_ONLY \(the sample job will use the same guard in a later plan\)$/,
  async ({ harness }) => {
    const code = await harness.page!.evaluate(async () => {
      try {
        await window.danesh.call('test.writeProbe', {});
        return 'unexpected-success';
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(code).toBe('READ_ONLY');
  },
);
Then(
  'the prior rows are intact and «بررسی سامانه» remains reachable',
  async ({ harness, libraryRoot }) => {
    expect(readRows(join(libraryRoot, 'danesh.db'))).toEqual([11, 22]);
    await reachSystemCheck(harness);
    await checkDatabaseFailure(harness, readOnlyDatabaseBody);
    expect(readRows(join(libraryRoot, 'danesh.db'))).toEqual([11, 22]);
  },
);

Given('that library contains known rows at the previous schema version', ({ libraryRoot }) => {
  createLibrary(libraryRoot, { rows: [7, 8, 9] });
});
When(
  'Danesh is launched with that library folder and completes its upgrade',
  async ({ harness }) => {
    await harness.launch();
    await expect(
      harness.page!.getByRole('heading', { name: infoTitle, exact: true }),
    ).toBeVisible();
  },
);
Then(/^the known rows are preserved and "backups\/" gains exactly one file$/, ({ libraryRoot }) => {
  expect(readRows(join(libraryRoot, 'danesh.db'))).toEqual([7, 8, 9]);
  expect(
    readdirSync(join(libraryRoot, 'backups')).filter((name) => name.endsWith('.db')),
  ).toHaveLength(1);
});
When('Danesh is closed and relaunched with the same library folder', async ({ harness }) => {
  await harness.close();
  await harness.launch();
  await expect(harness.page!.getByRole('heading', { name: infoTitle, exact: true })).toBeVisible();
});
Then('the known rows remain and no additional backup is created', ({ libraryRoot }) => {
  expect(readRows(join(libraryRoot, 'danesh.db'))).toEqual([7, 8, 9]);
  expect(
    readdirSync(join(libraryRoot, 'backups')).filter((name) => name.endsWith('.db')),
  ).toHaveLength(1);
});
