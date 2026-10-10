// Text normalization for extracted PDF text. The raw text is always kept as well; these rules only build the
// normalized form used for reading.

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/u;
const PRESENTATION_FORM_RUN = /[ﭐ-﷿ﹰ-﻿]+/gu;
/** Letters that only Persian (not Arabic) uses; their presence makes a block Persian. */
const PERSIAN_ONLY = /[پچژگیک]/u;
/** Arabic-only letters (teh marbuta, alef maksura): their presence keeps Arabic text as Arabic. */
const ARABIC_ONLY = /[ةى]/u;
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const ARABIC_INDIC_DIGIT = /[٠-٩]/gu;
const REPLACEMENT = /[�\p{Co}]/u;
const ZWNJ = '‌';

type Form = { form: 'isolated' | 'final' | 'initial' | 'medial'; dualJoining: boolean };

/**
 * Shape of each Arabic presentation-form letter, derived from Unicode: consecutive code points with the same
 * compatibility decomposition are the isolated, final, initial and medial forms of one letter (four forms for a
 * dual-joining letter, two for a right-joining one).
 */
const FORMS = (() => {
  const forms = new Map<string, Form>();
  const names = {
    4: ['isolated', 'final', 'initial', 'medial'],
    2: ['isolated', 'final'],
  } as const;
  for (const [start, end] of [
    [0xfb50, 0xfbff],
    [0xfe70, 0xfefc],
  ] as const) {
    let group: string[] = [];
    let previousBase = '';
    const close = () => {
      const shapes = group.length === 4 || group.length === 2 ? names[group.length] : [];
      shapes.forEach((form, index) => {
        forms.set(group[index]!, { form, dualJoining: group.length === 4 });
      });
      group = [];
    };
    for (let code = start; code <= end; code++) {
      const char = String.fromCodePoint(code);
      const base = char.normalize('NFKC');
      // Heh doachashmee forms are excluded: fonts share their glyphs with Persian heh's other forms, so a PDF's
      // Unicode map can name the wrong form (a medial heh appears as U+FBAB, a "final" form).
      const ambiguous = base === 'ھ';
      const letter = base.length === 1 && /\p{L}/u.test(base) && !ambiguous;
      if (!letter || base !== previousBase) close();
      if (letter) group.push(char);
      previousBase = letter ? base : '';
    }
    close();
  }
  return forms;
})();

/** Plain letters that join on both sides (beh, seen, lam…), from the same Unicode groups. */
const DUAL_JOINING = new Set(
  [...FORMS].filter(([, shape]) => shape.dualJoining).map(([char]) => char.normalize('NFKC')),
);
const JOINING_LETTER = /^[آ-غف-يٱ-ۓ]$/u;

/**
 * Two adjacent letters that should connect but are drawn unconnected mean the source had a zero-width non-joiner,
 * which PDF producers usually drop because it has no glyph. The join counts as broken only with shape evidence on
 * at least one side: a dual-joining letter drawn in its final or isolated form before another letter, or a
 * dual-joining letter before a letter drawn in its initial or isolated form. Plain code points on both sides carry
 * no shape, so nothing is restored there.
 */
export function restoreZeroWidthNonJoiners(text: string): string {
  const chars = [...text];
  let result = '';
  chars.forEach((char, index) => {
    result += char;
    const following = chars[index + 1] ?? '';
    const current = FORMS.get(char);
    const next = FORMS.get(following);
    const nextIsLetter = Boolean(next) || JOINING_LETTER.test(following);
    const endsUnjoined =
      current?.dualJoining && (current.form === 'final' || current.form === 'isolated');
    const startsUnjoined =
      DUAL_JOINING.has(char) && (next?.form === 'initial' || next?.form === 'isolated');
    if ((endsUnjoined && nextIsLetter) || startsUnjoined) result += ZWNJ;
  });
  return result;
}

export function hasPresentationForms(text: string): boolean {
  return PRESENTATION_FORMS.test(text);
}

/** Characters a reader cannot trust: U+FFFD or private-use code points from fonts without a Unicode map. */
export function hasUnmappedGlyphs(text: string): boolean {
  return REPLACEMENT.test(text);
}

export function isPersian(text: string): boolean {
  const unified = text.replace(PRESENTATION_FORM_RUN, (run) => run.normalize('NFKC'));
  return PERSIAN_ONLY.test(unified) || (ARABIC_SCRIPT.test(unified) && !ARABIC_ONLY.test(unified));
}

/**
 * Builds the normalized reading text:
 * - a zero-width non-joiner is restored where glyph shapes prove a broken join (see restoreZeroWidthNonJoiners);
 * - Arabic presentation forms (shaped glyph code points) become ordinary letters (NFKC on those code points only,
 *   so superscripts and other technical notation keep their form);
 * - in Persian text, Arabic yeh, kaf and heh doachashmee become Persian ی, ک, ه and Arabic-Indic digits become
 *   Persian digits (PDF fonts often map one glyph to the Arabic code point);
 * - spaces collapse, a ZWNJ next to a space is dropped, and the result is NFC.
 */
export function normalizeText(raw: string): string {
  let text = restoreZeroWidthNonJoiners(raw).replace(PRESENTATION_FORM_RUN, (run) =>
    run.normalize('NFKC'),
  );
  if (isPersian(text)) {
    text = text
      .replace(/ي/gu, 'ی')
      .replace(/ك/gu, 'ک')
      .replace(/ھ/gu, 'ه')
      .replace(ARABIC_INDIC_DIGIT, (digit) =>
        String.fromCodePoint(digit.codePointAt(0)! - 0x0660 + 0x06f0),
      );
  }
  return text
    .replace(/[ \t ]+/gu, ' ')
    .replace(/ ?‌ ?/gu, (match) => (match === ZWNJ ? ZWNJ : ' '))
    .trim()
    .normalize('NFC');
}
