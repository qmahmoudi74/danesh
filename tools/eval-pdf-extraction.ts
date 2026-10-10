// Scores PDF text extraction against the fixtures' ground truth and writes the result as JSON.
// Usage: node tools/eval-pdf-extraction.ts [--out <file.json>]
import { writeFileSync } from 'node:fs';
import { EXTRACTOR_VERSION } from '../packages/contracts/src/pdf.ts';
import {
  evaluateFixture,
  fixtureNames,
  type PageScore,
} from '../packages/engines/test/extraction-eval.ts';

const outIndex = process.argv.indexOf('--out');
const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
const pages: PageScore[] = [];
for (const name of fixtureNames()) pages.push(...(await evaluateFixture(name)));

const sum = (pick: (page: PageScore) => number) =>
  pages.reduce((total, page) => total + pick(page), 0);
const characters = sum((page) => page.characters);
const edits = sum((page) => page.edits);
const classTotals = (key: keyof PageScore['characterClasses']) => ({
  expected: sum((page) => page.characterClasses[key].expected),
  extracted: sum((page) => page.characterClasses[key].extracted),
});
const report = {
  extractor: EXTRACTOR_VERSION,
  generatedAt: new Date().toISOString(),
  scope:
    'Fixtures built from known source text by Chromium, XeLaTeX (Tectonic) and LibreOffice; small set, not the S-PDF suite',
  totals: {
    fixtures: new Set(pages.map((page) => page.fixture)).size,
    pages: pages.length,
    characters,
    edits,
    cer: characters ? edits / characters : 0,
    expectedBlocks: sum((page) => page.expectedBlocks),
    exactBlocks: sum((page) => page.exactBlocks),
    orderErrors: sum((page) => page.orderErrors),
    unlocatedBlocks: sum((page) => page.unlocatedBlocks),
    missingWords: sum((page) => page.missingWords.length),
    extraWords: sum((page) => page.extraWords.length),
    furnitureAsContent: sum((page) => page.furnitureAsContent),
    zwnj: classTotals('zwnj'),
    persianDigits: classTotals('persianDigits'),
    persianPunctuation: classTotals('persianPunctuation'),
  },
  pages,
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
for (const page of pages) {
  const classes = Object.entries(page.characterClasses)
    .filter(([, value]) => value.expected > 0)
    .map(([key, value]) => `${key} ${value.extracted}/${value.expected}`)
    .join(' ');
  console.log(
    `${page.fixture} p${page.page} [${page.status}${page.flags.length ? ` ${page.flags.join(',')}` : ''}] ` +
      `CER ${percent(page.cer)} order-errors ${page.orderErrors} unlocated ${page.unlocatedBlocks} ` +
      `exact-blocks ${page.exactBlocks}/${page.expectedBlocks} (extracted ${page.extractedBlocks}) ` +
      `missing-words ${page.missingWords.length} extra-words ${page.extraWords.length} ` +
      `furniture ${page.furnitureAsContent}${classes ? ` | ${classes}` : ''}`,
  );
}
const t = report.totals;
console.log(
  `TOTAL ${t.fixtures} fixtures, ${t.pages} pages: CER ${percent(t.cer)} (${t.edits}/${t.characters}), order errors ${t.orderErrors}, ` +
    `exact blocks ${t.exactBlocks}/${t.expectedBlocks}, missing words ${t.missingWords}, extra words ${t.extraWords}, ` +
    `furniture as content ${t.furnitureAsContent}, ZWNJ ${t.zwnj.extracted}/${t.zwnj.expected}, ` +
    `Persian digits ${t.persianDigits.extracted}/${t.persianDigits.expected}, Persian punctuation ${t.persianPunctuation.extracted}/${t.persianPunctuation.expected}`,
);
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
