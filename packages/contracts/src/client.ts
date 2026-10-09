import { RpcEventSchema, RpcResponseSchema, type RpcErrorCode, type RpcMethod } from './rpc.ts';
import { validateRequest, type Validation } from './envelope.ts';
import type { z } from './schema.ts';

export type Rejection = Extract<Validation, { ok: false }>;
export interface RpcClientOptions {
  methods: Record<string, RpcMethod>;
  events: Record<string, z.ZodType>;
  onEvent: (topic: string, payload: unknown) => void;
  /** Called for every request the client rejects locally, so the rejection can be logged without its payload. */
  onReject?: (rejection: Rejection) => void;
  maxPending?: number;
  now?: () => number;
}
type Pending = { method: string; resolve: (output: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Errors cross the context bridge as their message only, so the message is the RPC error code. */
export const rpcFailure = (code: RpcErrorCode): Error => Object.assign(new Error(code), { code });

/**
 * Pure request tracker for the private Core connection: validates before sending, gives each call one deadline that
 * covers waiting for the connection and for the reply, validates replies and events against the contract maps, and
 * settles every pending call with UNAVAILABLE when the connection closes.
 */
export function createRpcClient(options: RpcClientOptions) {
  const { methods, events, onEvent, onReject, maxPending = 100, now = () => performance.now() } = options;
  const pending = new Map<number, Pending>();
  let post: ((message: unknown) => void) | undefined;
  let closed = false;
  let nextId = 1;
  let connected: () => void = () => undefined;
  const connection = new Promise<void>((resolve) => { connected = resolve; });

  const send = async (method: string, input: unknown, timeoutMs: number): Promise<unknown> => {
    const deadline = now() + timeoutMs;
    await Promise.race([connection, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(rpcFailure('UNAVAILABLE')), timeoutMs); void connection.then(() => clearTimeout(timer)); })]);
    const remaining = deadline - now();
    if (closed || remaining <= 0 || !post || pending.size >= maxPending) throw rpcFailure('UNAVAILABLE');
    const id = nextId++;
    const deliver = post;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(rpcFailure('UNAVAILABLE')); }, remaining);
      pending.set(id, { method, resolve, reject, timer });
      deliver({ id, method, input });
    });
  };

  return {
    attach(postMessage: (message: unknown) => void): void { if (post || closed) return; post = postMessage; connected(); },
    async call(method: string, input: unknown, timeoutMs = 10_000): Promise<unknown> {
      const validation = validateRequest({ id: 1, method, input }, methods);
      if (!validation.ok) { onReject?.(validation); throw rpcFailure(validation.code); }
      return send(method, validation.input, timeoutMs);
    },
    /** Test builds only: sends a request without local validation to prove Core validates independently. */
    callUnchecked(method: string, input: unknown, timeoutMs = 10_000): Promise<unknown> { return send(method, input, timeoutMs); },
    /** Fire-and-forget report of a local rejection (the reply, if any, is ignored). */
    report(rejection: Rejection): void {
      if (!post || closed) return;
      post({ id: nextId++, method: 'diag.rejected', input: { schema: rejection.schema, errorClass: rejection.errorClass, byteLength: rejection.byteLength } });
    },
    receive(data: unknown): void {
      const response = RpcResponseSchema.safeParse(data);
      if (response.success) {
        const waiting = pending.get(response.data.id);
        if (!waiting) return;
        pending.delete(response.data.id); clearTimeout(waiting.timer);
        if (!response.data.ok) { waiting.reject(rpcFailure(response.data.error.code)); return; }
        const output = methods[waiting.method]?.output.safeParse(response.data.output);
        if (output?.success) waiting.resolve(output.data); else waiting.reject(rpcFailure('INTERNAL'));
        return;
      }
      const event = RpcEventSchema.safeParse(data);
      if (!event.success || !Object.hasOwn(events, event.data.topic)) return;
      const payload = events[event.data.topic]!.safeParse(event.data.payload);
      if (payload.success) onEvent(event.data.topic, payload.data);
    },
    close(): void {
      closed = true; post = undefined; connected();
      for (const [id, waiting] of pending) { clearTimeout(waiting.timer); pending.delete(id); waiting.reject(rpcFailure('UNAVAILABLE')); }
    },
    get pendingCount(): number { return pending.size; },
  };
}
export type RpcClient = ReturnType<typeof createRpcClient>;
