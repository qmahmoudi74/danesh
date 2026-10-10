import { join } from 'node:path';
import type { HostKind } from '@danesh/contracts/host-protocol.ts';
import { MessageChannelMain, utilityProcess } from 'electron';

// Main refers to engine hosts by bundle file name only; it never imports an engine module (dependency-cruiser rule).
const hostEntries: Record<HostKind, string> = {
  sample: 'engine-sample.js',
  llm: 'engine-llm.js',
  ocr: 'engine-ocr.js',
  tts: 'engine-tts.js',
  pdf: 'engine-pdf.js',
};
const children = new Map<HostKind, Electron.UtilityProcess>();
const stopping = new Set<Electron.UtilityProcess>();

/** Forks one utilityProcess per engine kind and brokers its private port to Core; every exit is reported to Core. */
export function spawnHost(kind: HostKind, core: Electron.UtilityProcess): void {
  if (children.has(kind)) return;
  const host = utilityProcess.fork(join(import.meta.dirname, hostEntries[kind]), [], {
    serviceName: `Danesh ${kind}`,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(kind, host);
  host.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  host.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  host.once('exit', (exitCode) => {
    if (children.get(kind) === host) children.delete(kind);
    const requested = stopping.delete(host);
    core.postMessage({ type: 'host-exited', kind, exitCode, requested });
  });
  const { port1, port2 } = new MessageChannelMain();
  host.postMessage({ type: 'host-port', kind }, [port1]);
  core.postMessage({ type: 'host-port', kind }, [port2]);
}

/** A requested stop: Core is told the exit was expected, so it is not treated as a crash. */
export function stopHost(kind: HostKind): void {
  const host = children.get(kind);
  if (!host) return;
  children.delete(kind);
  stopping.add(host);
  host.kill();
}

export function killHosts(): void {
  for (const host of children.values()) {
    stopping.add(host);
    host.kill();
  }
  children.clear();
}
