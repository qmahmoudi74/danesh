import { HostKindSchema } from './host-protocol.ts';
import type { RpcMethod } from './rpc.ts';
import { z } from './schema.ts';
import { CheckIdSchema, CheckResultSchema } from './smoke-report.ts';
/** checks are canned results; live lists real checks that still run alongside them (e.g. one probe forced to crash). */
export const CheckRunFixtureSchema = z.strictObject({
  delayMs: z.number().int().min(0).max(15000),
  checks: z.array(CheckResultSchema).min(1).max(100).optional(),
  live: z.array(CheckIdSchema).max(20).optional(),
});
export const EngineEchoOutputSchema = z.strictObject({
  hostPid: z.number().int().positive(),
  corePid: z.number().int().positive(),
});
/** Present only in test builds; tools/assert-no-test-hooks.ts proves production output never contains it. */
export const TEST_HOOKS_SENTINEL =
  typeof __TEST_HOOKS__ !== 'undefined' && __TEST_HOOKS__
    ? 'DANESH_TEST_HOOKS_SENTINEL'
    : undefined;
export const testRpcMethods: Record<string, RpcMethod> =
  typeof __TEST_HOOKS__ !== 'undefined' && __TEST_HOOKS__
    ? {
        'test.engineFault': {
          input: z.strictObject({
            kind: HostKindSchema,
            mode: z.enum(['kill', 'exit0', 'exit1', 'abort', 'spin', 'oom']),
            when: z.enum(['now', 'next-task']),
          }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 256,
        },
        'test.sampleFault': {
          input: z.strictObject({
            chunkIndex: z.number().int().min(1).max(64),
            mode: z.enum(['always-fail', 'none']),
          }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 256,
        },
        'test.sampleDelay': {
          input: z.strictObject({ ms: z.number().int().min(0).max(10_000) }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 128,
        },
        'test.sampleChunks': {
          input: z.strictObject({ n: z.number().int().min(1).max(64) }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 128,
        },
        'test.engineEcho': {
          input: z.strictObject({}),
          output: EngineEchoOutputSchema,
          maxInputBytes: 128,
          // Starts a host process: the deadline covers a spawn on a busy machine.
          timeoutMs: 30_000,
        },
        'test.checkRun': {
          input: CheckRunFixtureSchema,
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 65536,
        },
        'test.coreStall': {
          input: z.strictObject({ ms: z.number().int().min(0).max(60000) }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 128,
        },
        // Exercises the same write guard future write requests use; refused with READ_ONLY outside the ready state.
        'test.writeProbe': {
          input: z.strictObject({}),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 128,
        },
        'test.probeFault': {
          input: z.strictObject({ kind: z.enum(['llm', 'ocr', 'tts']), mode: z.literal('crash') }),
          output: z.strictObject({ ok: z.literal(true) }),
          maxInputBytes: 128,
        },
        // Preload forwards the inner request to Core without local validation, to prove Core validates independently.
        'test.raw': {
          input: z.strictObject({ method: z.string().max(128), input: z.unknown() }),
          output: z.unknown(),
          maxInputBytes: 65536,
        },
      }
    : {};
