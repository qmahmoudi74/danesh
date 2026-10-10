// Scores PDF text extraction against the fixtures' ground truth and writes the result as JSON.
// Usage: node tools/eval-pdf-extraction.ts [--out <file.json>]
import { writeFileSync } from 'node:fs';
import { EXTRACTOR_VERSION } from '../packages/contracts/src/pdf.ts';
import { evaluateFixture, fixtureNames } from '../packages/engines/test/extraction-eval.ts';

const outIndex = process.argv.indexOf('--out');
const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
const pages = [];
for (const name of fixtureNames()) pages.push(...(await evaluateFixture(name)));
const characters = pages.reduce((sum, page) => sum + page.characters, 0);
const edits = pages.reduce((sum, page) => sum + page.edits, 0);
const report = {
  extractor: EXTRACTOR_VERSION,
  generatedAt: new Date().toISOString(),
  scope: 'Chromium-printed fixtures with known source text; not evidence for other PDF producers',
  totals: {
    pages: pages.length,
    characters,
    edits,
    cer: characters ? edits / characters : 0,
    blockKindsMatched: pages.filter((page) => page.kindsMatch).length,
  },
  pages,
};
for (const page of pages)
  console.log(
    `${page.fixture} p${page.page}: status=${page.status} blocks=${page.extractedBlocks}/${page.expectedBlocks} ` +
      `kinds=${page.kindsMatch ? 'ok' : 'differ'} edits=${page.edits}/${page.characters}`,
  );
console.log(`total CER ${(report.totals.cer * 100).toFixed(2)}% (${edits}/${characters})`);
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
