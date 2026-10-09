import { randomUUID } from 'node:crypto';
import { MainToCoreSchema, type Init } from '@danesh/contracts/control.ts';
import { rpcMethods } from '@danesh/contracts/rpc.ts';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import { createJsonlLogger, type JsonlLogger } from '@danesh/logging/jsonl.ts';
import { join } from 'node:path';
import { createDiagRejectedHandler, createRpcServer, type RpcHandler } from './rpc-server.ts';
import { SystemCheck } from './system-check.ts';
import { parentPort, type UtilityPort } from '@danesh/contracts/utility-port.ts';
import { openLibraryDb, type Db } from '@danesh/storage/db.ts';
import { testRpcMethods, CheckRunFixtureSchema } from '@danesh/contracts/test-rpc.ts';
import type { z } from 'zod';
import { HostToCoreSchema, EchoInputSchema } from '@danesh/contracts/host-protocol.ts';

const parent = parentPort();
const methods = { ...rpcMethods, ...(__TEST_HOOKS__ ? testRpcMethods : {}) };
// Core owns logs/core.jsonl for itself, the renderer, the preload and every host; it exists once init names the library.
let coreLog: JsonlLogger | undefined;
const logger = { log: (...args: Parameters<JsonlLogger['log']>) => coreLog?.log(...args) };
interface HostClient { port: UtilityPort; pid: number }
const hosts = new Map<'sample', HostClient>();
let hostReady: Promise<HostClient> | undefined;
let resolveHost: ((host: HostClient) => void) | undefined;
const hostTasks = new Map<string, { resolve: (output: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function attachHost(port: UtilityPort): void {
  port.on('message', ({ data }) => {
    const message = HostToCoreSchema.safeParse(data);
    if (!message.success) {
      let byteLength = 0;
      try { byteLength = utf8ByteLength(data); } catch { /* still rejected */ }
      logger.log('host.rejected', { schema: 'host-message', sender: 'host:sample', errorClass: 'InvalidMessage', byteLength }, 'warn');
      return;
    }
    if (message.data.type === 'log') { logger.log(message.data.event, { ...message.data.fields, sender: 'host:sample' }); return; }
    if (message.data.type === 'rejected') { logger.log('rpc.rejected', { schema: message.data.schema, sender: 'host:sample', errorClass: message.data.errorClass, byteLength: message.data.byteLength }, 'warn'); return; }
    if (message.data.type === 'hello-ack') {
      const host = { port, pid: message.data.hostPid }; hosts.set(message.data.kind, host); resolveHost?.(host);
    } else if (message.data.type === 'result') {
      const task = hostTasks.get(message.data.taskId);
      if (!task) return;
      clearTimeout(task.timer); hostTasks.delete(message.data.taskId);
      if (message.data.ok) task.resolve(message.data.output); else task.reject(new Error(message.data.errorClass));
    }
  });
  port.start(); port.postMessage({ type: 'hello' });
}
async function engineEcho(): Promise<{ hostPid: number; corePid: number }> {
  let host = hosts.get('sample');
  if (!host) {
    if (!hostReady) {
      hostReady = new Promise<HostClient>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Host unavailable')), 5000);
        resolveHost = (client) => { clearTimeout(timer); resolve(client); };
      });
      parent.postMessage({ type: 'spawn-host', kind: 'sample' });
    }
    host = await hostReady;
  }
  const taskId = randomUUID();
  const input = { type: 'echo' as const, value: 'danesh-skeleton' };
  const output = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { hostTasks.delete(taskId); reject(new Error('Host timeout')); }, 5000);
    hostTasks.set(taskId, { resolve, reject, timer });
    host.port.postMessage({ type: 'run', taskId, input });
  });
  if (EchoInputSchema.parse(output).value !== input.value) throw new Error('Echo mismatch');
  return { hostPid: host.pid, corePid: process.pid };
}
let init: Init | undefined;
let db: Db | undefined;
const systemCheck = new SystemCheck();
let checkFixture: z.infer<typeof CheckRunFixtureSchema> | undefined;
let stalledUntil = 0;

const handlers: Record<string, RpcHandler> = {
  'system.info': () => { const { appVersion, electronVersion, osName, osVersion, arch, locale, libraryRoot } = init!; return { appVersion, electronVersion, osName, osVersion, arch, locale, libraryRoot }; },
  'system.ping': (input: { n: number }) => ({ ...input, corePid: process.pid }),
  'systemCheck.run': (_input: Record<string, never>, port: UtilityPort) => {
    const runId = randomUUID(); const fixture = __TEST_HOOKS__ ? checkFixture : undefined; checkFixture = undefined;
    const facts = init!, database = db!;
    setImmediate(() => { void systemCheck.run(runId, port, facts, database, fixture).catch(() => logger.log('system-check.failed', { sender: 'core' }, 'error')); });
    return { runId, checkIds: systemCheck.checkIds(fixture) };
  },
  'systemCheck.get': (input: { runId: string }) => systemCheck.get(input.runId),
  'systemCheck.export': (input: { runId: string; token: string }) => systemCheck.export(input.runId, input.token),
  'diag.rejected': createDiagRejectedHandler(methods, logger),
  ...(__TEST_HOOKS__ ? {
    'test.engineEcho': () => engineEcho(),
    'test.checkRun': (input: z.infer<typeof CheckRunFixtureSchema>) => { checkFixture = input; return { ok: true }; },
    'test.coreStall': (input: { ms: number }) => { stalledUntil = Date.now() + input.ms; return { ok: true }; },
  } : {}),
};
const rpcServer = createRpcServer({ methods, handlers, logger, sender: 'renderer', ready: () => !!init && !!db, paused: () => __TEST_HOOKS__ && Date.now() < stalledUntil });

parent.on('message', (message) => {
  const control = MainToCoreSchema.safeParse(message.data);
  if (!control.success) { logger.log('control.rejected', { schema: 'main-control', sender: 'main', errorClass: 'InvalidMessage' }, 'warn'); return; }
  if (control.data.type === 'init') {
    if (init) return;
    init = control.data;
    coreLog = createJsonlLogger({ dir: join(init.libraryRoot, 'logs'), name: 'core' });
    db = openLibraryDb(init.libraryRoot, init.appVersion);
    parent.postMessage({ type: 'ready', corePid: process.pid });
  } else if (control.data.type === 'export-target') {
    systemCheck.addTarget(control.data.token, control.data.path); parent.postMessage({ type: 'export-target-ready', token: control.data.token });
  } else if (message.ports[0]) {
    if (control.data.type === 'renderer-port') rpcServer.attach(message.ports[0]);
    else attachHost(message.ports[0]);
  }
});
process.on('exit', () => db?.close());
