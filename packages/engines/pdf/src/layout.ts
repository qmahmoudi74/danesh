// Rebuilds reading text from positioned PDF text items. pdf.js returns items in content-stream order and reverses
// right-to-left items one at a time, which is not reading order for Persian (many producers write glyphs one by one
// in visual order). So: group items into lines by baseline, rebuild each line's visual order from x positions, run
// the Unicode bidi algorithm to recover logical order, then group lines into blocks. Everything here is a
// heuristic reconstruction and is flagged as such; nothing is invented.
import bidiFactory from 'bidi-js';
import { hasPresentationForms, hasUnmappedGlyphs, normalizeText } from './normalize.ts';

const bidi = bidiFactory();

/** One pdf.js text item, reduced to what layout needs. Coordinates are PDF user space (origin bottom-left). */
export type PositionedText = {
  str: string;
  dir: string;
  x: number;
  y: number;
  width: number;
  size: number;
  fontName: string;
  rotated: boolean;
};

export type BlockKind = 'heading' | 'paragraph';
export type Direction = 'rtl' | 'ltr' | 'mixed';
export type Box = [x0: number, y0: number, x1: number, y1: number];

export type Line = { text: string; direction: Direction; box: Box; size: number; baseline: number };
export type Block = {
  ordinal: number;
  kind: BlockKind;
  rawText: string;
  normalizedText: string;
  direction: Direction;
  /** Normalized to the page: 0..1, origin top-left. */
  box: Box;
  lines: Line[];
  flags: string[];
};
export type PageLayout = {
  blocks: Block[];
  flags: string[];
  charCount: number;
};

const RTL_STRONG = /[\p{Script=Arabic}\p{Script=Hebrew}]/gu;
const LTR_STRONG = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/gu;
const MARKS_ONLY = /^\p{M}+$/u;

function strongCounts(text: string): { rtl: number; ltr: number } {
  return { rtl: text.match(RTL_STRONG)?.length ?? 0, ltr: text.match(LTR_STRONG)?.length ?? 0 };
}

function directionOf(text: string): Direction {
  const { rtl, ltr } = strongCounts(text);
  if (rtl && ltr) return 'mixed';
  return rtl ? 'rtl' : 'ltr';
}

/**
 * Reading direction of a line. On a right-to-left page any line with right-to-left letters reads right to left
 * (a URL inside a Persian sentence must not flip it); a line without them reads left to right.
 */
function baseDirection(text: string, pageRtl: boolean): 'rtl' | 'ltr' {
  const { rtl, ltr } = strongCounts(text);
  if (!rtl) return 'ltr';
  return pageRtl || rtl > ltr ? 'rtl' : 'ltr';
}

/**
 * Converts a line's visual string (glyphs in left-to-right page order) to logical order. Bidi reordering of plain
 * runs is its own inverse, so applying the algorithm to the visual string recovers the logical one; characters
 * shown mirrored at right-to-left levels, such as brackets, return to their logical form.
 */
export function visualToLogical(visual: string, base: 'rtl' | 'ltr'): string {
  const levels = bidi.getEmbeddingLevels(visual, base);
  const mirrored = bidi.getMirroredCharactersMap(visual, levels.levels);
  return bidi
    .getReorderedIndices(visual, levels)
    .map((index) => mirrored.get(index) ?? visual[index])
    .join('');
}

function reverse(text: string): string {
  return [...text].reverse().join('');
}

/** Attaches zero-width combining marks (such as hamza above) to the glyph they sit on. */
function attachMarks(items: PositionedText[]): PositionedText[] {
  const result: PositionedText[] = [];
  for (const item of items) {
    const mark = item.str.trim();
    if (!MARKS_ONLY.test(mark)) {
      result.push({ ...item });
      continue;
    }
    const base = result.find(
      (other) => item.x >= other.x - 0.5 && item.x <= other.x + other.width + 0.5,
    );
    if (base) base.str += mark;
    else result.push({ ...item, str: mark });
  }
  return result;
}

function groupLines(items: PositionedText[]): PositionedText[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    const anchor = line?.[0];
    if (line && anchor && Math.abs(anchor.y - item.y) <= 0.35 * Math.max(anchor.size, item.size))
      line.push(item);
    else lines.push([item]);
  }
  return lines;
}

function buildLine(
  items: PositionedText[],
  pageRtl: boolean,
  page: { width: number; height: number },
): Line {
  const visualItems = attachMarks([...items].sort((a, b) => a.x - b.x));
  let visual = '';
  let previous: PositionedText | undefined;
  for (const item of visualItems) {
    // pdf.js already reversed right-to-left items; undo that to get the glyphs in page order.
    const glyphs = item.dir === 'rtl' ? reverse(item.str) : item.str;
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      if (gap > 0.2 * item.size && !visual.endsWith(' ') && !glyphs.startsWith(' ')) visual += ' ';
    }
    visual += glyphs;
    previous = item;
  }
  const base = baseDirection(visual, pageRtl);
  const text = visualToLogical(visual, base).replace(/\s+/gu, ' ').trim();
  const size = Math.max(...items.map((item) => item.size));
  const x0 = Math.min(...items.map((item) => item.x));
  const x1 = Math.max(...items.map((item) => item.x + item.width));
  const baseline = Math.min(...items.map((item) => item.y));
  const top = Math.max(...items.map((item) => item.y + item.size * 0.8));
  return {
    text,
    direction: directionOf(text),
    size,
    baseline,
    box: [
      x0 / page.width,
      1 - top / page.height,
      x1 / page.width,
      1 - (baseline - size * 0.25) / page.height,
    ],
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Lays out one page. Reading order is top to bottom; columns are not reconstructed, and a page whose lines start at
 * two clearly separate horizontal positions side by side is flagged for review.
 */
export function layoutPage(
  allItems: PositionedText[],
  page: { width: number; height: number },
): PageLayout {
  const flags = new Set<string>();
  const items = allItems.filter((item) => item.str.length > 0 && item.width >= 0);
  if (items.some((item) => item.rotated)) flags.add('rotated-text-skipped');
  const upright = items.filter((item) => !item.rotated);
  const allText = upright.map((item) => item.str).join('');
  const { rtl, ltr } = strongCounts(allText);
  const pageRtl = rtl >= ltr;
  const lines = groupLines(upright)
    .map((group) => buildLine(group, pageRtl, page))
    .filter((line) => line.text.length > 0);

  // Body size: the font size carrying most characters on the page.
  const bodySize = median(
    lines.flatMap((line) => Array.from({ length: line.text.length }, () => line.size)),
  );
  const blocks: Block[] = [];
  let current: Line[] = [];
  const flush = () => {
    if (!current.length) return;
    const rawText = current.map((line) => line.text).join('\n');
    const size = Math.max(...current.map((line) => line.size));
    const heading = size >= bodySize * 1.25 && current.length <= 3 && rawText.length <= 200;
    const blockFlags = new Set<string>();
    if (heading) blockFlags.add('heading-by-font-size');
    if (hasPresentationForms(rawText)) blockFlags.add('presentation-forms-normalized');
    if (current.some((line) => line.direction !== 'ltr')) blockFlags.add('bidi-reconstructed');
    if (hasUnmappedGlyphs(rawText)) blockFlags.add('unmapped-glyphs');
    const normalizedText = normalizeText(rawText.replace(/\n/gu, ' '));
    blocks.push({
      ordinal: blocks.length,
      kind: heading ? 'heading' : 'paragraph',
      rawText,
      normalizedText,
      direction: directionOf(normalizedText),
      box: [
        Math.min(...current.map((line) => line.box[0])),
        Math.min(...current.map((line) => line.box[1])),
        Math.max(...current.map((line) => line.box[2])),
        Math.max(...current.map((line) => line.box[3])),
      ],
      lines: current,
      flags: [...blockFlags],
    });
    current = [];
  };
  // Leading: the usual baseline-to-baseline distance between lines of the same size. A larger step starts a block.
  const steps = lines
    .slice(1)
    .map((line, index) => ({
      line,
      step: lines[index]!.baseline - line.baseline,
      prev: lines[index]!,
    }))
    .filter(({ line, prev, step }) => sameSize(line, prev) && step > 0 && step < 3 * line.size)
    .map(({ step }) => step);
  const leading = steps.length ? Math.min(...steps) : 0;
  let previous: Line | undefined;
  for (const line of lines) {
    if (previous) {
      const step = previous.baseline - line.baseline;
      const limit = leading ? leading * 1.25 : previous.size * 1.6;
      if (step > limit || !sameSize(line, previous)) flush();
    }
    current.push(line);
    previous = line;
  }
  flush();

  for (const block of blocks)
    if (block.flags.includes('unmapped-glyphs')) flags.add('unmapped-glyphs');
  if (suspectColumns(lines, page.width)) flags.add('multi-column-suspected');
  return {
    blocks,
    flags: [...flags],
    charCount: blocks.reduce((sum, block) => sum + block.normalizedText.length, 0),
  };
}

function sameSize(a: Line, b: Line): boolean {
  return Math.abs(a.size - b.size) <= 0.15 * Math.min(a.size, b.size);
}

/** Two groups of lines that sit side by side (overlapping vertically, separated horizontally) suggest columns. */
function suspectColumns(lines: Line[], pageWidth: number): boolean {
  for (let a = 0; a < lines.length; a++)
    for (let b = a + 1; b < lines.length; b++) {
      const [left, right] = [lines[a]!, lines[b]!];
      const overlapY = Math.min(left.box[3], right.box[3]) - Math.max(left.box[1], right.box[1]);
      const apart = left.box[2] < right.box[0] - 0.02 || right.box[2] < left.box[0] - 0.02;
      if (overlapY > 0 && apart && pageWidth > 0) return true;
    }
  return false;
}
