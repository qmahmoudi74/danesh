import { z } from './schema.ts';
import type { RpcMethod } from './rpc.ts';

export const ChooseExportOutputSchema = z.strictObject({ token: z.string().uuid().nullable() });
export const shellMethods: Record<string, RpcMethod> = {
  'shell.chooseExportPath': { input: z.strictObject({}), output: ChooseExportOutputSchema, maxInputBytes: 128 },
};
export const shellEventPayloads: Record<string, z.ZodType> = {
  'shell.navigate': z.strictObject({ route: z.enum(['#/', '#/system-check']) }),
  'shell.coreState': z.strictObject({ state: z.enum(['starting', 'ready', 'unreachable']) }),
};
