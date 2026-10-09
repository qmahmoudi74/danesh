import { z } from 'zod';

export const CHECK_ORDER = ['app-launch', 'database', 'cas-storage', 'engine-llm', 'engine-ocr', 'engine-tts', 'ui-responsive', 'egress-zero', 'fuses', 'codesign'] as const;
export const CheckIdSchema = z.enum(CHECK_ORDER);
export const CheckResultSchema = z.strictObject({
  checkId: CheckIdSchema,
  status: z.enum(['pass', 'fail', 'not-run']),
  durationMs: z.number().int().nonnegative(),
  detail: z.string().max(2000),
  fields: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  outputSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const SmokeReportSchema = z.strictObject({
  schemaVersion: z.literal(1), appVersion: z.string(), electronVersion: z.string(),
  platform: z.string(), arch: z.string(), startedAt: z.iso.datetime(), finishedAt: z.iso.datetime(),
  overall: z.enum(['pass', 'fail']), checks: z.array(CheckResultSchema).nonempty(),
}).superRefine((report, ctx) => {
  let previous = -1;
  for (const check of report.checks) {
    const index = CHECK_ORDER.indexOf(check.checkId);
    if (index <= previous) ctx.addIssue({ code: 'custom', message: 'Checks must be unique and in CHECK_ORDER order', path: ['checks'] });
    previous = index;
  }
});
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type SmokeReport = z.infer<typeof SmokeReportSchema>;
