import { z } from 'zod';
export const HostKindSchema = z.enum(['sample']);
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
]);
