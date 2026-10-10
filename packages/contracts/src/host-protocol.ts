import { SampleChunkInputSchema } from './jobs.ts';
import { z } from './schema.ts';
export const HostKindSchema = z.enum(['sample', 'llm', 'ocr', 'tts', 'pdf']);
export type HostKind = z.infer<typeof HostKindSchema>;
const LogEventSchema = z.string().regex(/^[a-z][\w.-]{0,63}$/i);
const AssetPath = z.string().min(1).max(32767);
export const HostPortSchema = z.strictObject({
  type: z.literal('host-port'),
  kind: HostKindSchema,
});
export const EchoInputSchema = z.strictObject({
  type: z.literal('echo'),
  value: z.string().max(2000),
});
/** Packaging probes (D-23): each host accepts only its own probe; asset paths arrive from Core, never from the page. */
export const LlmProbeInputSchema = z.strictObject({
  type: z.literal('llm-probe'),
  modelPath: AssetPath,
});
export const OcrProbeInputSchema = z.strictObject({
  type: z.literal('ocr-probe'),
  langDir: AssetPath,
  imagePath: AssetPath,
  expectedFirstWord: z.string().min(1).max(64),
});
export const TtsProbeInputSchema = z.strictObject({
  type: z.literal('tts-probe'),
  modelPath: AssetPath,
  configPath: AssetPath,
});
/** Test builds only: the next run makes the host exit, to prove a crash fails only its own check. */
export const FaultInputSchema = z.strictObject({
  type: z.literal('fault'),
  mode: z.literal('crash'),
});
/** PDF host: paths come from Core (a verified content-addressed blob), never from the page. */
export const PdfInspectInputSchema = z.strictObject({
  type: z.literal('pdf-inspect'),
  path: AssetPath,
});
export const PdfExtractPageInputSchema = z.strictObject({
  type: z.literal('pdf-extract-page'),
  path: AssetPath,
  pageNumber: z.number().int().positive().max(100_000),
});
export const RunInputSchema = z.discriminatedUnion('type', [
  SampleChunkInputSchema,
  PdfInspectInputSchema,
  PdfExtractPageInputSchema,
  EchoInputSchema,
  LlmProbeInputSchema,
  OcrProbeInputSchema,
  TtsProbeInputSchema,
  FaultInputSchema,
]);
export type RunInput = z.infer<typeof RunInputSchema>;
export const CoreToHostSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello') }),
  z.strictObject({
    type: z.literal('run'),
    taskId: z.string().min(1).max(128),
    input: RunInputSchema,
  }),
]);
export const HostToCoreSchema = z.union([
  z.strictObject({
    type: z.literal('hello-ack'),
    hostPid: z.number().int().positive(),
    kind: HostKindSchema,
    entry: z.string().max(32767).optional(),
  }),
  z.strictObject({ type: z.literal('heartbeat') }),
  z.strictObject({
    type: z.literal('result'),
    taskId: z.string().min(1).max(128),
    ok: z.literal(true),
    output: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('result'),
    taskId: z.string().min(1).max(128),
    ok: z.literal(false),
    errorClass: z.string().max(200),
  }),
  // Hosts have no log file of their own: they send metadata-only records for Core to write (D-16).
  z.strictObject({
    type: z.literal('log'),
    event: LogEventSchema,
    fields: z.record(
      z.string().max(64),
      z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
    ),
  }),
  z.strictObject({
    type: z.literal('rejected'),
    schema: LogEventSchema,
    errorClass: z.string().regex(/^[A-Za-z]{1,64}$/),
    byteLength: z.number().int().min(0),
  }),
]);
