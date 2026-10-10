import { join } from 'node:path';
import bidiFactory from 'bidi-js';
import { describe, expect, it } from 'vitest';
import { visualToLogical } from '../pdf/src/layout.ts';
import { normalizeText, restoreZeroWidthNonJoiners } from '../pdf/src/normalize.ts';
import { closePdf, extractPage } from '../pdf/src/pdf.ts';
import { evaluateFixture, FIXTURES } from './extraction-eval.ts';

const bidi = bidiFactory();
/** The order a reader sees on screen (what many PDF producers write), from logical text. */
function toVisual(logical: string, base: 'rtl' | 'ltr'): string {
  const levels = bidi.getEmbeddingLevels(logical, base);
  const mirrored = bidi.getMirroredCharactersMap(logical, levels.levels);
  return bidi
    .getReorderedIndices(logical, levels)
    .map((index) => mirrored.get(index) ?? logical[index])
    .join('');
}

describe('visual to logical order', () => {
  it.each([
    'دانش یک محیط یادگیری است.',
    'رابطهٔ E = mc² را دیده‌اید؛ شرط x ≤ 10 رایج است.',
    'نسخهٔ 2.4.1 از Node.js در سال ۱۴۰۵ منتشر شد و نشانی آن https://example.org/docs است.',
    'این متن (با پرانتز) و [کروشه] است.',
  ])('recovers %s from its on-screen order', (logical) => {
    expect(visualToLogical(toVisual(logical, 'rtl'), 'rtl')).toBe(logical);
  });

  it('leaves left-to-right text unchanged', () => {
    const text = 'Recall after one week was 78% (with spacing).';
    expect(visualToLogical(text, 'ltr')).toBe(text);
  });
});

describe('normalization', () => {
  it('turns presentation forms into letters but keeps technical notation', () => {
    // "سلام" written with presentation forms, then a superscript and a ≤ sign.
    expect(normalizeText('ﺳﻼﻡ x² ≤ 10')).toBe('سلام x² ≤ 10');
  });

  it('maps Arabic yeh, kaf, heh doachashmee and digits only in Persian text', () => {
    expect(normalizeText('كتاب ی ١٢')).toBe('کتاب ی ۱۲');
    expect(normalizeText('Version 12 of ١٢')).toBe('Version 12 of ۱۲');
    expect(normalizeText('مدرسة في')).toBe('مدرسة في'); // Arabic (teh marbuta): unchanged
  });

  it('restores a zero-width non-joiner only where glyph shapes prove a broken join', () => {
    // Final-form yeh (U+FBFD) before initial-form kaf (U+FB90): "می‌کند".
    expect(restoreZeroWidthNonJoiners('ﻣﯽﮐ')).toBe('ﻣﯽ‌ﮐ');
    // Plain letters on both sides carry no shape: nothing is added.
    expect(restoreZeroWidthNonJoiners('ها')).toBe('ها');
    // Initial then medial forms are joined: nothing is added.
    expect(restoreZeroWidthNonJoiners('ﻣﻤ')).toBe('ﻣﻤ');
  });

  it('collapses spaces, drops a non-joiner next to a space and keeps the rest', () => {
    expect(normalizeText('  a ‌ b‌c  ')).toBe('a b‌c');
  });
});

describe('real PDFs printed by Chromium', () => {
  it('rebuilds the Persian/English fixture in logical order with headings, notation and page statuses', async () => {
    const scores = await evaluateFixture('persian-mixed');
    expect(scores.map((score) => score.status)).toEqual(['text', 'text', 'needs-ocr']);
    expect(scores.map((score) => score.kindsMatch)).toEqual([true, true, true]);
    // One known loss: "دیده‌اید" is printed with plain letters on both sides of its non-joiner, so no glyph
    // shape proves it and it is not restored (see the evaluation report).
    expect(scores.reduce((sum, score) => sum + score.edits, 0)).toBe(1);
    expect(scores[1]!.differences).toEqual([
      {
        expected:
          'رابطهٔ معروف E = mc² را در فیزیک دیده‌اید؛ همچنین شرط x ≤ 10 در برنامه‌نویسی رایج است.',
        extracted:
          'رابطهٔ معروف E = mc² را در فیزیک دیدهاید؛ همچنین شرط x ≤ 10 در برنامه‌نویسی رایج است.',
      },
    ]);
  });

  it('reads the English fixture exactly', async () => {
    const scores = await evaluateFixture('english-report');
    expect(scores.every((score) => score.kindsMatch && score.edits === 0)).toBe(true);
  });

  it('records geometry, direction and flags for every block', async () => {
    try {
      const page = await extractPage(join(FIXTURES, 'persian-mixed.pdf'), 2);
      for (const block of page.blocks) {
        const [x0, y0, x1, y1] = block.box;
        expect(x0).toBeLessThan(x1);
        expect(y0).toBeLessThan(y1);
        expect(block.lines.length).toBeGreaterThan(0);
        expect(block.rawText.length).toBeGreaterThan(0);
      }
      expect(page.blocks.map((block) => block.direction)).toEqual(['rtl', 'mixed', 'mixed', 'ltr']);
      expect(page.blocks[0]!.flags).toContain('heading-by-font-size');
      expect(page.blocks[1]!.flags).toContain('bidi-reconstructed');
      // Raw keeps the decoded presentation forms; only the normalized text is unified.
      expect(page.blocks[0]!.rawText).not.toBe(page.blocks[0]!.normalizedText);
    } finally {
      await closePdf();
    }
  });
});
