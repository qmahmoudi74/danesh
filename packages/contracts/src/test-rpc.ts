import { z } from './schema.ts';
import type { RpcMethod } from './rpc.ts';
import { CheckResultSchema } from './smoke-report.ts';
export const CheckRunFixtureSchema = z.strictObject({ delayMs: z.number().int().min(0).max(15000), checks: z.array(CheckResultSchema).min(1).max(100).optional() });
export const EngineEchoOutputSchema = z.strictObject({ hostPid: z.number().int().positive(), corePid: z.number().int().positive() });
/** Present only in test builds; tools/assert-no-test-hooks.ts proves production output never contains it. */
export const TEST_HOOKS_SENTINEL = typeof __TEST_HOOKS__ !== 'undefined' && __TEST_HOOKS__ ? 'DANESH_TEST_HOOKS_SENTINEL' : undefined;
export const testRpcMethods: Record<string, RpcMethod> = typeof __TEST_HOOKS__ !== 'undefined' && __TEST_HOOKS__ ? {
  'test.engineEcho': { input: z.strictObject({}), output: EngineEchoOutputSchema, maxInputBytes: 128 },
  'test.checkRun': { input: CheckRunFixtureSchema, output: z.strictObject({ ok: z.literal(true) }), maxInputBytes: 65536 },
  'test.coreStall': { input: z.strictObject({ ms: z.number().int().min(0).max(60000) }), output: z.strictObject({ ok: z.literal(true) }), maxInputBytes: 128 },
  // Preload forwards the inner request to Core without local validation, to prove Core validates independently.
  'test.raw': { input: z.strictObject({ method: z.string().max(128), input: z.unknown() }), output: z.unknown(), maxInputBytes: 65536 },
} : {};
