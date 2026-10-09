import { z } from 'zod';
import { CheckIdSchema, SmokeReportSchema } from './smoke-report.ts';

export type RpcMethod = { input: z.ZodType; output: z.ZodType; maxInputBytes: number };
export const rpcMethods: Record<string, RpcMethod> = {
  'system.ping': { input: z.strictObject({ n: z.number().int().min(0).max(1_000_000) }), output: z.strictObject({ n: z.number().int(), corePid: z.number().int().positive() }), maxInputBytes: 128 },
  'systemCheck.run': { input: z.strictObject({}), output: z.strictObject({ runId: z.string().uuid() }), maxInputBytes: 128 },
  'systemCheck.get': { input: z.strictObject({ runId: z.string().uuid() }), output: SmokeReportSchema, maxInputBytes: 128 },
};
export const RpcErrorCodeSchema = z.enum(['UNKNOWN_METHOD', 'INVALID_INPUT', 'PAYLOAD_TOO_LARGE', 'UNAVAILABLE', 'READ_ONLY', 'INTERNAL']);
export type RpcErrorCode = z.infer<typeof RpcErrorCodeSchema>;
export const RpcRequestSchema = z.strictObject({ id: z.number().int().positive(), method: z.string().max(128), input: z.unknown() });
export const RpcResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number().int().positive(), ok: z.literal(true), output: z.unknown() }),
  z.strictObject({ id: z.number().int().positive(), ok: z.literal(false), error: z.strictObject({ code: RpcErrorCodeSchema, schema: z.string().optional() }) }),
]);
export const eventPayloads: Record<string, z.ZodType> = {
  'systemCheck.progress': z.strictObject({ runId: z.string().uuid(), checkId: CheckIdSchema, status: z.enum(['running', 'pass', 'fail', 'not-run']) }),
  'systemCheck.finished': z.strictObject({ runId: z.string().uuid() }),
};
export const RpcEventSchema = z.strictObject({ topic: z.string(), payload: z.unknown() });
export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
export type RpcEvent = z.infer<typeof RpcEventSchema>;
export type DaneshApi = { call(method: string, input: unknown): Promise<unknown>; on(topic: string, callback: (payload: unknown) => void): () => void };
