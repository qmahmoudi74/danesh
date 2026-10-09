import { z } from './schema.ts';
import { HostPortSchema, HostKindSchema } from './host-protocol.ts';

export const InitSchema = z.strictObject({
  type: z.literal('init'), libraryRoot: z.string().min(1), appVersion: z.string(), electronVersion: z.string(),
  platform: z.string(), arch: z.string(), mainPid: z.number().int().positive(), exePath: z.string(),
  locale: z.string(), osName: z.string(), osVersion: z.string(),
});
export const MainToCoreSchema = z.discriminatedUnion('type', [InitSchema, z.strictObject({ type: z.literal('renderer-port') }), HostPortSchema, z.strictObject({ type: z.literal('export-target'), token: z.string().uuid(), path: z.string().min(1).max(32767) })]);
export const CoreToMainSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), corePid: z.number().int().positive() }),
  z.strictObject({ type: z.literal('spawn-host'), kind: HostKindSchema }),
  z.strictObject({ type: z.literal('export-target-ready'), token: z.string().uuid() }),
]);
export type Init = z.infer<typeof InitSchema>;
