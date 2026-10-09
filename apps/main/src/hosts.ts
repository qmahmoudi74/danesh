import { MessageChannelMain, utilityProcess } from 'electron';
import { join } from 'node:path';
const hostEntries = { sample: 'engine-sample.js' } as const;
const children = new Map<keyof typeof hostEntries, Electron.UtilityProcess>();
export function spawnHost(kind: keyof typeof hostEntries, core: Electron.UtilityProcess): void {
  if (children.has(kind)) return;
  const host = utilityProcess.fork(join(import.meta.dirname, hostEntries[kind]), [], { serviceName: `Danesh ${kind}`, stdio: ['ignore', 'pipe', 'pipe'] });
  children.set(kind, host);
  host.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  host.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  host.once('exit', () => children.delete(kind));
  const { port1, port2 } = new MessageChannelMain();
  host.postMessage({ type: 'host-port', kind }, [port1]);
  core.postMessage({ type: 'host-port', kind }, [port2]);
}
export function killHosts(): void { for (const host of children.values()) host.kill(); children.clear(); }
