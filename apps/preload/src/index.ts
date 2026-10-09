import { contextBridge, ipcRenderer } from 'electron';
import { rpcMethods, eventPayloads, RpcResponseSchema, RpcEventSchema, type DaneshApi, type RpcErrorCode } from '@danesh/contracts/rpc.ts';
import { testRpcMethods } from '@danesh/contracts/test-rpc.ts';
const methods = { ...rpcMethods, ...(__TEST_HOOKS__ ? testRpcMethods : {}) };

let port: MessagePort | undefined;
let nextId = 1;
const pending = new Map<number, { method: string; resolve: (output: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const subscribers = new Map<string, Set<(payload: unknown) => void>>();
let connected: (() => void) | undefined;
const connection = new Promise<void>((resolve) => { connected = resolve; });
function failure(code: RpcErrorCode): Error & { code: RpcErrorCode } { return Object.assign(new Error(code), { code }); }
ipcRenderer.on('danesh:port', (event) => {
  if (port) return;
  port = event.ports[0];
  if (!port) return;
  port.onmessage = ({ data }: MessageEvent<unknown>) => {
    const response = RpcResponseSchema.safeParse(data);
    if (response.success) {
      const waiting = pending.get(response.data.id);
      if (!waiting) return;
      pending.delete(response.data.id); clearTimeout(waiting.timer);
      if (!response.data.ok) waiting.reject(failure(response.data.error.code));
      else {
        const result = methods[waiting.method]?.output.safeParse(response.data.output);
        if (result?.success) waiting.resolve(result.data); else waiting.reject(failure('INTERNAL'));
      }
      return;
    }
    const notification = RpcEventSchema.safeParse(data);
    if (!notification.success) return;
    const payload = eventPayloads[notification.data.topic]?.safeParse(notification.data.payload);
    if (!payload?.success) return;
    for (const callback of subscribers.get(notification.data.topic) ?? []) callback(payload.data);
  };
  port.start(); connected?.();
});

const api: DaneshApi = {
  async call(method, input) {
    const contract = Object.hasOwn(methods, method) ? methods[method] : undefined;
    if (!contract) throw failure('UNKNOWN_METHOD');
    const parsed = contract.input.safeParse(input);
    if (!parsed.success) throw failure('INVALID_INPUT');
    if (new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > contract.maxInputBytes) throw failure('PAYLOAD_TOO_LARGE');
    await Promise.race([connection, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(failure('UNAVAILABLE')), 15000); void connection.then(() => clearTimeout(timer)); })]);
    if (!port || pending.size >= 100) throw failure('UNAVAILABLE');
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(failure('UNAVAILABLE')); }, 15000);
      pending.set(id, { method, resolve, reject, timer });
      port?.postMessage({ id, method, input: parsed.data });
    });
  },
  on(topic, callback) {
    if (!Object.hasOwn(eventPayloads, topic)) throw failure('UNKNOWN_METHOD');
    let callbacks = subscribers.get(topic);
    if (!callbacks) { callbacks = new Set(); subscribers.set(topic, callbacks); }
    callbacks.add(callback);
    return () => { callbacks.delete(callback); if (!callbacks.size) subscribers.delete(topic); };
  },
};
contextBridge.exposeInMainWorld('danesh', api);
ipcRenderer.send('danesh:hello');
