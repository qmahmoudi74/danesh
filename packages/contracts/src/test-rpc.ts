import { z } from 'zod';
import type { RpcMethod } from './rpc.ts';
export const EngineEchoOutputSchema = z.strictObject({ hostPid: z.number().int().positive(), corePid: z.number().int().positive() });
export const testRpcMethods: Record<string, RpcMethod> = typeof __TEST_HOOKS__ !== 'undefined' && __TEST_HOOKS__ ? {
  'test.engineEcho': { input: z.strictObject({}), output: EngineEchoOutputSchema, maxInputBytes: 128 },
} : {};
