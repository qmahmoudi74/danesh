import { z } from './schema.ts';

export const CHECK_ORDER = [
  'app-launch',
  'database',
  'cas-storage',
  'engine-llm',
  'engine-ocr',
  'engine-tts',
  'ui-responsive',
  'egress-zero',
  'fuses',
  'codesign',
] as const;
/** Per-check limits sized for first runs (Windows Defender scanning a new binary); a check over its limit fails as 'timeout'. */
export const CHECK_TIMEOUT_MS = { engine: 90_000, default: 15_000 } as const;
// Forward-compatible names remain bounded; known checks keep their canonical order.
export const CheckIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/);
export const CheckResultSchema = z.strictObject({
  checkId: CheckIdSchema,
  status: z.enum(['pass', 'fail', 'not-run']),
  durationMs: z.number().int().nonnegative(),
  detail: z.string().max(2000),
  fields: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  outputSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const SmokeReportSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    appVersion: z.string(),
    electronVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    overall: z.enum(['pass', 'fail']),
    checks: z.array(CheckResultSchema).nonempty(),
  })
  .superRefine((report, ctx) => {
    let previous = -1;
    const seen = new Set<string>();
    for (const check of report.checks) {
      const index = (CHECK_ORDER as readonly string[]).indexOf(check.checkId);
      if (seen.has(check.checkId) || (index >= 0 && index <= previous))
        ctx.addIssue({
          code: 'custom',
          message: 'Checks must be unique and known checks in CHECK_ORDER order',
          path: ['checks'],
        });
      seen.add(check.checkId);
      if (index >= 0) previous = index;
    }
    // overall is derived, never asserted: pass only when every check passed.
    const derived = report.checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
    if (report.overall !== derived)
      ctx.addIssue({
        code: 'custom',
        message: 'overall must be pass exactly when every check passed',
        path: ['overall'],
      });
  });
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type SmokeReport = z.infer<typeof SmokeReportSchema>;
