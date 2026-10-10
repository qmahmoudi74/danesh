import { BoxSchema, DirectionSchema, PdfPageStatusSchema } from './pdf.ts';
import { ResponsivenessInputSchema } from './responsiveness.ts';
import { z } from './schema.ts';
import { CheckIdSchema, SmokeReportSchema } from './smoke-report.ts';

export type RpcMethod = {
  input: z.ZodType;
  output: z.ZodType;
  maxInputBytes: number;
  /** Deadline for one call; the default (10 s) suits everything except work proportional to a file's size. */
  timeoutMs?: number;
};
export const SystemInfoSchema = z.strictObject({
  appVersion: z.string(),
  electronVersion: z.string(),
  osName: z.string(),
  osVersion: z.string(),
  arch: z.string(),
  locale: z.string(),
  libraryRoot: z.string(),
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;
export const DiagRejectedSchema = z.strictObject({
  schema: z.string().regex(/^[a-z][\w.-]{0,63}$/i),
  errorClass: z.enum([
    'InvalidEnvelope',
    'UnknownMethod',
    'PayloadTooLarge',
    'SchemaMismatch',
    'Unserializable',
  ]),
  byteLength: z.number().int().min(0).max(100_000_000),
});
/** Library state shown on Home. Details are technical-only values (paths, versions, ids). */
export const AppStatusSchema = z.strictObject({
  state: z.enum(['starting', 'ready', 'refused-newer', 'read-only-recovery', 'failed']),
  details: z.strictObject({
    dbUserVersion: z.number().int().optional(),
    supportedVersion: z.number().int().optional(),
    backupPath: z.string().max(32767).optional(),
    failedMigrationId: z.string().max(16).optional(),
    errorClass: z.string().max(64).optional(),
  }),
});
export type AppStatus = z.infer<typeof AppStatusSchema>;
/** A PDF in the library. Only the original is stored: nothing has been extracted from it yet. */
export const DocumentSchema = z.strictObject({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(1000),
  byteSize: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  importedAt: z.number().int().nonnegative(),
  status: z.literal('original'),
});
export type LibraryDocument = z.infer<typeof DocumentSchema>;
export const ImportFailureSchema = z.enum([
  'not-pdf',
  'encrypted',
  'damaged',
  'too-large',
  'unreadable',
  'unknown-token',
]);
export type ImportFailure = z.infer<typeof ImportFailureSchema>;
const FILE_TIMEOUT_MS = 120_000;
const PageNumbers = z.array(z.number().int().positive()).max(100_000);
/** interrupted: recorded as running, but no worker is running it (Danesh was closed or crashed). */
export const ExtractionStatusSchema = z.strictObject({
  state: z.enum(['none', 'running', 'interrupted', 'completed', 'failed']),
  pagesDone: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  errorClass: z.string().max(64).optional(),
  needsOcr: PageNumbers,
  needsReview: PageNumbers,
});
export type ExtractionStatus = z.infer<typeof ExtractionStatusSchema>;
export const TextBlockSchema = z.strictObject({
  blockId: z.string().regex(/^[0-9a-f]{24}$/),
  pageNumber: z.number().int().positive(),
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(['heading', 'paragraph']),
  normalizedText: z.string().max(200_000),
  direction: DirectionSchema,
  box: BoxSchema,
  flags: z.array(z.string().max(64)).max(16),
});
export const TextPageSchema = z.strictObject({
  pageNumber: z.number().int().positive(),
  status: PdfPageStatusSchema,
  flags: z.array(z.string().max(64)).max(16),
  blocks: z.array(TextBlockSchema).max(10_000),
});
export type TextPage = z.infer<typeof TextPageSchema>;
/** Pages per documents.text call: bounded messages for long documents. */
export const TEXT_PAGES_PER_CALL = 25;
export const rpcMethods: Record<string, RpcMethod> = {
  'documents.list': {
    input: z.strictObject({}),
    output: z.strictObject({ documents: z.array(DocumentSchema).max(100_000) }),
    maxInputBytes: 128,
  },
  // The token comes from shell.choosePdf: Main registered the chosen path with Core; the page never names a path.
  'documents.import': {
    input: z.strictObject({ token: z.string().uuid() }),
    output: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), document: DocumentSchema, duplicate: z.boolean() }),
      z.strictObject({ ok: z.literal(false), reason: ImportFailureSchema }),
    ]),
    maxInputBytes: 256,
    timeoutMs: FILE_TIMEOUT_MS,
  },
  'documents.extract': {
    input: z.strictObject({ documentId: z.string().uuid() }),
    output: ExtractionStatusSchema,
    maxInputBytes: 256,
  },
  'documents.extraction': {
    input: z.strictObject({ documentId: z.string().uuid() }),
    output: ExtractionStatusSchema,
    maxInputBytes: 256,
  },
  'documents.text': {
    input: z
      .strictObject({
        documentId: z.string().uuid(),
        fromPage: z.number().int().positive(),
        toPage: z.number().int().positive(),
      })
      .refine(
        (range) =>
          range.toPage >= range.fromPage && range.toPage - range.fromPage < TEXT_PAGES_PER_CALL,
      ),
    output: z.strictObject({ pages: z.array(TextPageSchema).max(TEXT_PAGES_PER_CALL) }),
    maxInputBytes: 256,
  },
  // The verified original bytes, for the page viewer.
  'documents.content': {
    input: z.strictObject({ documentId: z.string().uuid() }),
    output: z.strictObject({ bytes: z.instanceof(Uint8Array) }),
    maxInputBytes: 256,
    timeoutMs: FILE_TIMEOUT_MS,
  },
  'system.info': { input: z.strictObject({}), output: SystemInfoSchema, maxInputBytes: 1024 },
  'app.status': { input: z.strictObject({}), output: AppStatusSchema, maxInputBytes: 256 },
  'system.ping': {
    input: z.strictObject({ n: z.number().int().min(0).max(1_000_000) }),
    output: z.strictObject({ n: z.number().int(), corePid: z.number().int().positive() }),
    maxInputBytes: 256,
  },
  'systemCheck.run': {
    input: z.strictObject({}),
    output: z.strictObject({
      runId: z.string().uuid(),
      checkIds: z.array(CheckIdSchema).max(100).optional(),
    }),
    maxInputBytes: 1024,
  },
  'systemCheck.get': {
    input: z.strictObject({ runId: z.string().uuid() }),
    output: SmokeReportSchema,
    maxInputBytes: 1024,
  },
  'systemCheck.export': {
    input: z.strictObject({ runId: z.string().uuid(), token: z.string().uuid() }),
    output: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true) }),
      z.strictObject({
        ok: z.literal(false),
        reason: z.enum(['write-failed', 'unknown-token', 'unknown-run']),
      }),
    ]),
    maxInputBytes: 1024,
  },
  // The renderer's heartbeat lateness while the engine group ran (integer ms, at most 4000 samples; ADR 0003 PK5).
  'systemCheck.reportResponsiveness': {
    input: ResponsivenessInputSchema,
    output: z.strictObject({}),
    // Two aligned bounded arrays plus idle samples and long-task metadata fit within 64 KiB.
    maxInputBytes: 65_536,
  },
  // Preload-side rejections are reported here so Core logs them with sender 'preload' (metadata only, D-16).
  'diag.rejected': { input: DiagRejectedSchema, output: z.strictObject({}), maxInputBytes: 256 },
};
export const RpcErrorCodeSchema = z.enum([
  'UNKNOWN_METHOD',
  'INVALID_INPUT',
  'PAYLOAD_TOO_LARGE',
  'UNAVAILABLE',
  'READ_ONLY',
  'INTERNAL',
]);
export type RpcErrorCode = z.infer<typeof RpcErrorCodeSchema>;
export const RpcRequestSchema = z.strictObject({
  id: z.number().int().positive(),
  method: z.string().max(128),
  input: z.unknown(),
});
export const RpcResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number().int().positive(), ok: z.literal(true), output: z.unknown() }),
  z.strictObject({
    id: z.number().int().positive(),
    ok: z.literal(false),
    error: z.strictObject({ code: RpcErrorCodeSchema, schema: z.string().optional() }),
  }),
]);
export const eventPayloads: Record<string, z.ZodType> = {
  'systemCheck.progress': z.strictObject({
    runId: z.string().uuid(),
    checkId: CheckIdSchema,
    status: z.enum(['pending', 'running', 'pass', 'fail', 'not-run']),
  }),
  'systemCheck.finished': z.strictObject({ runId: z.string().uuid() }),
};
export const RpcEventSchema = z.strictObject({ topic: z.string(), payload: z.unknown() });
export type DaneshApi = {
  call(method: string, input: unknown): Promise<unknown>;
  on(topic: string, callback: (payload: unknown) => void): () => void;
};
