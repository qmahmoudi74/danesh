import { describe, expect, it } from 'vitest';
import type { UtilityPort, UtilityMessage } from '@danesh/contracts/utility-port.ts';
import { createEngineClient, HostExitedError } from '../src/engine-client.ts';
import { judgeResponsiveness, nearestRank } from '../src/checks/ui-responsive.check.ts';

function fakeHost(behaviour: (message: { type: string; taskId?: string; input?: { type: string } }, reply: (data: unknown) => void) => void) {
  let listener: ((message: UtilityMessage) => void) | undefined;
  const port: UtilityPort = { on: (_event, handler) => { listener = handler; }, start: () => undefined, postMessage: (message) => behaviour(message as never, (data) => queueMicrotask(() => listener?.({ data, ports: [] }))) };
  return port;
}

describe('engine client', () => {
  it('spawns on demand, runs one task, and stops the host again', async () => {
    const calls: string[] = [];
    const client = createEngineClient({ requestSpawn: (kind) => { calls.push(`spawn:${kind}`); queueMicrotask(() => client.attach(kind, port)); }, requestStop: (kind) => calls.push(`stop:${kind}`), logger: { log: () => undefined } });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello') reply({ type: 'hello-ack', hostPid: 4242, kind: 'llm', entry: 'engine-llm.js' });
      else reply({ type: 'result', taskId: message.taskId, ok: true, output: { tokenCount: 24 } });
    });
    expect(await client.withHost('llm', { type: 'llm-probe', modelPath: 'm.gguf' })).toEqual({ output: { tokenCount: 24 }, hostPid: 4242, entry: 'engine-llm.js' });
    expect(calls).toEqual(['spawn:llm', 'stop:llm']);
  });
  it('fails only the pending task of a host that exits, with its exit code', async () => {
    const client = createEngineClient({ requestSpawn: (kind) => queueMicrotask(() => client.attach(kind, port)), requestStop: () => undefined, logger: { log: () => undefined } });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello') reply({ type: 'hello-ack', hostPid: 7, kind: 'ocr' });
      else queueMicrotask(() => client.hostExited('ocr', 1, false));
    });
    const failure = await client.withHost('ocr', { type: 'ocr-probe', langDir: 'd', imagePath: 'i.png', expectedFirstWord: 'This' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HostExitedError);
    expect((failure as HostExitedError).exitCode).toBe(1);
  });
  it('rejects host messages that do not match the protocol and a hello from the wrong kind', async () => {
    const records: string[] = [];
    const client = createEngineClient({ requestSpawn: (kind) => queueMicrotask(() => client.attach(kind, port)), requestStop: () => undefined, logger: { log: (event, fields) => records.push(`${event}:${String(fields?.errorClass)}`) }, spawnTimeoutMs: 50 });
    const port = fakeHost((message, reply) => { if (message.type === 'hello') { reply({ type: 'hello-ack', hostPid: 9, kind: 'tts' }); reply({ type: 'surprise', path: 'C:/secret' }); } });
    const failure = await client.withHost('llm', { type: 'llm-probe', modelPath: 'm' }).catch((error: unknown) => error as Error);
    expect((failure as Error).name).toBe('HostStartTimeout');
    expect(records).toEqual(['host.rejected:KindMismatch', 'host.rejected:InvalidMessage']);
  });
});

const filled = (count: number, value: number): number[] => Array.from({ length: count }, () => value);
describe('responsiveness judgment (ADR 0003 PK5)', () => {
  it('uses nearest-rank percentiles', () => {
    const sorted = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(nearestRank(sorted, 0.95)).toBe(95); expect(nearestRank(sorted, 0.5)).toBe(50); expect(nearestRank([7], 0.95)).toBe(7);
  });
  it('passes only with enough samples inside both limits; zero samples fail', () => {
    expect(judgeResponsiveness(filled(120, 3), 50).pass).toBe(true);
    expect(judgeResponsiveness(filled(99, 3), 50).pass).toBe(false);
    expect(judgeResponsiveness([...filled(110, 3), ...filled(10, 60)], 50).pass).toBe(false);
    expect(judgeResponsiveness([...filled(150, 3), 251], 50).pass).toBe(false);
    expect(judgeResponsiveness([], 50)).toEqual({ pass: false, fields: { sampleCount: 0, intervalMs: 50, method: 'nearest-rank' } });
  });
});
