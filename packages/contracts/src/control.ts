import { HostKindSchema, HostPortSchema } from './host-protocol.ts';
import { z } from './schema.ts';

export const InitSchema = z.strictObject({
  type: z.literal('init'),
  libraryRoot: z.string().min(1),
  appVersion: z.string(),
  electronVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  mainPid: z.number().int().positive(),
  exePath: z.string(),
  locale: z.string(),
  osName: z.string(),
  osVersion: z.string(),
  packaged: z.boolean(),
  /** Packaging-probe assets: resources/probes when packaged, the repository folder in development. */
  probesDir: z.string().min(1).max(32767),
});
export const MainToCoreSchema = z.discriminatedUnion('type', [
  InitSchema,
  z.strictObject({ type: z.literal('renderer-port') }),
  HostPortSchema,
  z.strictObject({
    type: z.literal('host-exited'),
    kind: HostKindSchema,
    exitCode: z.number().int(),
    requested: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('export-target'),
    token: z.string().uuid(),
    path: z.string().min(1).max(32767),
    ttlMs: z.number().int().min(1000).max(600_000).optional(),
  }),
]);
export const CoreToMainSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), corePid: z.number().int().positive() }),
  z.strictObject({ type: z.literal('spawn-host'), kind: HostKindSchema }),
  z.strictObject({ type: z.literal('export-target-ready'), token: z.string().uuid() }),
  z.strictObject({ type: z.literal('stop-host'), kind: HostKindSchema }),
]);
export type Init = z.infer<typeof InitSchema>;
