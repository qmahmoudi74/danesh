import type { UtilityMessage, UtilityPort } from '@danesh/contracts/utility-port.ts';
import { describe, expect, it } from 'vitest';
import type { CheckContext } from '../src/checks/registry.ts';
import {
  judgeResponsiveness,
  nearestRank,
  check as responsivenessCheck,
} from '../src/checks/ui-responsive.check.ts';
import { CircuitOpenError, createEngineClient, HostExitedError } from '../src/engine-client.ts';

function fakeHost(
  behaviour: (
    message: { type: string; taskId?: string; input?: { type: string } },
    reply: (data: unknown) => void,
  ) => void,
) {
  let listener: ((message: UtilityMessage) => void) | undefined;
  const port: UtilityPort = {
    on: (_event, handler) => {
      listener = handler;
    },
    start: () => undefined,
    postMessage: (message) =>
      behaviour(message as never, (data) => queueMicrotask(() => listener?.({ data, ports: [] }))),
  };
  return port;
}

describe('engine client', () => {
  it('a delayed requested exit cannot reject the next host task of the same kind', async () => {
    let starts = 0;
    const client = createEngineClient({
      requestSpawn: (kind) => {
        starts++;
        if (starts === 2) client.hostExited(kind, 0, true);
        queueMicrotask(() => client.attach(kind, port));
      },
      requestStop: () => undefined,
      logger: { log: () => undefined },
    });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello') reply({ type: 'hello-ack', hostPid: starts, kind: 'sample' });
      else reply({ type: 'result', taskId: message.taskId, ok: true, output: {} });
    });
    await client.withHost('sample', { type: 'echo', value: 'first' });
    await expect(
      client.withHost('sample', { type: 'echo', value: 'second' }),
    ).resolves.toMatchObject({ hostPid: 2 });
  });
  it('spawns on demand, runs one task, and stops the host again', async () => {
    const calls: string[] = [];
    const client = createEngineClient({
      requestSpawn: (kind) => {
        calls.push(`spawn:${kind}`);
        queueMicrotask(() => client.attach(kind, port));
      },
      requestStop: (kind) => calls.push(`stop:${kind}`),
      logger: { log: () => undefined },
    });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello')
        reply({ type: 'hello-ack', hostPid: 4242, kind: 'llm', entry: 'engine-llm.js' });
      else reply({ type: 'result', taskId: message.taskId, ok: true, output: { tokenCount: 24 } });
    });
    expect(await client.withHost('llm', { type: 'llm-probe', modelPath: 'm.gguf' })).toEqual({
      output: { tokenCount: 24 },
      hostPid: 4242,
      entry: 'engine-llm.js',
    });
    expect(calls).toEqual(['spawn:llm', 'stop:llm']);
  });
  it.each([0, 1])(
    'fails the pending task on exit %i without cancelling its pending restart',
    async (code) => {
      const stops: string[] = [];
      const client = createEngineClient({
        requestSpawn: (kind) => queueMicrotask(() => client.attach(kind, port)),
        requestStop: (kind) => {
          stops.push(kind);
        },
        logger: { log: () => undefined },
      });
      const port = fakeHost((message, reply) => {
        if (message.type === 'hello') reply({ type: 'hello-ack', hostPid: 7, kind: 'ocr' });
        else queueMicrotask(() => client.hostExited('ocr', code, false));
      });
      const failure = await client
        .withHost('ocr', {
          type: 'ocr-probe',
          langDir: 'd',
          imagePath: 'i.png',
          expectedFirstWord: 'This',
        })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(HostExitedError);
      expect((failure as HostExitedError).exitCode).toBe(code);
      expect(stops).toEqual([]);
    },
  );
  it('refuses a circuit-open host promptly while other host kinds keep working', async () => {
    const starts: string[] = [];
    const client = createEngineClient({
      requestSpawn: (kind) => {
        starts.push(kind);
        queueMicrotask(() => {
          if (kind === 'sample') client.hostStartFailed(kind, 'CircuitOpen');
          else client.attach(kind, port);
        });
      },
      requestStop: () => undefined,
      logger: { log: () => undefined },
    });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello') reply({ type: 'hello-ack', hostPid: 8, kind: 'ocr' });
      else reply({ type: 'result', taskId: message.taskId, ok: true, output: {} });
    });
    await expect(client.withHost('sample', { type: 'echo', value: '' })).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    await expect(client.withHost('sample', { type: 'echo', value: '' })).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    await expect(client.withHost('ocr', { type: 'echo', value: '' })).resolves.toMatchObject({
      hostPid: 8,
    });
    expect(starts).toEqual(['sample', 'ocr']);
  });
  it('rejects host messages that do not match the protocol and a hello from the wrong kind', async () => {
    const records: string[] = [];
    const client = createEngineClient({
      requestSpawn: (kind) => queueMicrotask(() => client.attach(kind, port)),
      requestStop: () => undefined,
      logger: { log: (event, fields) => records.push(`${event}:${String(fields?.errorClass)}`) },
      spawnTimeoutMs: 50,
    });
    const port = fakeHost((message, reply) => {
      if (message.type === 'hello') {
        reply({ type: 'hello-ack', hostPid: 9, kind: 'tts' });
        reply({ type: 'surprise', path: 'C:/secret' });
      }
    });
    const failure = await client
      .withHost('llm', { type: 'llm-probe', modelPath: 'm' })
      .catch((error: unknown) => error as Error);
    expect((failure as Error).name).toBe('HostStartTimeout');
    expect(records).toEqual(['host.rejected:KindMismatch', 'host.rejected:InvalidMessage']);
  });
});

const filled = (count: number, value: number): number[] =>
  Array.from({ length: count }, () => value);
describe('responsiveness judgment (ADR 0003 PK5)', () => {
  it('exports idle diagnostics while judging only the original loaded samples', async () => {
    const samplesMs = filled(120, 67);
    const diagnostics = {
      startedAtEpochMs: 1000,
      idleSamplesMs: filled(40, 0),
      sampleElapsedMs: samplesMs.map((_, index) => (index + 1) * 117),
      longTasksSupported: false,
      longTasks: [],
      visibility: 'hidden' as const,
    };
    // The responsiveness check consumes only this dependency; other Core services are unused.
    const context = {
      responsiveness: () => Promise.resolve({ intervalMs: 50, samplesMs, diagnostics }),
    } as unknown as CheckContext;
    const result = await responsivenessCheck.run(context);
    expect(result?.status).toBe('fail');
    expect(result?.fields.p95).toBe(67);
    expect(JSON.parse(String(result?.fields.diagnostics))).toEqual({ ...diagnostics, samplesMs });
  });
  it('uses nearest-rank percentiles', () => {
    const sorted = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(nearestRank(sorted, 0.95)).toBe(95);
    expect(nearestRank(sorted, 0.5)).toBe(50);
    expect(nearestRank([7], 0.95)).toBe(7);
  });
  it('passes only with enough samples inside both limits; zero samples fail', () => {
    expect(judgeResponsiveness(filled(120, 3), 50).pass).toBe(true);
    expect(judgeResponsiveness(filled(99, 3), 50).pass).toBe(false);
    expect(judgeResponsiveness([...filled(110, 3), ...filled(10, 60)], 50).pass).toBe(false);
    expect(judgeResponsiveness([...filled(150, 3), 251], 50).pass).toBe(false);
    expect(judgeResponsiveness([], 50)).toEqual({
      pass: false,
      fields: { sampleCount: 0, intervalMs: 50, method: 'nearest-rank' },
    });
  });
});
