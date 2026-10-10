// Measures extraction against the fixtures' ground truth (the source text the fixture was built from; see
// tools/print-pdf-fixtures.cjs and tools/build-pdf-fixtures.ts). Shared by the regression tests and the evaluation
// report so both use the same numbers.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedPage } from '@danesh/contracts/pdf.ts';
import { closePdf, extractPage, inspectPdf } from '../pdf/src/pdf.ts';

export const FIXTURES = join(import.meta.dirname, 'fixtures', 'pdf');

type TruthBlock = { kind: 'heading' | 'paragraph' | 'image' | 'furniture'; text?: string };
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

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();
const words = (text: string) => collapse(text).split(' ').filter(Boolean);

/** Words in `a` that `b` lacks, counted with multiplicity. */
function wordDifference(a: string[], b: string[]): string[] {
  const available = new Map<string, number>();
  for (const word of b) available.set(word, (available.get(word) ?? 0) + 1);
  return a.filter((word) => {
    const left = available.get(word) ?? 0;
    if (left === 0) return true;
    available.set(word, left - 1);
    return false;
  });
}

const CHARACTER_CLASSES = {
  zwnj: /‌/gu,
  persianDigits: /[۰-۹]/gu,
  persianPunctuation: /[،؛؟«»٪]/gu,
} as const;

export type ClassRecall = { expected: number; extracted: number };

export type PageScore = {
  fixture: string;
  producer: string;
  page: number;
  status: ExtractedPage['status'];
  flags: string[];
  expectedBlocks: number;
  extractedBlocks: number;
  /** Same number of blocks with the same kinds, in order. */
  kindsMatch: boolean;
  /** Truth blocks reproduced exactly (same text and kind) as one extracted block. */
  exactBlocks: number;
  characters: number;
  edits: number;
  cer: number;
  /** Extracted characters / expected characters (content only). */
  coverage: number;
  missingWords: string[];
  extraWords: string[];
  /** Pairs of consecutive truth blocks that appear in the opposite order in the extracted text. */
  orderErrors: number;
  /** Truth blocks whose opening words could not be found at all (lost or garbled). */
  unlocatedBlocks: number;
  /** Page numbers and running heads extracted as reading content. */
  furnitureAsContent: number;
  characterClasses: Record<keyof typeof CHARACTER_CLASSES, ClassRecall>;
  differences: { expected: string; extracted: string }[];
};

/** Where a truth block starts in the extracted text, located by its opening words. */
function locate(haystack: string, block: string): number {
  const anchor = words(block).slice(0, 4).join(' ');
  return anchor ? haystack.indexOf(anchor) : -1;
}

function scorePage(name: string, truth: Truth, page: number, extracted: ExtractedPage): PageScore {
  const all = (truth.pages[page - 1] ?? []).filter((block) => block.kind !== 'image');
  const expected = all.filter((block) => block.kind !== 'furniture');
  const furniture = all
    .filter((block) => block.kind === 'furniture')
    .map((block) => block.text ?? '');
  const expectedText = expected.map((block) => block.text ?? '').join('\n');
  const extractedText = extracted.blocks.map((block) => block.normalizedText).join('\n');
  const flatExtracted = collapse(extractedText);
  const edits = editDistance(expectedText, extractedText);
  const characters = [...expectedText].length;
  const positions = expected.map((block) => locate(flatExtracted, block.text ?? ''));
  let orderErrors = 0;
  for (let index = 1; index < positions.length; index++) {
    const [before, after] = [positions[index - 1]!, positions[index]!];
    if (before >= 0 && after >= 0 && after < before) orderErrors++;
  }
  const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
  const characterClasses = Object.fromEntries(
    Object.entries(CHARACTER_CLASSES).map(([key, pattern]) => [
      key,
      { expected: count(expectedText, pattern), extracted: count(extractedText, pattern) },
    ]),
  ) as PageScore['characterClasses'];
  const extractedBlocks = extracted.blocks.map((block) => collapse(block.normalizedText));
  return {
    fixture: name,
    producer: truth.producer,
    page,
    status: extracted.status,
    flags: extracted.flags,
    expectedBlocks: expected.length,
    extractedBlocks: extracted.blocks.length,
    kindsMatch:
      expected.length === extracted.blocks.length &&
      expected.every((block, index) => block.kind === extracted.blocks[index]?.kind),
    exactBlocks: expected.filter((block) =>
      extracted.blocks.some(
        (candidate) =>
          candidate.kind === block.kind &&
          collapse(candidate.normalizedText) === collapse(block.text ?? ''),
      ),
    ).length,
    characters,
    edits,
    cer: characters ? edits / characters : extractedText.length ? 1 : 0,
    coverage: characters ? [...extractedText].length / characters : 0,
    missingWords: wordDifference(words(expectedText), words(extractedText)),
    extraWords: wordDifference(words(extractedText), words(expectedText)),
    orderErrors,
    unlocatedBlocks: positions.filter((position) => position < 0).length,
    furnitureAsContent: furniture.filter((text) => extractedBlocks.includes(collapse(text))).length,
    characterClasses,
    differences: expected
      .map((block, index) => ({
        expected: block.text ?? '',
        extracted: extracted.blocks[index]?.normalizedText ?? '',
      }))
      .filter((pair) => pair.expected !== pair.extracted),
  };
}

export async function evaluateFixture(name: string): Promise<PageScore[]> {
  const path = join(FIXTURES, `${name}.pdf`);
  const truth = JSON.parse(readFileSync(join(FIXTURES, `${name}.truth.json`), 'utf8')) as Truth;
  const { pageCount } = await inspectPdf(path);
  if (pageCount !== truth.pages.length)
    throw new Error(`${name}: ${pageCount} pages but truth for ${truth.pages.length}`);
  const scores: PageScore[] = [];
  try {
    for (let page = 1; page <= pageCount; page++)
      scores.push(scorePage(name, truth, page, await extractPage(path, page)));
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
