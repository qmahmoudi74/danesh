import { z } from 'zod';
import { HostPortSchema, HostKindSchema } from './host-protocol.ts';

export const InitSchema = z.strictObject({
  type: z.literal('init'), libraryRoot: z.string().min(1), appVersion: z.string(), electronVersion: z.string(),
  platform: z.string(), arch: z.string(), mainPid: z.number().int().positive(), exePath: z.string(),
});
export const MainToCoreSchema = z.discriminatedUnion('type', [InitSchema, z.strictObject({ type: z.literal('renderer-port') }), HostPortSchema]);
export const CoreToMainSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), corePid: z.number().int().positive() }),
  z.strictObject({ type: z.literal('spawn-host'), kind: HostKindSchema }),
]);
export type Init = z.infer<typeof InitSchema>;
