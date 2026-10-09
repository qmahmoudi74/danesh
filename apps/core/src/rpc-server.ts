import { validateRequest } from '@danesh/contracts/envelope.ts';
import type { RpcErrorCode, RpcMethod } from '@danesh/contracts/rpc.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';

export type RpcHandler = (input: never, port: UtilityPort) => unknown;
export interface RpcServerOptions {
  methods: Record<string, RpcMethod>;
  handlers: Record<string, RpcHandler>;
  logger: Pick<JsonlLogger, 'log'>;
  sender: string;
  /** False until Core has its library open; valid requests then fail with UNAVAILABLE. */
  ready: () => boolean;
  /** Test builds only: simulates an unresponsive Core by dropping messages. */
  paused?: () => boolean;
}

export class RpcHandlerError extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode) { super(code); this.code = code; }
}

/** Validate-then-dispatch: the handler is reached only after exact lookup, byte limit and strict parse succeed. */
export function createRpcServer(options: RpcServerOptions) {
  const { methods, handlers, logger, sender, ready, paused } = options;
  const dispatch = async (port: UtilityPort, data: unknown): Promise<void> => {
    if (paused?.()) return;
    const request = validateRequest(data, methods);
    if (!request.ok) {
      logger.log('rpc.rejected', { schema: request.schema, sender, errorClass: request.errorClass, byteLength: request.byteLength, code: request.code }, 'warn');
      if (request.id !== undefined) port.postMessage({ id: request.id, ok: false, error: { code: request.code, schema: request.schema } });
      return;
    }
    const { id, method, input } = request;
    const reply = (code: RpcErrorCode) => port.postMessage({ id, ok: false, error: { code } });
    const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
    if (!handler) { logger.log('rpc.rejected', { schema: 'unknown-method', sender, errorClass: 'UnknownMethod', byteLength: request.byteLength, code: 'UNKNOWN_METHOD' }, 'warn'); return reply('UNKNOWN_METHOD'); }
    if (!ready()) return reply('UNAVAILABLE');
    try {
      const output = methods[method]!.output.safeParse(await handler(input as never, port));
      if (!output.success) { logger.log('rpc.invalid-output', { schema: method, sender: 'core' }, 'error'); return reply('UNAVAILABLE'); }
      port.postMessage({ id, ok: true, output: output.data });
    } catch (error) {
      if (error instanceof RpcHandlerError) return reply(error.code);
      logger.log('rpc.failed', { schema: method, errorClass: error instanceof Error ? error.name : 'Unknown' }, 'error');
      reply('INTERNAL');
    }
  };
  return {
    dispatch,
    attach(port: UtilityPort): void {
      port.on('message', ({ data }) => { void dispatch(port, data).catch(() => logger.log('rpc.dispatch-failed', { sender }, 'error')); });
      port.start();
    },
  };
}

/** Logs a preload-side rejection. Only contract names or fixed labels are recorded, never a caller-chosen string. */
export function createDiagRejectedHandler(methods: Record<string, RpcMethod>, logger: Pick<JsonlLogger, 'log'>): RpcHandler {
  return (input: { schema: string; errorClass: string; byteLength: number }) => {
    const schema = Object.hasOwn(methods, input.schema) || ['envelope', 'unknown-method'].includes(input.schema) ? input.schema : 'unknown-method';
    logger.log('rpc.rejected', { schema, sender: 'preload', errorClass: input.errorClass, byteLength: input.byteLength }, 'warn');
    return {};
  };
}
