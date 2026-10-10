import { z } from './schema.ts';

export const JobStateSchema = z.enum([
  'queued',
  'running',
  'paused',
  'blocked',
  'failed',
  'cancelled',
  'completed',
  'completed_with_issues',
]);
export const TaskStateSchema = z.enum(['queued', 'running', 'done', 'failed', 'quarantined']);
export const SampleJobSnapshotSchema = z
  .strictObject({
    jobId: z.string().uuid(),
    state: JobStateSchema,
    total: z.number().int().min(0).max(64),
    committed: z.number().int().min(0).max(64),
    chunks: z
      .array(
        z.strictObject({
          index: z.number().int().min(1).max(64),
          state: TaskStateSchema,
          attempt: z.number().int().nonnegative(),
        }),
      )
      .max(64),
    resumedFromUnit: z.number().int().positive().nullable(),
    notRedoneCount: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    finishedAt: z.number().int().nonnegative().nullable(),
  })
  .refine(
    (value) =>
      value.total === value.chunks.length &&
      value.committed === value.chunks.filter((chunk) => chunk.state === 'done').length,
    'Progress must equal committed tasks',
  );
export type SampleJobSnapshot = z.infer<typeof SampleJobSnapshotSchema>;
export const SampleChunkInputSchema = z.strictObject({
  type: z.literal('sampleChunk'),
  index: z.number().int().min(1).max(64),
  text: z.string().max(200_000),
  delayMs: z.number().int().min(0).max(10_000),
  fail: z.boolean(),
});
export const SampleChunkResultSchema = z.strictObject({
  index: z.number().int().min(1).max(64),
  sha256: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]{64}$/),
  length: z.number().int().nonnegative(),
});
