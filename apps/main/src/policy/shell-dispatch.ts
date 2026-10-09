import { shellMethods } from '@danesh/contracts/shell.ts';
import type { RpcErrorCode } from '@danesh/contracts/rpc.ts';
import { validateRequest, type Validation } from '@danesh/contracts/envelope.ts';

export type ShellResponse = { id: 1; ok: true; output: unknown } | { id: 1; ok: false; error: { code: RpcErrorCode } };
export type ShellHandler = (input: never) => unknown;
export type ShellHandlers = Record<string, ShellHandler>;
export class ShellFailure extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode) { super(code); this.code = code; }
}

export type ShellRejection = Extract<Validation, { ok: false }> | { schema: 'untrusted-sender'; errorClass: 'UntrustedSender'; byteLength: number; code: RpcErrorCode };
/** Pure request pipeline: trust check, envelope, method, byte limit and strict schema all run before any handler. */
export async function dispatchShellRequest(trusted: boolean, value: unknown, handlers: ShellHandlers, onReject?: (rejection: ShellRejection) => void): Promise<ShellResponse> {
  const fail = (code: RpcErrorCode): ShellResponse => ({ id: 1, ok: false, error: { code } });
  if (!trusted) { onReject?.({ schema: 'untrusted-sender', errorClass: 'UntrustedSender', byteLength: 0, code: 'INVALID_INPUT' }); return fail('INVALID_INPUT'); }
  const request = validateRequest(value, shellMethods);
  if (!request.ok) { onReject?.(request); return fail(request.code); }
  const { method } = request;
  const contract = shellMethods[method]!;
  const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
  if (!handler) { onReject?.({ ok: false, id: request.id, code: 'UNKNOWN_METHOD', schema: 'unknown-method', errorClass: 'UnknownMethod', byteLength: request.byteLength }); return fail('UNKNOWN_METHOD'); }
  try {
    const output = contract.output.safeParse(await handler(request.input as never));
    return output.success ? { id: 1, ok: true, output: output.data } : fail('INTERNAL');
  } catch (error) { return fail(error instanceof ShellFailure ? error.code : 'UNAVAILABLE'); }
}
