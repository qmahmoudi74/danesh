import { contextBridge, ipcRenderer } from 'electron';
import { rpcMethods, eventPayloads, RpcResponseSchema, RpcEventSchema, type DaneshApi, type RpcErrorCode } from '@danesh/contracts/rpc.ts';
import { testRpcMethods } from '@danesh/contracts/test-rpc.ts';
import { shellMethods, shellEventPayloads } from '@danesh/contracts/shell.ts';
const topics = { ...eventPayloads, ...shellEventPayloads };
const methods = { ...shellMethods, ...rpcMethods, ...(__TEST_HOOKS__ ? testRpcMethods : {}) };

let port: MessagePort | undefined;
let nextId = 1;
const pending = new Map<number, { method: string; resolve: (output: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const subscribers = new Map<string, Set<(payload: unknown) => void>>();
let latestCoreState: unknown;
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

ipcRenderer.on('danesh:shell-event', (_event, data: unknown) => {
  const event = RpcEventSchema.safeParse(data); if (!event.success) return;
  const payload = Object.hasOwn(shellEventPayloads, event.data.topic) ? shellEventPayloads[event.data.topic]?.safeParse(event.data.payload) : undefined;
  if (!payload?.success) return;
  if (event.data.topic === 'shell.coreState') latestCoreState = payload.data;
  for (const callback of subscribers.get(event.data.topic) ?? []) callback(payload.data);
});
const api: DaneshApi = {
  async call(method, input) {
    const contract = Object.hasOwn(methods, method) ? methods[method] : undefined;
    if (!contract) throw failure('UNKNOWN_METHOD');
    const parsed = contract.input.safeParse(input);
    if (!parsed.success) throw failure('INVALID_INPUT');
    if (new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > contract.maxInputBytes) throw failure('PAYLOAD_TOO_LARGE');
    if (Object.hasOwn(shellMethods, method)) {
      const response = RpcResponseSchema.safeParse(await ipcRenderer.invoke('danesh:shell', { id: 1, method, input: parsed.data }));
      if (!response.success) throw failure('INTERNAL');
      if (!response.data.ok) throw failure(response.data.error.code);
      const output = contract.output.safeParse(response.data.output); if (!output.success) throw failure('INTERNAL'); return output.data;
    }
    const deadline = performance.now() + 10000;
    await Promise.race([connection, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(failure('UNAVAILABLE')), 10000); void connection.then(() => clearTimeout(timer)); })]);
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw failure('UNAVAILABLE');
    if (!port || pending.size >= 100) throw failure('UNAVAILABLE');
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(failure('UNAVAILABLE')); }, remaining);
      pending.set(id, { method, resolve, reject, timer });
      port?.postMessage({ id, method, input: parsed.data });
    });
  },
  on(topic, callback) {
    if (!Object.hasOwn(topics, topic)) throw failure('UNKNOWN_METHOD');
    let callbacks = subscribers.get(topic);
    if (!callbacks) { callbacks = new Set(); subscribers.set(topic, callbacks); }
    callbacks.add(callback);
    if (topic === 'shell.coreState' && latestCoreState) { const value = latestCoreState; queueMicrotask(() => { if (callbacks.has(callback)) callback(value); }); }
    return () => { callbacks.delete(callback); if (!callbacks.size) subscribers.delete(topic); };
  },
};
contextBridge.exposeInMainWorld('danesh', api);
ipcRenderer.send('danesh:hello');
