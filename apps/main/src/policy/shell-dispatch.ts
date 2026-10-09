import { shellMethods } from '@danesh/contracts/shell.ts';
import { RpcRequestSchema, type RpcErrorCode } from '@danesh/contracts/rpc.ts';

export type ShellResponse = { id: 1; ok: true; output: unknown } | { id: 1; ok: false; error: { code: RpcErrorCode } };
export type ShellHandler = (input: never) => unknown;
export type ShellHandlers = Record<string, ShellHandler>;
export class ShellFailure extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode) { super(code); this.code = code; }
}

/** Pure request pipeline: trust check, envelope, method, byte limit and strict schema all run before any handler. */
export async function dispatchShellRequest(trusted: boolean, value: unknown, handlers: ShellHandlers): Promise<ShellResponse> {
  const fail = (code: RpcErrorCode): ShellResponse => ({ id: 1, ok: false, error: { code } });
  if (!trusted) return fail('INVALID_INPUT');
  const request = RpcRequestSchema.safeParse(value);
  if (!request.success) return fail('INVALID_INPUT');
  const { method } = request.data;
  const contract = Object.hasOwn(shellMethods, method) ? shellMethods[method] : undefined;
  const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
  if (!contract || !handler) return fail('UNKNOWN_METHOD');
  if (new TextEncoder().encode(JSON.stringify(request.data.input) ?? '').byteLength > contract.maxInputBytes) return fail('PAYLOAD_TOO_LARGE');
  const input = contract.input.safeParse(request.data.input);
  if (!input.success) return fail('INVALID_INPUT');
  try {
    const output = contract.output.safeParse(await handler(input.data as never));
    return output.success ? { id: 1, ok: true, output: output.data } : fail('INTERNAL');
  } catch (error) { return fail(error instanceof ShellFailure ? error.code : 'UNAVAILABLE'); }
}
