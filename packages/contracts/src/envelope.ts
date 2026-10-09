import { RpcRequestSchema, type RpcErrorCode, type RpcMethod } from './rpc.ts';

export type RejectionClass = 'InvalidEnvelope' | 'UnknownMethod' | 'PayloadTooLarge' | 'SchemaMismatch' | 'Unserializable';
export type Validation =
  | { ok: true; id: number; method: string; input: unknown; byteLength: number }
  | { ok: false; id: number | undefined; code: RpcErrorCode; schema: string; errorClass: RejectionClass; byteLength: number };

/** Serialized UTF-8 size, not JavaScript string length; JSON.stringify escapes lone surrogates, so it is deterministic. */
export function utf8ByteLength(value: unknown): number {
  const text = JSON.stringify(value);
  return text === undefined ? 0 : new TextEncoder().encode(text).byteLength;
}

/**
 * The single request validator used by both the preload and Core: exact method lookup (no trimming or case folding),
 * UTF-8 byte limit, then strict schema parse. The schema name in a rejection is the contract name or a fixed label,
 * never the caller-supplied method string.
 */
export function validateRequest(raw: unknown, methods: Record<string, RpcMethod>): Validation {
  let byteLength: number;
  try { byteLength = utf8ByteLength(raw); } catch { return { ok: false, id: undefined, code: 'INVALID_INPUT', schema: 'envelope', errorClass: 'Unserializable', byteLength: 0 }; }
  const envelope = RpcRequestSchema.safeParse(raw);
  if (!envelope.success) {
    const id = typeof raw === 'object' && raw !== null && 'id' in raw && Number.isInteger(raw.id) && (raw.id as number) > 0 ? raw.id as number : undefined;
    return { ok: false, id, code: 'INVALID_INPUT', schema: 'envelope', errorClass: 'InvalidEnvelope', byteLength };
  }
  const { id, method, input } = envelope.data;
  const contract = Object.hasOwn(methods, method) ? methods[method] : undefined;
  if (!contract) return { ok: false, id, code: 'UNKNOWN_METHOD', schema: 'unknown-method', errorClass: 'UnknownMethod', byteLength };
  const inputBytes = utf8ByteLength(input);
  if (inputBytes > contract.maxInputBytes) return { ok: false, id, code: 'PAYLOAD_TOO_LARGE', schema: method, errorClass: 'PayloadTooLarge', byteLength: inputBytes };
  const parsed = contract.input.safeParse(input);
  if (!parsed.success) return { ok: false, id, code: 'INVALID_INPUT', schema: method, errorClass: 'SchemaMismatch', byteLength: inputBytes };
  return { ok: true, id, method, input: parsed.data, byteLength: inputBytes };
}
