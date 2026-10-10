import { z } from './schema.ts';

const Milliseconds = z.number().int().min(0).max(600_000);
export const ResponsivenessDiagnosticsSchema = z.strictObject({
  startedAtEpochMs: z.number().finite().positive(),
  idleSamplesMs: z.array(z.number().int().min(0).max(60_000)).max(100),
  sampleElapsedMs: z.array(Milliseconds).max(4000),
  longTasksSupported: z.boolean(),
  longTasks: z.array(z.strictObject({ startMs: Milliseconds, durationMs: Milliseconds })).max(100),
  visibility: z.enum(['visible', 'hidden']),
});
export type ResponsivenessDiagnostics = z.infer<typeof ResponsivenessDiagnosticsSchema>;
export const ResponsivenessInputSchema = z
  .strictObject({
    runId: z.string().uuid(),
    intervalMs: z.number().int().min(10).max(1000),
    samplesMs: z.array(z.number().int().min(0).max(60_000)).max(4000),
    diagnostics: ResponsivenessDiagnosticsSchema.optional(),
  })
  .superRefine((input, context) => {
    const elapsed = input.diagnostics?.sampleElapsedMs;
    if (!elapsed) return;
    if (
      elapsed.length !== input.samplesMs.length ||
      elapsed.some((value, index) => index > 0 && value <= elapsed[index - 1]!)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['diagnostics', 'sampleElapsedMs'],
        message: 'Each sample needs one strictly increasing timestamp',
      });
    }
  });
