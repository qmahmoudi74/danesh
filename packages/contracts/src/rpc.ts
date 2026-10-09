import { z } from './schema.ts';
import { CheckIdSchema, SmokeReportSchema } from './smoke-report.ts';

export type RpcMethod = { input: z.ZodType; output: z.ZodType; maxInputBytes: number };
export const SystemInfoSchema = z.strictObject({ appVersion: z.string(), electronVersion: z.string(), osName: z.string(), osVersion: z.string(), arch: z.string(), locale: z.string(), libraryRoot: z.string() });
export type SystemInfo = z.infer<typeof SystemInfoSchema>;
export const rpcMethods: Record<string, RpcMethod> = {
  'system.info': { input: z.strictObject({}), output: SystemInfoSchema, maxInputBytes: 128 },
  'system.ping': { input: z.strictObject({ n: z.number().int().min(0).max(1_000_000) }), output: z.strictObject({ n: z.number().int(), corePid: z.number().int().positive() }), maxInputBytes: 128 },
  'systemCheck.run': { input: z.strictObject({}), output: z.strictObject({ runId: z.string().uuid(), checkIds: z.array(CheckIdSchema).max(100).optional() }), maxInputBytes: 128 },
  'systemCheck.get': { input: z.strictObject({ runId: z.string().uuid() }), output: SmokeReportSchema, maxInputBytes: 128 },
  'systemCheck.export': { input: z.strictObject({ runId: z.string().uuid(), token: z.string().uuid() }), output: z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true) }), z.strictObject({ ok: z.literal(false), reason: z.enum(['write-failed', 'unknown-token', 'unknown-run']) })]), maxInputBytes: 256 },
};
export const RpcErrorCodeSchema = z.enum(['UNKNOWN_METHOD', 'INVALID_INPUT', 'PAYLOAD_TOO_LARGE', 'UNAVAILABLE', 'READ_ONLY', 'INTERNAL']);
export type RpcErrorCode = z.infer<typeof RpcErrorCodeSchema>;
export const RpcRequestSchema = z.strictObject({ id: z.number().int().positive(), method: z.string().max(128), input: z.unknown() });
export const RpcResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number().int().positive(), ok: z.literal(true), output: z.unknown() }),
  z.strictObject({ id: z.number().int().positive(), ok: z.literal(false), error: z.strictObject({ code: RpcErrorCodeSchema, schema: z.string().optional() }) }),
]);
export const eventPayloads: Record<string, z.ZodType> = {
  'systemCheck.progress': z.strictObject({ runId: z.string().uuid(), checkId: CheckIdSchema, status: z.enum(['pending', 'running', 'pass', 'fail', 'not-run']) }),
  'systemCheck.finished': z.strictObject({ runId: z.string().uuid() }),
};
export const RpcEventSchema = z.strictObject({ topic: z.string(), payload: z.unknown() });
export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
export type RpcEvent = z.infer<typeof RpcEventSchema>;
export type DaneshApi = { call(method: string, input: unknown): Promise<unknown>; on(topic: string, callback: (payload: unknown) => void): () => void };
