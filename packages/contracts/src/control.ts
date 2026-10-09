import { z } from 'zod';

export const InitSchema = z.strictObject({
  type: z.literal('init'), libraryRoot: z.string().min(1), appVersion: z.string(), electronVersion: z.string(),
  platform: z.string(), arch: z.string(), mainPid: z.number().int().positive(), exePath: z.string(),
});
export const MainToCoreSchema = z.discriminatedUnion('type', [InitSchema, z.strictObject({ type: z.literal('renderer-port') })]);
export const CoreToMainSchema = z.strictObject({ type: z.literal('ready'), corePid: z.number().int().positive() });
export type Init = z.infer<typeof InitSchema>;
