import { fileURLToPath } from 'node:url';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import {
  CoreToHostSchema,
  type HostKind,
  HostPortSchema,
  type RunInput,
} from '@danesh/contracts/host-protocol.ts';
import { parentPort, type UtilityPort } from '@danesh/contracts/utility-port.ts';
import { type FaultMode, faults } from './faults.ts';

export type HostHandlers = Partial<Record<RunInput['type'], (input: never) => unknown>>;

/** Native libraries this process has actually loaded (from Node's diagnostic report), filtered by name. */
export function loadedLibraries(pattern: RegExp): string[] {
  const report = process.report.getReport() as { sharedObjects?: string[] };
  return (report.sharedObjects ?? []).filter((path) => pattern.test(path));
}

/**
 * Shared engine-host runtime: accepts exactly one port from Main for its own kind, answers Core's hello with its pid
 * and entry file, sends a heartbeat every second, validates every command strictly and reports rejections as
 * metadata only. Each handler runs in this utilityProcess, never in Main or the renderer.
 */
export function startHost({
  kind,
  entryUrl,
  handlers,
}: {
  kind: HostKind;
  entryUrl: string;
  handlers: HostHandlers;
}): void {
  const entry = fileURLToPath(entryUrl);
  let nextFault: FaultMode | undefined;
  const handle = async (port: UtilityPort, request: unknown): Promise<void> => {
    const parsed = CoreToHostSchema.safeParse(request);
    if (!parsed.success) {
      const taskId =
        typeof request === 'object' &&
        request !== null &&
        'taskId' in request &&
        typeof request.taskId === 'string' &&
        request.taskId.length
          ? request.taskId.slice(0, 128)
          : 'invalid';
      let byteLength = 0;
      try {
        byteLength = utf8ByteLength(request);
      } catch {
        /* still rejected */
      }
      port.postMessage({
        type: 'rejected',
        schema: 'host-command',
        errorClass: 'InvalidMessage',
        byteLength,
      });
      port.postMessage({ type: 'result', taskId, ok: false, errorClass: 'InvalidMessage' });
      return;
    }
    if (parsed.data.type === 'hello') {
      port.postMessage({ type: 'hello-ack', hostPid: process.pid, kind, entry });
      return;
    }
    const { taskId, input } = parsed.data;
    if (__TEST_HOOKS__ && input.type === 'fault') {
      port.postMessage({ type: 'result', taskId, ok: true, output: { armed: true } });
      if (input.when === 'now') setImmediate(() => faults?.execute(input.mode));
      else nextFault = input.mode;
      return;
    }
    if (__TEST_HOOKS__ && nextFault) {
      const mode = nextFault;
      nextFault = undefined;
      if (mode === 'malformed') {
        port.postMessage({
          type: 'result',
          taskId,
          ok: true,
          output: {},
          payload: 'DANESH_PRIVATE_FAULT_PAYLOAD',
        });
        return;
      }
      faults?.execute(mode);
    }
    const handler = handlers[input.type];
    if (!handler) {
      port.postMessage({
        type: 'rejected',
        schema: 'host-command',
        errorClass: 'UnsupportedOperation',
        byteLength: utf8ByteLength(input),
      });
      port.postMessage({ type: 'result', taskId, ok: false, errorClass: 'UnsupportedOperation' });
      return;
    }
    try {
      if (__TEST_HOOKS__ && input.type.endsWith('-probe')) {
        const ms = Number(process.env.DANESH_TEST_PROBE_DELAY_MS ?? 0);
        if (Number.isInteger(ms) && ms > 0 && ms <= 10000)
          await new Promise<void>((resolve) => setTimeout(resolve, ms));
      }
      const cpuStarted = process.cpuUsage();
      const output = await handler(input as never);
      const cpu = process.cpuUsage(cpuStarted);
      // Diagnostic metadata only for the fixed packaging probes; echo/product outputs stay intact.
      const measured =
        input.type.endsWith('-probe') && typeof output === 'object' && output !== null
          ? {
              ...output,
              hostCpuUserMs: cpu.user / 1000,
              hostCpuSystemMs: cpu.system / 1000,
              hostRssAtFinishBytes: process.memoryUsage.rss(),
            }
          : output;
      port.postMessage({ type: 'result', taskId, ok: true, output: measured });
    } catch (error) {
      port.postMessage({
        type: 'result',
        taskId,
        ok: false,
        errorClass: error instanceof Error ? error.name : 'Error',
      });
    }
  };
  parentPort().on('message', ({ data, ports }) => {
    const control = HostPortSchema.safeParse(data);
    if (!control.success || control.data.kind !== kind || !ports[0]) {
      console.error('Invalid host control message');
      return;
    }
    const port = ports[0];
    port.on('message', ({ data: request }) => {
      void handle(port, request);
    });
    port.start();
    setInterval(() => port.postMessage({ type: 'heartbeat' }), 1000).unref();
  });
}
