// Builds the multi-producer PDF extraction fixtures from one text spec each: writes the LaTeX or LibreOffice
// source, runs the real producer, and writes ground truth from the same spec (the source text, not a reading of
// the output). Tools are developer-only and never shipped:
//   node tools/build-pdf-fixtures.ts --tectonic <tectonic.exe> --soffice <soffice.com> --fonts <dir with Vazirmatn-*.ttf>
// LibreOffice reads fonts only from its own share/fonts/truetype folder: copy Vazirmatn there first.
// Output: packages/engines/test/fixtures/pdf/<name>.pdf, <name>.truth.json and src/<name>.tex|.fodt
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Block = { kind: 'heading' | 'paragraph' | 'furniture'; text: string; lang?: 'en' | 'fa' };
type Spec = {
  name: string;
  producer: 'xelatex' | 'libreoffice';
  lang: 'en' | 'fa';
  columns: 1 | 2;
  title: string;
  /** Blocks in reading order. Furniture (page numbers) is printed but is not content. */
  blocks: Block[];
};

const ZWNJ = '\u200C';
const fa = (text: string) => text.replaceAll('|', ZWNJ); // `|` marks a zero-width non-joiner in the specs below

const specs: Spec[] = [
  {
    name: 'xelatex-en-twocolumn',
    producer: 'xelatex',
    lang: 'en',
    columns: 2,
    title: 'Spaced Practice and Delayed Recall',
    blocks: [
      { kind: 'heading', text: 'Spaced Practice and Delayed Recall' },
      { kind: 'heading', text: 'Introduction' },
      {
        kind: 'paragraph',
        text: 'Learners often reread a chapter several times in a single evening and feel confident the next morning. That confidence fades quickly. Spaced practice distributes the same effort across days, so that each review happens just as the memory begins to weaken. This short report describes a small classroom study of that effect and the conditions under which it held. We focus on delayed recall, because it is the outcome that matters when the material is needed again weeks later.',
      },
      { kind: 'heading', text: 'Method' },
      {
        kind: 'paragraph',
        text: 'Forty learners studied twelve concepts from an introductory statistics course. Half of them reviewed each concept three times on the first day. The other half reviewed each concept once on the first day, once two days later and once a week later. Every review session lasted about twenty minutes, and the total study time was identical in both groups. Nobody was told which schedule was expected to work better, and the same instructor taught both groups.',
      },
      { kind: 'heading', text: 'Results' },
      {
        kind: 'paragraph',
        text: 'One week after the last session, the spaced group recalled 78 percent of the concepts and the massed group recalled 52 percent. After a month the gap was even larger. The difference was consistent across the easier and the harder concepts, although the harder concepts benefited slightly more. Learners in the spaced group also rated their confidence more accurately, which suggests that the schedule improved their judgement as well as their memory.',
      },
      { kind: 'heading', text: 'Discussion' },
      {
        kind: 'paragraph',
        text: 'The finding is not new, but it is easy to forget when planning a course. A practical study tool should therefore schedule reviews automatically, keep the effort per session small and show learners how their recall develops over time. Future work will test the same design with longer texts, with mixed Persian and English material and with learners who study on their own.',
      },
      { kind: 'heading', text: 'Limitations' },
      {
        kind: 'paragraph',
        text: 'The sample was small and came from a single course, so the size of the effect should not be generalised without care. The concepts were short definitions rather than long arguments, and recall was measured with the same kind of questions that were used during practice. A stronger design would also measure transfer to new problems, and it would follow learners for a full semester rather than a single month.',
      },
      { kind: 'heading', text: 'Conclusion' },
      {
        kind: 'paragraph',
        text: 'Distributing the same amount of practice over several days produced clearly better delayed recall than concentrating it in one evening. The schedule cost nothing extra in study time. For a learning environment that aims at durable knowledge, spaced review should be the default rather than an option that learners must discover for themselves.',
      },
      { kind: 'furniture', text: '1' },
    ],
  },
  {
    name: 'xelatex-fa-twocolumn',
    producer: 'xelatex',
    lang: 'fa',
    columns: 2,
    title: 'یادگیری پایدار با مرور فاصله‌دار',
    blocks: [
      { kind: 'heading', text: fa('یادگیری پایدار با مرور فاصله|دار') },
      { kind: 'heading', text: 'مقدمه' },
      {
        kind: 'paragraph',
        text: fa(
          'بسیاری از یادگیرندگان یک فصل را در یک شب چند بار می|خوانند و صبح روز بعد احساس اطمینان می|کنند. این اطمینان به|سرعت از بین می|رود. مرور فاصله|دار همان مقدار تلاش را در چند روز پخش می|کند تا هر مرور درست زمانی انجام شود که حافظه کم|کم ضعیف می|شود. در این نوشته یک آزمایش کوچک کلاسی را شرح می|دهیم.',
        ),
      },
      { kind: 'heading', text: 'روش' },
      {
        kind: 'paragraph',
        text: fa(
          'چهل یادگیرنده دوازده مفهوم از درس آمار مقدماتی را مطالعه کردند. نیمی از آن|ها هر مفهوم را در روز نخست سه بار مرور کردند و نیم دیگر یک بار در روز نخست، یک بار دو روز بعد و یک بار یک هفته بعد. هر جلسه حدود ۲۰ دقیقه طول کشید و برای ثبت نتیجه|ها از نرم|افزار Danesh نسخهٔ 0.1.0 استفاده شد.',
        ),
      },
      { kind: 'heading', text: fa('یافته|ها') },
      {
        kind: 'paragraph',
        text: fa(
          'یک هفته پس از آخرین جلسه، گروه فاصله|دار ۷۸٪ مفهوم|ها را به یاد آورد و گروه دیگر ۵۲٪. آیا این تفاوت پایدار بود؟ پس از یک ماه فاصله حتی بیشتر شد؛ نتیجه برای مفهوم|های ساده و دشوار یکسان بود. یادگیرندگان گروه فاصله|دار اطمینان خود را نیز دقیق|تر برآورد کردند.',
        ),
      },
      { kind: 'heading', text: 'بحث' },
      {
        kind: 'paragraph',
        text: fa(
          'این یافته تازه نیست، اما هنگام برنامه|ریزی درس به|آسانی فراموش می|شود. یک ابزار مطالعه باید مرورها را خودکار زمان|بندی کند، تلاش هر جلسه را کم نگه دارد و روند یادآوری را به یادگیرنده نشان دهد. گام بعدی آزمودن همین طرح با متن|های بلندتر و مطالب دوزبانهٔ فارسی و انگلیسی است.',
        ),
      },
      { kind: 'heading', text: fa('محدودیت|ها') },
      {
        kind: 'paragraph',
        text: fa(
          'نمونهٔ این آزمایش کوچک بود و از یک درس گرفته شد، پس اندازهٔ اثر را نباید بی|احتیاط تعمیم داد. مفهوم|ها تعریف|های کوتاه بودند و نه استدلال|های بلند، و پرسش|های آزمون همانند پرسش|های تمرین بودند. طرح قوی|تر باید انتقال به مسئله|های تازه را هم بسنجد و یادگیرندگان را یک نیم|سال کامل دنبال کند.',
        ),
      },
      { kind: 'heading', text: fa('نتیجه|گیری') },
      {
        kind: 'paragraph',
        text: fa(
          'پخش کردن همان مقدار تمرین در چند روز، یادآوری دیرهنگام را به|روشنی بهتر از تمرکز آن در یک شب کرد و هیچ زمان مطالعهٔ اضافه|ای نخواست. برای محیطی که هدفش دانش ماندگار است، مرور فاصله|دار باید رفتار پیش|فرض باشد، نه گزینه|ای که یادگیرنده خودش کشف کند.',
        ),
      },
      { kind: 'furniture', text: '۱' },
    ],
  },
  {
    name: 'libreoffice-fa-en',
    producer: 'libreoffice',
    lang: 'fa',
    columns: 1,
    title: 'راهنمای کوتاه کتابخانهٔ دانش',
    blocks: [
      { kind: 'heading', text: fa('راهنمای کوتاه کتابخانهٔ دانش') },
      {
        kind: 'paragraph',
        text: fa(
          'دانش فایل|های PDF شما را در پوشهٔ خودش نگه می|دارد و هرگز فایل اصلی را تغییر نمی|دهد. متن هر صفحه جداگانه استخراج می|شود و برای خواندن بدون اینترنت ذخیره می|ماند.',
        ),
      },
      { kind: 'heading', text: fa('نمادها و نشانی|ها') },
      {
        kind: 'paragraph',
        text: fa(
          'رابطهٔ E = mc² و شرط x ≤ 10 باید دست|نخورده بمانند. نسخهٔ 2.4.1 در سال ۱۴۰۵ منتشر شد و نشانی آن https://example.org/docs است. آیا «پرانتز (مانند این)» درست خوانده می|شود؟',
        ),
      },
      {
        kind: 'paragraph',
        lang: 'en',
        text: 'This English paragraph checks left-to-right text inside a right-to-left document, with numbers such as 3.14 and 42.',
      },
    ],
  },
  {
    name: 'libreoffice-fa-twocolumn',
    producer: 'libreoffice',
    lang: 'fa',
    columns: 2,
    title: 'ستون|بندی در متن فارسی',
    blocks: [
      { kind: 'heading', text: fa('ستون|بندی در متن فارسی') },
      {
        kind: 'paragraph',
        text: fa(
          'در صفحه|های دوستونی، ستون راست پیش از ستون چپ خوانده می|شود. اگر استخراج متن تنها به ترتیب خط|ها از بالا به پایین نگاه کند، جمله|های دو ستون در هم می|آمیزند و متن بی|معنا می|شود. این پاراگراف نخست برای پر کردن ستون راست نوشته شده است و چند جمله دارد تا طول آن به اندازهٔ کافی برسد.',
        ),
      },
      {
        kind: 'paragraph',
        text: fa(
          'پاراگراف دوم ادامهٔ همان ستون است. یک خوانندهٔ خوب باید مرز ستون|ها را از روی فاصلهٔ خالی میان آن|ها بشناسد و اگر مطمئن نیست، صفحه را برای بازبینی علامت بزند. حدس زدن با اطمینان کاذب از نشان دادن تردید بدتر است.',
        ),
      },
      {
        kind: 'paragraph',
        text: fa(
          'پاراگراف سوم احتمالاً به ستون چپ می|رسد. در اینجا عددهای ۱۲ و ۳۴ و واژهٔ Danesh آمده|اند تا ترتیب منطقی متن دوسویه هم آزموده شود. هر ستون باید به|طور کامل و پیوسته خوانده شود.',
        ),
      },
      {
        kind: 'paragraph',
        text: fa(
          'پاراگراف چهارم ستون چپ را ادامه می|دهد و پایان این صفحه است. اگر ترتیب درست باشد، این جمله آخرین جملهٔ متن استخراج|شده خواهد بود.',
        ),
      },
    ],
  },
];

// ---------- LaTeX ----------
const latexEscape = (text: string) => text.replace(/([%&#_$])/g, '\\$1');
/** Latin runs inside Persian text are typeset left to right with \lr{…}. */
const persianLatex = (text: string) =>
  latexEscape(text).replace(
    /[A-Za-z0-9][A-Za-z0-9.:/\-+=²≤ ]*[A-Za-z0-9²]/g,
    (run) => `\\lr{${run}}`,
  );

function latexSource(spec: Spec): string {
  const persian = spec.lang === 'fa';
  const body = (block: Block) =>
    persian && block.lang !== 'en' ? persianLatex(block.text) : latexEscape(block.text);
  const [title, ...rest] = spec.blocks.filter((block) => block.kind !== 'furniture');
  const lines = [
    `\\documentclass[11pt${spec.columns === 2 ? ',twocolumn' : ''}]{article}`,
    '\\usepackage[a4paper,margin=2cm]{geometry}',
    persian ? '\\usepackage{xepersian}' : '\\usepackage{fontspec}',
    persian
      ? '\\settextfont[Path=./,Extension=.ttf,UprightFont=*-Regular,BoldFont=*-Bold]{Vazirmatn}'
      : '',
    '\\begin{document}',
    // The title spans both columns, as in a real article.
    `\\twocolumn[{\\section*{${body(title!)}}}]`,
    ...rest.map((block) =>
      block.kind === 'heading' ? `\\section*{${body(block)}}` : `${body(block)}\n`,
    ),
    '\\end{document}',
  ];
  return `${lines.filter(Boolean).join('\n')}\n`;
}

// ---------- LibreOffice (flat ODF) ----------
const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fodtSource(spec: Spec): string {
  const rtl = spec.lang === 'fa';
  const [title, ...rest] = spec.blocks.filter((block) => block.kind !== 'furniture');
  const paragraph = (block: Block) =>
    block.kind === 'heading'
      ? `<text:h text:style-name="${rtl ? 'HeadingRtl' : 'HeadingLtr'}" text:outline-level="1">${xml(block.text)}</text:h>`
      : `<text:p text:style-name="${block.lang === 'en' || !rtl ? 'BodyLtr' : 'BodyRtl'}">${xml(block.text)}</text:p>`;
  const body =
    spec.columns === 2
      ? `${paragraph(title!)}<text:section text:style-name="Columns" text:name="Columns">${rest.map(paragraph).join('')}</text:section>`
      : spec.blocks
          .filter((block) => block.kind !== 'furniture')
          .map(paragraph)
          .join('');
  const font = 'Vazirmatn';
  const text = (align: string, mode: string, size: string, bold = false) =>
    `<style:paragraph-properties fo:text-align="${align}" style:writing-mode="${mode}" fo:margin-bottom="0.3cm"/>` +
    `<style:text-properties style:font-name="${font}" style:font-name-complex="${font}" fo:font-size="${size}" style:font-size-complex="${size}"${bold ? ' fo:font-weight="bold" style:font-weight-complex="bold"' : ''}/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:font-face-decls><style:font-face style:name="${font}" svg:font-family="${font}"/></office:font-face-decls>
<office:styles>
<style:style style:name="BodyRtl" style:family="paragraph">${text('end', 'rl-tb', '12pt')}</style:style>
<style:style style:name="BodyLtr" style:family="paragraph">${text('start', 'lr-tb', '12pt')}</style:style>
<style:style style:name="HeadingRtl" style:family="paragraph">${text('end', 'rl-tb', '18pt', true)}</style:style>
<style:style style:name="HeadingLtr" style:family="paragraph">${text('start', 'lr-tb', '18pt', true)}</style:style>
</office:styles>
<office:automatic-styles>
<style:style style:name="Columns" style:family="section"><style:section-properties style:writing-mode="${rtl ? 'rl-tb' : 'lr-tb'}"><style:columns fo:column-count="2" fo:column-gap="1cm"/></style:section-properties></style:style>
</office:automatic-styles>
<office:body><office:text>${body}</office:text></office:body>
</office:document>
`;
}

// ---------- build ----------
const argument = (flag: string) => {
  const index = process.argv.indexOf(flag);
  const value = index > 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${flag}`);
  return resolve(value);
};
const tectonic = argument('--tectonic');
const soffice = argument('--soffice');
const fonts = argument('--fonts');
const out = resolve('packages/engines/test/fixtures/pdf');
mkdirSync(join(out, 'src'), { recursive: true });
const version = (exe: string, flag: string) =>
  execFileSync(exe, [flag], { encoding: 'utf8' }).split('\n')[0]!.trim();
const producers = {
  xelatex: version(tectonic, '--version'),
  libreoffice: version(soffice, '--version').replace(/ [0-9a-f]{40}$/, ''),
};

for (const spec of specs) {
  const work = mkdtempSync(join(tmpdir(), 'danesh-fixture-'));
  try {
    for (const font of ['Vazirmatn-Regular.ttf', 'Vazirmatn-Bold.ttf'])
      copyFileSync(join(fonts, font), join(work, font));
    if (spec.producer === 'xelatex') {
      const source = latexSource(spec);
      writeFileSync(join(out, 'src', `${spec.name}.tex`), source);
      writeFileSync(join(work, `${spec.name}.tex`), source);
      execFileSync(tectonic, [`${spec.name}.tex`], { cwd: work, stdio: 'ignore' });
    } else {
      const source = fodtSource(spec);
      writeFileSync(join(out, 'src', `${spec.name}.fodt`), source);
      writeFileSync(join(work, `${spec.name}.fodt`), source);
      execFileSync(
        soffice,
        [
          `-env:UserInstallation=file:///${work.replaceAll('\\', '/')}/profile`,
          '--headless',
          '--convert-to',
          'pdf',
          `${spec.name}.fodt`,
        ],
        { cwd: work, stdio: 'ignore' },
      );
    }
    copyFileSync(join(work, `${spec.name}.pdf`), join(out, `${spec.name}.pdf`));
    const truth = {
      producer: producers[spec.producer],
      title: spec.title.replaceAll('|', ZWNJ),
      columns: spec.columns,
      pages: [spec.blocks.map(({ kind, text }) => ({ kind, text }))],
    };
    writeFileSync(join(out, `${spec.name}.truth.json`), `${JSON.stringify(truth, null, 2)}\n`);
    console.log(
      `${spec.name}: ${readFileSync(join(out, `${spec.name}.pdf`)).length} bytes (${truth.producer})`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
