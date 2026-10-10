// Prints the PDF extraction fixtures with Chromium (a real PDF producer) and writes their ground truth.
// Run with Electron, offline:  pnpm exec electron tools/print-pdf-fixtures.cjs
// Output: packages/engines/test/fixtures/pdf/<name>.pdf and <name>.truth.json (expected blocks per page).
const { app, BrowserWindow } = require('electron');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const out = join(__dirname, '..', 'packages', 'engines', 'test', 'fixtures', 'pdf');

/** Each page is a list of blocks; `image` pages hold text only as pixels (a scan), so they have no truth text. */
const fixtures = {
  'persian-mixed': {
    lang: 'fa',
    dir: 'rtl',
    title: 'مبانی یادگیری با دانش',
    pages: [
      [
        { kind: 'heading', text: 'فصل ۱: آشنایی با کتابخانهٔ دانش' },
        {
          kind: 'paragraph',
          text: 'دانش یک محیط یادگیری محلی است که فایل‌های PDF شما را نگه می‌دارد و بدون اینترنت کار می‌کند. هدف آن یادگیری پایدار است، نه فقط خواندن سریع.',
        },
        {
          kind: 'paragraph',
          text: 'در این فصل می‌خواهیم با سه بخش اصلی آشنا شویم: کتابخانه، خواننده و تمرین. هر بخش جداگانه بررسی می‌شود.',
        },
        { kind: 'heading', text: 'نکته‌های مهم' },
        {
          kind: 'paragraph',
          text: 'فایل اصلی هرگز تغییر نمی‌کند و متن استخراج‌شده جداگانه ذخیره می‌شود.',
        },
      ],
      [
        { kind: 'heading', text: 'فصل ۲: نمادهای فنی و متن دوزبانه' },
        {
          kind: 'paragraph',
          text: 'رابطهٔ معروف E = mc² را در فیزیک دیده‌اید؛ همچنین شرط x ≤ 10 در برنامه‌نویسی رایج است.',
        },
        {
          kind: 'paragraph',
          text: 'نسخهٔ 2.4.1 از کتابخانهٔ Node.js در سال ۱۴۰۵ منتشر شد و نشانی آن https://example.org/docs است.',
        },
        {
          kind: 'paragraph',
          lang: 'en',
          text: 'Danesh keeps the original PDF and stores extracted text separately, with page provenance.',
        },
      ],
      [{ kind: 'image', text: 'این صفحه فقط تصویر است' }],
    ],
  },
  'english-report': {
    lang: 'en',
    dir: 'ltr',
    title: 'Learning Report',
    pages: [
      [
        { kind: 'heading', text: 'Learning Report' },
        {
          kind: 'paragraph',
          text: 'This report summarizes how spaced practice improves delayed recall. It is a short fixture with two pages.',
        },
        { kind: 'heading', text: 'Method' },
        {
          kind: 'paragraph',
          text: 'Learners reviewed twelve concepts over three weeks. Each review session lasted about 20 minutes.',
        },
      ],
      [
        { kind: 'heading', text: 'Results' },
        {
          kind: 'paragraph',
          text: 'Recall after one week was 78% with spacing and 52% without it. The difference held for both groups.',
        },
      ],
    ],
  },
};

const css = `body{font-family:Tahoma,"Segoe UI",sans-serif;font-size:17px;line-height:1.8;margin:56px}
h1{font-size:28px;margin:0 0 20px}p{margin:0 0 18px}section{page-break-after:always}`;

function html(fixture) {
  const pages = fixture.pages.map((blocks) =>
    blocks
      .map((block) => {
        if (block.kind === 'image')
          return `<img id="scan" alt="" style="width:480px;height:300px">`;
        const tag = block.kind === 'heading' ? 'h1' : 'p';
        const attrs = block.lang === 'en' ? ' dir="ltr" lang="en" style="text-align:left"' : '';
        return `<${tag}${attrs}>${block.text}</${tag}>`;
      })
      .join('\n'),
  );
  return `<!doctype html><html lang="${fixture.lang}" dir="${fixture.dir}"><head><meta charset="utf-8">
<title>${fixture.title}</title><style>${css}</style></head><body>
${pages.map((page) => `<section>${page}</section>`).join('\n')}</body></html>`;
}

// Draws the image page's text into pixels, so the PDF holds a picture and no text.
const drawScan = `(() => {
  const img = document.getElementById('scan');
  if (!img) return true;
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 600;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 960, 600);
  g.fillStyle = '#000'; g.font = '48px Tahoma'; g.direction = 'rtl'; g.textAlign = 'right';
  g.fillText('این صفحه فقط تصویر است', 900, 300);
  return new Promise((done) => { img.onload = () => done(true); img.src = canvas.toDataURL('image/png'); });
})()`;

// Closing one fixture's window must not quit before the next fixture is printed.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), 'danesh-fixtures-'));
  for (const [name, fixture] of Object.entries(fixtures)) {
    const win = new BrowserWindow({ show: false });
    const page = join(scratch, `${name}.html`);
    writeFileSync(page, html(fixture));
    await win.loadFile(page);
    await win.webContents.executeJavaScript(drawScan);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    writeFileSync(join(out, `${name}.pdf`), pdf);
    const truth = {
      producer: `Chromium ${process.versions.chrome} printToPDF (Electron ${process.versions.electron})`,
      title: fixture.title,
      pages: fixture.pages.map((blocks) =>
        blocks.map(({ kind, text }) => (kind === 'image' ? { kind: 'image' } : { kind, text })),
      ),
    };
    writeFileSync(join(out, `${name}.truth.json`), `${JSON.stringify(truth, null, 2)}\n`);
    win.destroy();
  }
  rmSync(scratch, { recursive: true, force: true });
  app.quit();
});
