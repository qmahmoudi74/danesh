import { z } from 'zod';
import type { RpcMethod } from './rpc.ts';
export const testRpcMethods: Record<string, RpcMethod> = {
  'test.engineEcho': { input: z.strictObject({}), output: z.strictObject({ hostPid: z.number().int().positive(), corePid: z.number().int().positive() }), maxInputBytes: 128 },
};
