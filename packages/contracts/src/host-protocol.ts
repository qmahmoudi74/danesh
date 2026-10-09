import { z } from './schema.ts';
export const HostKindSchema = z.enum(['sample']);
const LogEventSchema = z.string().regex(/^[a-z][\w.-]{0,63}$/i);
export const HostPortSchema = z.strictObject({ type: z.literal('host-port'), kind: HostKindSchema });
export const EchoInputSchema = z.strictObject({ type: z.literal('echo'), value: z.string().max(2000) });
export const CoreToHostSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello') }),
  z.strictObject({ type: z.literal('run'), taskId: z.string().min(1), input: EchoInputSchema }),
]);
export const HostToCoreSchema = z.union([
  z.strictObject({ type: z.literal('hello-ack'), hostPid: z.number().int().positive(), kind: HostKindSchema }),
  z.strictObject({ type: z.literal('heartbeat') }),
  z.strictObject({ type: z.literal('result'), taskId: z.string().min(1), ok: z.literal(true), output: z.unknown() }),
  z.strictObject({ type: z.literal('result'), taskId: z.string().min(1), ok: z.literal(false), errorClass: z.string().max(200) }),
  // Hosts have no log file of their own: they send metadata-only records for Core to write (D-16).
  z.strictObject({ type: z.literal('log'), event: LogEventSchema, fields: z.record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])) }),
  z.strictObject({ type: z.literal('rejected'), schema: LogEventSchema, errorClass: z.string().regex(/^[A-Za-z]{1,64}$/), byteLength: z.number().int().min(0) }),
]);
