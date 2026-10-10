import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { type Init, MainToCoreSchema } from '@danesh/contracts/control.ts';
import { EchoInputSchema } from '@danesh/contracts/host-protocol.ts';
import { rpcMethods } from '@danesh/contracts/rpc.ts';
import { type CheckRunFixtureSchema, testRpcMethods } from '@danesh/contracts/test-rpc.ts';
import { parentPort, type UtilityPort } from '@danesh/contracts/utility-port.ts';
import { createJsonlLogger, type JsonlLogger } from '@danesh/logging/jsonl.ts';
import type { Cas } from '@danesh/storage/cas.ts';
import { type LibraryOpen, recordSystemCheckProbe } from '@danesh/storage/db.ts';
import type { z } from 'zod';
import { bootCas, bootLibrary, libraryStatus, requireWritable } from './boot.ts';
import { createEngineClient } from './engine-client.ts';
import { createDiagRejectedHandler, createRpcServer, type RpcHandler } from './rpc-server.ts';
import { SystemCheck } from './system-check.ts';

const parent = parentPort();
const methods = { ...rpcMethods, ...(__TEST_HOOKS__ ? testRpcMethods : {}) };
// Core owns logs/core.jsonl for itself, the renderer, the preload and every host; it exists once init names the library.
let coreLog: JsonlLogger | undefined;
const logger = { log: (...args: Parameters<JsonlLogger['log']>) => coreLog?.log(...args) };
const engines = createEngineClient({
  requestSpawn: (kind) => parent.postMessage({ type: 'spawn-host', kind }),
  requestStop: (kind) => parent.postMessage({ type: 'stop-host', kind }),
  logger,
});
async function engineEcho(): Promise<{ hostPid: number; corePid: number }> {
  const input = { type: 'echo' as const, value: 'danesh-skeleton' };
  const { output, hostPid } = await engines.withHost('sample', input, 5000);
  if (EchoInputSchema.parse(output).value !== input.value) throw new Error('Echo mismatch');
  return { hostPid, corePid: process.pid };
}
let init: Init | undefined;
let library: LibraryOpen | undefined;
let cas: Cas | undefined;
const systemCheck = new SystemCheck(Date.now, { engines });
let checkFixture: z.infer<typeof CheckRunFixtureSchema> | undefined;
let stalledUntil = 0;

const handlers: Record<string, RpcHandler> = {
  'system.info': () => {
    const { appVersion, electronVersion, osName, osVersion, arch, locale, libraryRoot } = init!;
    return { appVersion, electronVersion, osName, osVersion, arch, locale, libraryRoot };
  },
  'app.status': () => libraryStatus(library),
  'system.ping': (input: { n: number }) => ({ ...input, corePid: process.pid }),
  'systemCheck.run': (_input: Record<string, never>, port: UtilityPort) => {
    const runId = randomUUID();
    const fixture = __TEST_HOOKS__ ? checkFixture : undefined;
    checkFixture = undefined;
    const facts = init!,
      opened = library;
    setImmediate(() => {
      void systemCheck
        .run(runId, port, facts, opened, fixture, cas)
        .catch(() => logger.log('system-check.failed', { sender: 'core' }, 'error'));
    });
    return { runId, checkIds: systemCheck.checkIds(facts, fixture) };
  },
  'systemCheck.get': (input: { runId: string }) => systemCheck.get(input.runId),
  'systemCheck.export': (input: { runId: string; token: string }) =>
    systemCheck.export(input.runId, input.token),
  'systemCheck.reportResponsiveness': (input: {
    runId: string;
    intervalMs: number;
    samplesMs: number[];
    diagnostics?: import('@danesh/contracts/responsiveness.ts').ResponsivenessDiagnostics;
  }) => {
    systemCheck.reportResponsiveness(
      input.runId,
      input.intervalMs,
      input.samplesMs,
      input.diagnostics,
    );
    return {};
  },
  'diag.rejected': createDiagRejectedHandler(methods, logger),
  ...(__TEST_HOOKS__
    ? {
        'test.writeProbe': () => {
          recordSystemCheckProbe(requireWritable(library));
          return { ok: true };
        },
        'test.engineEcho': () => engineEcho(),
        'test.checkRun': (input: z.infer<typeof CheckRunFixtureSchema>) => {
          checkFixture = input;
          return { ok: true };
        },
        'test.coreStall': (input: { ms: number }) => {
          stalledUntil = Date.now() + input.ms;
          return { ok: true };
        },
        'test.probeFault': (input: { kind: 'llm' | 'ocr' | 'tts' }) => {
          engines.armFault(input.kind);
          return { ok: true };
        },
      }
    : {}),
};
const rpcServer = createRpcServer({
  methods,
  handlers,
  logger,
  sender: 'renderer',
  ready: () => !!init && !!library,
  paused: () => __TEST_HOOKS__ && Date.now() < stalledUntil,
});

async function initialize(facts: Init): Promise<void> {
  try {
    cas = await bootCas(facts.libraryRoot);
    library = bootLibrary(facts.libraryRoot, facts.appVersion);
  } catch {
    library = { state: 'failed', details: { errorClass: 'CasStartupFailed' } };
    logger.log('cas.startup-failed', {}, 'error');
  }
  logger.log('library.opened', { kind: library.state });
  parent.postMessage({ type: 'ready', corePid: process.pid });
}

parent.on('message', (message) => {
  const control = MainToCoreSchema.safeParse(message.data);
  if (!control.success) {
    logger.log(
      'control.rejected',
      { schema: 'main-control', sender: 'main', errorClass: 'InvalidMessage' },
      'warn',
    );
    return;
  }
  if (control.data.type === 'init') {
    if (init) return;
    init = control.data;
    coreLog = createJsonlLogger({ dir: join(init.libraryRoot, 'logs'), name: 'core' });
    void initialize(init).catch(() => logger.log('core.startup-failed', {}, 'error'));
  } else if (control.data.type === 'host-exited') {
    engines.hostExited(control.data.kind, control.data.exitCode, control.data.requested);
  } else if (control.data.type === 'export-target') {
    systemCheck.addTarget(control.data.token, control.data.path, control.data.ttlMs);
    parent.postMessage({ type: 'export-target-ready', token: control.data.token });
  } else if (message.ports[0]) {
    if (control.data.type === 'renderer-port') rpcServer.attach(message.ports[0]);
    else if (control.data.type === 'host-port') engines.attach(control.data.kind, message.ports[0]);
  }
});
process.on('exit', () => {
  if (library && 'db' in library) library.db.close();
});
