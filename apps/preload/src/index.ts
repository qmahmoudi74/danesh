import { contextBridge, ipcRenderer } from 'electron';
import { rpcMethods, eventPayloads, RpcResponseSchema, RpcEventSchema, type DaneshApi } from '@danesh/contracts/rpc.ts';
import { testRpcMethods } from '@danesh/contracts/test-rpc.ts';
import { shellMethods, shellEventPayloads } from '@danesh/contracts/shell.ts';
import { validateRequest } from '@danesh/contracts/envelope.ts';
import { createRpcClient, rpcFailure } from '@danesh/contracts/client.ts';
const topics = { ...eventPayloads, ...shellEventPayloads };
const coreMethods = { ...rpcMethods, ...(__TEST_HOOKS__ ? testRpcMethods : {}) };

const subscribers = new Map<string, Set<(payload: unknown) => void>>();
// Shell events that may arrive before the page subscribes are replayed to the first subscribers.
const replayable = new Set(['shell.coreState', 'shell.smokeRun']);
const latest = new Map<string, unknown>();
const notify = (topic: string, payload: unknown) => { for (const callback of subscribers.get(topic) ?? []) callback(payload); };
const client = createRpcClient({ methods: coreMethods, events: eventPayloads, onEvent: notify, onReject: (rejection) => client.report(rejection) });

let attached = false;
ipcRenderer.on('danesh:port', (event) => {
  const port = event.ports[0];
  if (!port || attached) return;
  attached = true;
  port.onmessage = ({ data }: MessageEvent<unknown>) => client.receive(data);
  port.addEventListener('close', () => client.close());
  client.attach((message) => port.postMessage(message));
  port.start();
});

ipcRenderer.on('danesh:shell-event', (_event, data: unknown) => {
  const event = RpcEventSchema.safeParse(data); if (!event.success) return;
  const payload = Object.hasOwn(shellEventPayloads, event.data.topic) ? shellEventPayloads[event.data.topic]?.safeParse(event.data.payload) : undefined;
  if (!payload?.success) return;
  if (replayable.has(event.data.topic)) latest.set(event.data.topic, payload.data);
  notify(event.data.topic, payload.data);
});

async function callShell(method: string, input: unknown): Promise<unknown> {
  const request = validateRequest({ id: 1, method, input }, shellMethods);
  if (!request.ok) { client.report(request); throw rpcFailure(request.code); }
  const response = RpcResponseSchema.safeParse(await ipcRenderer.invoke('danesh:shell', { id: 1, method, input: request.input }));
  if (!response.success) throw rpcFailure('INTERNAL');
  if (!response.data.ok) throw rpcFailure(response.data.error.code);
  const output = shellMethods[method]!.output.safeParse(response.data.output);
  if (!output.success) throw rpcFailure('INTERNAL');
  return output.data;
}

const api: DaneshApi = {
  async call(method, input) {
    if (typeof method === 'string' && Object.hasOwn(shellMethods, method)) return callShell(method, input);
    if (__TEST_HOOKS__ && method === 'test.raw') {
      const raw = testRpcMethods['test.raw']!.input.parse(input) as { method: string; input: unknown };
      return client.callUnchecked(raw.method, raw.input);
    }
    return client.call(method, input);
  },
  on(topic, callback) {
    if (!Object.hasOwn(topics, topic)) throw rpcFailure('UNKNOWN_METHOD');
    let callbacks = subscribers.get(topic);
    if (!callbacks) { callbacks = new Set(); subscribers.set(topic, callbacks); }
    callbacks.add(callback);
    if (latest.has(topic)) { const value = latest.get(topic); queueMicrotask(() => { if (callbacks.has(callback)) callback(value); }); }
    return () => { callbacks.delete(callback); if (!callbacks.size) subscribers.delete(topic); };
  },
};
contextBridge.exposeInMainWorld('danesh', api);
ipcRenderer.send('danesh:hello');
