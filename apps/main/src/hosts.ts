import { type HostKind, HostKindSchema } from '@danesh/contracts/host-protocol.ts';
import { MessageChannelMain } from 'electron';
import type { createUtilitySupervisor } from './supervisor.ts';

// Main refers to engine hosts by bundle file name only; it never imports an engine module (dependency-cruiser rule).
export const hostEntries: Record<HostKind, string> = {
  sample: 'engine-sample.js',
  llm: 'engine-llm.js',
  ocr: 'engine-ocr.js',
  tts: 'engine-tts.js',
  pdf: 'engine-pdf.js',
};
export function brokerHost(
  kind: string,
  host: Electron.UtilityProcess,
  core: Electron.UtilityProcess,
) {
  const { port1, port2 } = new MessageChannelMain();
  host.postMessage({ type: 'host-port', kind }, [port1]);
  core.postMessage({ type: 'host-port', kind }, [port2]);
}

export function createHosts(
  supervisor: ReturnType<typeof createUtilitySupervisor>,
  getCore: () => Electron.UtilityProcess | undefined,
) {
  supervisor.subscribe((event) => {
    const core = getCore();
    if (!core || event.kind === 'core') return;
    const kind = HostKindSchema.parse(event.kind);
    if (event.type === 'exited')
      core.postMessage({
        type: 'host-exited',
        kind,
        exitCode: event.code,
        requested: event.requested,
        restartAttempt: event.restartAttempt,
      });
    else if (event.type === 'circuit-open') core.postMessage({ type: 'circuit-open', kind });
  });
  return {
    spawnHost(this: void, kind: HostKind): void {
      const core = getCore();
      if (!core) return;
      void supervisor.spawn(kind).catch((error: unknown) => {
        if (getCore() !== core) return;
        const circuit = error instanceof Error && error.message === 'CircuitOpen';
        core.postMessage({
          type: 'host-start-failed',
          kind,
          errorClass: circuit ? 'CircuitOpen' : 'HostSpawnFailed',
        });
      });
    },
    stopHost: supervisor.requestStop,
    killUnexpected: supervisor.killUnexpected,
    stop(): void {
      for (const kind of Object.keys(hostEntries)) supervisor.requestStop(kind);
    },
  };
}
