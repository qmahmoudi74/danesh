import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { Given, Then, When } from './fixtures.ts';
import { importFromLibrary, openLibrary, pickFile } from './pdf-library.steps.ts';

const require = createRequire(import.meta.url);
const Sqlite = require('better-sqlite3') as typeof import('better-sqlite3');
const FIXTURES = resolve('packages/engines/test/fixtures/pdf');
type Truth = { title: string; pages: { kind: string; text?: string }[][] };
const truthOf = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name.replace(/\.pdf$/, '.truth.json')), 'utf8')) as Truth;
const fa = (value: number) => new Intl.NumberFormat('fa-IR').format(value);

const opened = new WeakMap<object, { title: string; blockIds?: string[]; startedAt?: number }>();

function readDb<T>(libraryRoot: string, sql: string): T[] {
  const db = new Sqlite(join(libraryRoot, 'danesh.db'), { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}

const reader = (page: Page) => page.getByRole('article', { name: 'متن استخراج‌شده' });

async function openText(page: Page, title: string) {
  await openLibrary(page);
  await page.getByRole('button', { name: `باز کردن ${title}`, exact: true }).click();
}

Given(
  /^the fixture «(.+\.pdf)» has been imported$/,
  async ({ harness, libraryRoot }, name: string) => {
    await pickFile(harness, libraryRoot, name, readFileSync(join(FIXTURES, name)));
    await importFromLibrary(harness.page!);
    const { title } = truthOf(name);
    await expect(
      harness.page!.getByRole('button', { name: `باز کردن ${title}`, exact: true }),
    ).toBeVisible();
    opened.set(harness, { title });
  },
);

When('I open it in the semantic Reader', async ({ harness }) => {
  await openText(harness.page!, opened.get(harness)!.title);
});

When('I start the extraction', async ({ harness }) => {
  // Record every progress value the page shows, so per-page progress is observed, not assumed.
  await harness.page!.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { __progress: seen });
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]');
      const text = bar?.getAttribute('aria-valuetext');
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await harness.page!.getByRole('button', { name: 'استخراج متن', exact: true }).click();
});

Then(
  /^extraction progress is shown per page until all (\d+) pages are done$/,
  async ({ harness }, total: string) => {
    await expect(reader(harness.page!)).toBeVisible({ timeout: 60_000 });
    const seen = await harness.page!.evaluate(
      () => (window as { __progress?: string[] }).__progress ?? [],
    );
    expect(seen[0]).toBe(`صفحهٔ ${fa(0)} از ${fa(Number(total))}`);
    expect(seen.every((value) => /^صفحهٔ [۰-۹]+ از [۰-۹]+$/.test(value))).toBe(true);
  },
);

Then(
  'the reader shows the heading «فصل ۱: آشنایی با کتابخانهٔ دانش» and Persian paragraphs in logical order',
  async ({ harness }) => {
    const text = reader(harness.page!);
    await expect(
      text.getByRole('heading', { name: 'فصل ۱: آشنایی با کتابخانهٔ دانش', exact: true }),
    ).toBeVisible();
    const truth = truthOf('persian-mixed.pdf');
    for (const block of truth.pages[0]!.filter((item) => item.kind === 'paragraph'))
      await expect(text.getByText(block.text!, { exact: true })).toHaveAttribute('dir', /rtl|auto/);
  },
);

Then('the mixed sentence keeps «E = mc²» and «x ≤ 10» intact', async ({ harness }) => {
  const paragraph = reader(harness.page!).locator('p', { hasText: 'E = mc²' });
  await expect(paragraph).toContainText('x ≤ 10');
  await expect(paragraph).toContainText('رابطهٔ معروف E = mc² را در فیزیک');
});

Then(/^page (\d+) is marked as needing OCR$/, async ({ harness }, pageNumber: string) => {
  await expect(
    harness.page!.getByText(`صفحه‌های نیازمند OCR: ${fa(Number(pageNumber))}`, { exact: true }),
  ).toBeVisible();
  const section = reader(harness.page!).getByRole('region', {
    name: `صفحهٔ ${fa(Number(pageNumber))}`,
  });
  await expect(section.getByText(/^نیازمند OCR/)).toBeVisible();
});

Then('every block carries its page number', async ({ harness }) => {
  const mismatches = await reader(harness.page!).evaluate((article) =>
    [...article.querySelectorAll<HTMLElement>('section[data-page]')].flatMap((section) =>
      [...section.querySelectorAll<HTMLElement>('[data-block-id]')]
        .filter((block) => block.dataset.page !== section.dataset.page)
        .map((block) => block.dataset.blockId),
    ),
  );
  expect(mismatches).toEqual([]);
  const ids = await reader(harness.page!)
    .locator('[data-block-id]')
    .evaluateAll((blocks) => blocks.map((block) => (block as HTMLElement).dataset.blockId!));
  expect(ids.length).toBeGreaterThan(5);
  opened.set(harness, { ...opened.get(harness)!, blockIds: ids });
});

Then("the reader's text can be selected and copied", async ({ harness }) => {
  const expected = truthOf('persian-mixed.pdf').pages[0]![1]!.text!;
  await harness.page!.evaluate((text) => {
    const target = [...document.querySelectorAll('p')].find((p) => p.textContent === text)!;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  }, expected);
  await harness.app!.evaluate(async ({ BrowserWindow, clipboard }) => {
    await clipboard.writeText('');
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    // A real key press through Chromium's input path, as a user's Ctrl+C.
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: ['control'] });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: ['control'] });
  });
  await expect
    .poll(() => harness.app!.evaluate(async ({ clipboard }) => (await clipboard.readText()).trim()))
    .toBe(expected);
});

When('I inspect the original excerpt for the mixed sentence', async ({ harness }) => {
  const block = reader(harness.page!).locator('.reader-block', {
    has: harness.page!.locator('p.reader-paragraph', { hasText: 'E = mc²' }),
  });
  await block.locator('summary').click();
});
Then(
  'its stored raw text and source-block provenance are shown without a PDF page viewer',
  async ({ harness, libraryRoot }) => {
    const block = reader(harness.page!).locator('.reader-block', {
      has: harness.page!.locator('p.reader-paragraph', { hasText: 'E = mc²' }),
    });
    const id = await block.locator('[data-block-id]').getAttribute('data-block-id');
    const rows = readDb<{ block_id: string; raw_text: string; page_number: number }>(
      libraryRoot,
      'SELECT block_id, raw_text, page_number FROM extracted_block',
    );
    const stored = rows.find((row) => row.block_id === id)!;
    expect(stored).toBeDefined();
    await expect(block.locator('blockquote')).toHaveText(stored.raw_text);
    await expect(block.locator('details')).toContainText(id!);
    await expect(block.locator('details')).toContainText('صفحهٔ ' + fa(stored.page_number));
    await expect(harness.page!.locator('canvas')).toHaveCount(0);
  },
);

Then(
  "opening the document's extracted text shows the same blocks without extracting again",
  async ({ harness, libraryRoot }) => {
    const before = opened.get(harness)!;
    const [row] = readDb<{ startedAt: number; state: string }>(
      libraryRoot,
      'SELECT started_at AS startedAt, state FROM extraction',
    );
    expect(row?.state).toBe('completed');
    await openText(harness.page!, before.title);
    await expect(reader(harness.page!)).toBeVisible();
    await expect(
      harness.page!.getByRole('button', { name: 'استخراج متن', exact: true }),
    ).toHaveCount(0);
    const ids = await reader(harness.page!)
      .locator('[data-block-id]')
      .evaluateAll((blocks) => blocks.map((block) => (block as HTMLElement).dataset.blockId!));
    expect(ids).toEqual(before.blockIds);
    const [after] = readDb<{ startedAt: number }>(
      libraryRoot,
      'SELECT started_at AS startedAt FROM extraction',
    );
    expect(after?.startedAt).toBe(row?.startedAt);
  },
);

Then(
  'the reader shows the heading «Results» and the paragraph text in left-to-right blocks',
  async ({ harness }) => {
    const text = reader(harness.page!);
    await expect(text).toBeVisible({ timeout: 60_000 });
    await expect(text.getByRole('heading', { name: 'Results', exact: true })).toHaveAttribute(
      'dir',
      'ltr',
    );
    const truth = truthOf('english-report.pdf');
    await expect(
      text.locator('p.reader-paragraph').filter({ hasText: truth.pages[1]![1]!.text! }),
    ).toHaveAttribute('dir', 'ltr');
  },
);

Given(
  /^its extraction stopped after page (\d+) when Danesh closed$/,
  async ({ harness, libraryRoot }, pageNumber: string) => {
    // Relaunch with the test hook that halts the run after that page, start it, and wait for the stored page.
    await harness.close();
    harness.extraEnv.DANESH_TEST_EXTRACTION_STOP_AFTER_PAGE = pageNumber;
    await harness.launch();
    delete harness.extraEnv.DANESH_TEST_EXTRACTION_STOP_AFTER_PAGE;
    await openText(harness.page!, opened.get(harness)!.title);
    await harness.page!.getByRole('button', { name: 'استخراج متن', exact: true }).click();
    await expect
      .poll(
        () =>
          readDb<{ done: number }>(libraryRoot, 'SELECT pages_done AS done FROM extraction')[0]
            ?.done,
        {
          timeout: 30_000,
        },
      )
      .toBe(Number(pageNumber));
  },
);
Then(
  /^the extraction is shown as interrupted after (\d+) of (\d+) pages$/,
  async ({ harness }, done: string, total: string) => {
    await expect(
      harness.page!.getByText(
        `استخراج متن نیمه‌کاره ماند (${fa(Number(done))} از ${fa(Number(total))} صفحه).`,
        { exact: true },
      ),
    ).toBeVisible();
  },
);
When('I continue the extraction', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'ادامهٔ استخراج', exact: true }).click();
});
Then(
  /^all (\d+) pages are extracted and page 1 was not extracted twice$/,
  async ({ harness, libraryRoot }, total: string) => {
    await expect(reader(harness.page!)).toBeVisible({ timeout: 60_000 });
    await expect(reader(harness.page!).locator('section[data-page]')).toHaveCount(Number(total));
    // A second insert of page 1 would violate the page's primary key and fail the run instead of completing it.
    expect(
      readDb<{ state: string; done: number }>(
        libraryRoot,
        'SELECT state, pages_done AS done FROM extraction',
      ),
    ).toEqual([{ state: 'completed', done: Number(total) }]);
  },
);

Given('the stored original has been altered on disk', ({ libraryRoot }) => {
  const shards = join(libraryRoot, 'blobs', 'sha256');
  const blobs = readdirSync(shards, { recursive: true })
    .map(String)
    .filter((name) => /[0-9a-f]{64}$/.test(name));
  expect(blobs).toHaveLength(1);
  appendFileSync(join(shards, blobs[0]!), 'tampered');
});
Then(
  'Danesh says the stored file failed its integrity check and nothing was extracted',
  async ({ harness, libraryRoot }) => {
    await expect(harness.page!.getByRole('alert')).toContainText('بررسی درستی آن ناموفق بود', {
      timeout: 30_000,
    });
    expect(
      readDb<{ count: number }>(libraryRoot, 'SELECT count(*) AS count FROM extracted_page'),
    ).toEqual([{ count: 0 }]);
  },
);
