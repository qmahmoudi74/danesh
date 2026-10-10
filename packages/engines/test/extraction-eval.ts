// Measures extraction against the fixtures' ground truth (see tools/print-pdf-fixtures.cjs). Shared by the
// regression tests and the evaluation report so both use the same numbers.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedPage } from '@danesh/contracts/pdf.ts';
import { closePdf, extractPage, inspectPdf } from '../pdf/src/pdf.ts';

export const FIXTURES = join(import.meta.dirname, 'fixtures', 'pdf');

type TruthBlock = { kind: 'heading' | 'paragraph' | 'image'; text?: string };
type Truth = { producer: string; title: string; pages: TruthBlock[][] };

/** Character edit distance (insertions, deletions, substitutions) over code points. */
export function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++)
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[right.length]!;
}

export type PageScore = {
  fixture: string;
  page: number;
  status: ExtractedPage['status'];
  expectedBlocks: number;
  extractedBlocks: number;
  kindsMatch: boolean;
  characters: number;
  edits: number;
  cer: number;
  differences: { expected: string; extracted: string }[];
};

export async function evaluateFixture(name: string): Promise<PageScore[]> {
  const path = join(FIXTURES, `${name}.pdf`);
  const truth = JSON.parse(readFileSync(join(FIXTURES, `${name}.truth.json`), 'utf8')) as Truth;
  const { pageCount } = await inspectPdf(path);
  const scores: PageScore[] = [];
  try {
    for (let page = 1; page <= pageCount; page++) {
      const extracted = await extractPage(path, page);
      const expected = (truth.pages[page - 1] ?? []).filter((block) => block.kind !== 'image');
      const expectedText = expected.map((block) => block.text ?? '').join('\n');
      const extractedText = extracted.blocks.map((block) => block.normalizedText).join('\n');
      const edits = editDistance(expectedText, extractedText);
      scores.push({
        fixture: name,
        page,
        status: extracted.status,
        expectedBlocks: expected.length,
        extractedBlocks: extracted.blocks.length,
        kindsMatch:
          expected.length === extracted.blocks.length &&
          expected.every((block, index) => block.kind === extracted.blocks[index]?.kind),
        characters: [...expectedText].length,
        edits,
        cer: expectedText.length ? edits / [...expectedText].length : extractedText.length ? 1 : 0,
        differences: expected
          .map((block, index) => ({
            expected: block.text ?? '',
            extracted: extracted.blocks[index]?.normalizedText ?? '',
          }))
          .filter((pair) => pair.expected !== pair.extracted),
      });
    }
  } finally {
    await closePdf();
  }
  return scores;
}

export function fixtureNames(): string[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.truth.json'))
    .map((file) => file.slice(0, -'.truth.json'.length))
    .sort();
}
