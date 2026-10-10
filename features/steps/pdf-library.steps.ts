import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { buildCorruptPdf, buildPdf } from '../../apps/core/test/fixtures/pdf-fixtures.ts';
import { Then, When } from './fixtures.ts';

const persianDigits = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
const sampleBytes = buildPdf({
  pages: ['Danesh page one', 'Danesh page two', 'Danesh page three'],
  title: 'مبانی Danesh',
});
const pageWidths = new WeakMap<object, number>();

/** Writes a source file outside the library's own folders and makes Main's open dialog return it. */
export async function pickFile(
  harness: { app: import('@playwright/test').ElectronApplication | undefined },
  libraryRoot: string,
  fileName: string,
  bytes: Buffer,
) {
  const folder = join(libraryRoot, 'منابع کاربر');
  mkdirSync(folder, { recursive: true });
  const path = join(folder, fileName);
  writeFileSync(path, bytes);
  await harness.app!.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [chosen] });
  }, path);
}

export async function openLibrary(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'کتابخانه', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'کتابخانه', level: 1, exact: true }),
  ).toBeVisible();
}

export async function importFromLibrary(page: Page) {
  await openLibrary(page);
  await page.getByRole('main').getByRole('button', { name: 'افزودن PDF', exact: true }).click();
}

export const documentRows = (page: Page) =>
  page.getByRole('list', { name: 'فایل‌های کتابخانه' }).getByRole('listitem');

async function expectPageDrawn(page: Page, number: number, total: number) {
  const canvas = page.getByRole('img', {
    name: `صفحهٔ ${persianDigits(number)} از ${persianDigits(total)}`,
    exact: true,
  });
  await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 15_000 });
  // The canvas holds real ink, not only the white page background.
  const inked = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const pixels = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data;
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! < 128) dark++;
    return dark;
  });
  expect(inked).toBeGreaterThan(100);
  // pdf.js and its worker run under the unchanged content security policy.
  expect(
    await page.evaluate(() => (window as { __cspViolations?: string[] }).__cspViolations),
  ).toEqual([]);
  await expect(
    page.getByText(`صفحهٔ ${persianDigits(number)} از ${persianDigits(total)}`, { exact: true }),
  ).toBeVisible();
}

When(
  'I choose «افزودن PDF» and pick the 3-page file «کتاب نمونه.pdf» titled «مبانی Danesh»',
  async ({ harness, libraryRoot }) => {
    await pickFile(harness, libraryRoot, 'کتاب نمونه.pdf', sampleBytes);
    await importFromLibrary(harness.page!);
    await expect(harness.page!.getByText('«مبانی Danesh» به کتابخانه افزوده شد.')).toBeVisible();
  },
);
Then('the Library lists «مبانی Danesh» with 3 pages', async ({ harness }) => {
  const rows = documentRows(harness.page!);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('مبانی Danesh');
  await expect(rows.first()).toContainText(`${persianDigits(3)} صفحه`);
  await expect(rows.first()).toContainText('کتاب نمونه.pdf');
});
Then('the original bytes are stored once in the content-addressed store', ({ libraryRoot }) => {
  const stored = readdirSync(join(libraryRoot, 'blobs', 'sha256'), { recursive: true })
    .map(String)
    .filter((name) => /[0-9a-f]{64}$/.test(name));
  const hash = createHash('sha256').update(sampleBytes).digest('hex');
  expect(stored.map((name) => name.slice(-64))).toEqual([hash]);
});
When('I open «مبانی Danesh» from the Library', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'باز کردن مبانی Danesh', exact: true }).click();
});
Then(
  /^page (\d+) of (\d+) is drawn inside Danesh$/,
  async ({ harness }, number: string, total: string) => {
    await expectPageDrawn(harness.page!, Number(number), Number(total));
  },
);
When('I go to the next page', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'صفحهٔ بعد', exact: true }).click();
});
When('I zoom in', async ({ harness }) => {
  const canvas = harness.page!.locator('canvas.viewer-page');
  pageWidths.set(harness, (await canvas.boundingBox())!.width);
  await harness.page!.getByRole('button', { name: 'بزرگ‌نمایی', exact: true }).click();
});
Then('the page is drawn wider than before', async ({ harness }) => {
  const canvas = harness.page!.locator('canvas.viewer-page');
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(pageWidths.get(harness)! * 1.2);
});
Then('the Library still lists «مبانی Danesh» once', async ({ harness }) => {
  await openLibrary(harness.page!);
  await expect(documentRows(harness.page!)).toHaveCount(1);
  await expect(documentRows(harness.page!).first()).toContainText('مبانی Danesh');
});
Then('opening it draws page 1 of 3', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'باز کردن مبانی Danesh', exact: true }).click();
  await expectPageDrawn(harness.page!, 1, 3);
});

When('the 3-page file «کتاب نمونه.pdf» has been imported', async ({ harness, libraryRoot }) => {
  await pickFile(harness, libraryRoot, 'کتاب نمونه.pdf', sampleBytes);
  await importFromLibrary(harness.page!);
  await expect(documentRows(harness.page!)).toHaveCount(1);
});
When(
  'I import the same bytes again under the name «copy.pdf»',
  async ({ harness, libraryRoot }) => {
    await pickFile(harness, libraryRoot, 'copy.pdf', sampleBytes);
    await harness
      .page!.getByRole('main')
      .getByRole('button', { name: 'افزودن PDF', exact: true })
      .click();
  },
);
Then('the Library still lists exactly one document', async ({ harness }) => {
  await expect(harness.page!.getByText('از قبل در کتابخانه بود')).toBeVisible();
  await expect(documentRows(harness.page!)).toHaveCount(1);
});
Then('Danesh says it was already in the Library', async ({ harness }) => {
  await expect(
    harness.page!.getByText('«مبانی Danesh» از قبل در کتابخانه بود؛ دوباره افزوده نشد.'),
  ).toBeVisible();
});

const unusable: Record<string, () => Buffer> = {
  'non-PDF': () => Buffer.from('This is a plain text file, not a PDF.\n'),
  encrypted: () => buildPdf({ pages: ['secret'], encrypted: true }),
  damaged: () => buildCorruptPdf(),
};
When(
  /^I choose «افزودن PDF» and pick a (non-PDF|encrypted|damaged) file$/,
  async ({ harness, libraryRoot }, kind: string) => {
    await pickFile(harness, libraryRoot, `${kind}.pdf`, unusable[kind]!());
    await importFromLibrary(harness.page!);
  },
);
Then(/^Danesh shows «(.+)»$/, async ({ harness }, message: string) => {
  await expect(harness.page!.getByRole('alert')).toHaveText(message);
});
Then('the Library is still empty', async ({ harness }) => {
  await expect(
    harness.page!.getByText('هنوز فایلی در کتابخانه نیست.', { exact: true }),
  ).toBeVisible();
  await expect(documentRows(harness.page!)).toHaveCount(0);
});
When('I choose «افزودن PDF» and cancel the file picker', async ({ harness }) => {
  await harness.app!.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: true, filePaths: [] });
  });
  await importFromLibrary(harness.page!);
});
Then('no message is shown', async ({ harness }) => {
  const button = harness
    .page!.getByRole('main')
    .getByRole('button', { name: 'افزودن PDF', exact: true });
  await expect(button).toBeEnabled();
  await expect(harness.page!.locator('main .banner')).toHaveCount(0);
});
