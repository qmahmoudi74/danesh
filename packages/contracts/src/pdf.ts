import { z } from './schema.ts';

/** The extractor's identity: stored with every result so a later extractor never overwrites or mixes with it. */
export const EXTRACTOR_VERSION = 'pdfjs-6.4.299+layout-1';

const Fraction = z.number().min(-0.5).max(1.5);
export const BoxSchema = z.tuple([Fraction, Fraction, Fraction, Fraction]);
export const DirectionSchema = z.enum(['rtl', 'ltr', 'mixed']);
const Flags = z.array(z.string().regex(/^[a-z][a-z-]{1,63}$/)).max(16);

export const PdfPageStatusSchema = z.enum(['text', 'needs-review', 'needs-ocr', 'empty']);
export type PdfPageStatus = z.infer<typeof PdfPageStatusSchema>;

export const ExtractedBlockSchema = z.strictObject({
  ordinal: z.number().int().min(0).max(10_000),
  kind: z.enum(['heading', 'paragraph']),
  rawText: z.string().max(200_000),
  normalizedText: z.string().max(200_000),
  direction: DirectionSchema,
  box: BoxSchema,
  lines: z
    .array(
      z.strictObject({ text: z.string().max(20_000), direction: DirectionSchema, box: BoxSchema }),
    )
    .max(2_000),
  flags: Flags,
});
export type ExtractedBlock = z.infer<typeof ExtractedBlockSchema>;

export const ExtractedPageSchema = z.strictObject({
  pageNumber: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  status: PdfPageStatusSchema,
  flags: Flags,
  blocks: z.array(ExtractedBlockSchema).max(10_000),
});
export type ExtractedPage = z.infer<typeof ExtractedPageSchema>;

export const PdfFactsSchema = z.strictObject({
  pageCount: z.number().int().positive(),
  title: z.string().max(300).optional(),
});

/** Why the PDF host could not read a file (returned, not thrown, so the reason survives the process boundary). */
export const PdfRejectionSchema = z.enum(['encrypted', 'damaged', 'unreadable']);
export type PdfRejection = z.infer<typeof PdfRejectionSchema>;
export const PdfInspectOutputSchema = z.union([
  z.strictObject({ ok: z.literal(true), facts: PdfFactsSchema }),
  z.strictObject({ ok: z.literal(false), reason: PdfRejectionSchema }),
]);
export const PdfExtractOutputSchema = z.union([
  z.strictObject({ ok: z.literal(true), page: ExtractedPageSchema }),
  z.strictObject({ ok: z.literal(false), reason: PdfRejectionSchema }),
]);
