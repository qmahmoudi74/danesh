import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { backoffMs } from '../src/supervision/backoff.ts';
import { createSupervisionPolicy } from '../src/supervision/policy.ts';
import {
  type ChildHandle,
  createSupervisor,
  type SupervisorEvent,
} from '../src/supervision/supervisor.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

it('returns deterministic integer backoff through the cap and rejects invalid parameters', () => {
  const delays = [250, 500, 1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000];
  for (const [count, delay] of delays.entries()) {
    expect(backoffMs(count)).toBe(delay);
    expect(Number.isInteger(backoffMs(count))).toBe(true);
  }
  expect(backoffMs(Number.MAX_SAFE_INTEGER)).toBe(15000);
  expect(backoffMs(2, { baseMs: 10, capMs: 30 })).toBe(30);
  for (const count of [-1, 0.5, NaN, Infinity]) expect(() => backoffMs(count)).toThrow();
  for (const baseMs of [-1, 0, 1.5, Infinity]) expect(() => backoffMs(0, { baseMs })).toThrow();
});
it('counts only unrequested exits, resets after healthy uptime, and opens the bounded circuit', () => {
  const policy = createSupervisionPolicy();
  policy.onStarted(0);
  expect(policy.onExit({ requested: true, t: 1 })).toEqual({ action: 'none' });
  expect(policy.onExit({ requested: false, t: 2 })).toEqual({
    action: 'restart',
    afterMs: 250,
    attempt: 1,
  });
  policy.onStarted(252);
  expect(policy.onExit({ requested: false, t: 253 })).toEqual({
    action: 'restart',
    afterMs: 500,
    attempt: 2,
  });
  policy.onStarted(753);
  policy.onHealthy(60752);
  expect(policy.failureCount()).toBe(2);
  policy.onHealthy(60753);
  expect(policy.failureCount()).toBe(0);
  expect(policy.onExit({ requested: false, t: 60754 })).toEqual({
    action: 'restart',
    afterMs: 250,
    attempt: 1,
  });
  expect(policy.onExit({ requested: false, t: 61000 }).action).toBe('restart');
  expect(policy.onExit({ requested: false, t: 62000 }).action).toBe('circuit-open');
  expect(policy.isCircuitOpen()).toBe(true);
});
it('expires crash-window records and rejects invalid policy windows', () => {
  const policy = createSupervisionPolicy();
  for (let count = 0; count < 8; count++) {
    expect(policy.onExit({ requested: false, t: count * 120001 }).action).toBe('restart');
  }
  expect(() => createSupervisionPolicy({ circuitThreshold: 0 })).toThrow();
  expect(() => createSupervisionPolicy({ resetWindowMs: -1 })).toThrow();
  expect(() => createSupervisionPolicy({ circuitWindowMs: 0.5 })).toThrow();
});

function setup() {
  let nextPid = 100;
  const children: (ChildHandle & { exit: (code: number) => void; kind: string })[] = [];
  const events: SupervisorEvent[] = [];
  const supervisor = createSupervisor({
    spawner: {
      spawn(kind) {
        let onExit: (code: number) => void = () => {};
        const child = {
          kind,
          pid: nextPid++,
          onExit(listener: (code: number) => void) {
            onExit = listener;
          },
          kill: vi.fn(),
          postMessage: vi.fn(),
          exit(code: number) {
            onExit(code);
          },
        };
        children.push(child);
        return child;
      },
    },
    clock: {
      now: Date.now,
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    },
  });
  supervisor.subscribe((event) => events.push(event));
  return { supervisor, children, events };
}
it.each([0, 1, 134, 137])(
  'classifies unrequested exit %i as a crash and coalesces spawn during backoff',
  async (code) => {
    const { supervisor, children, events } = setup();
    const first = await supervisor.spawn('sample');
    children[0]!.exit(code);
    const waiting = supervisor.spawn('sample');
    expect(supervisor.spawn('sample')).toBe(waiting);
    await vi.advanceTimersByTimeAsync(249);
    expect(children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await waiting).pid).not.toBe(first.pid);
    expect(events).toEqual([
      { type: 'exited', kind: 'sample', code, requested: false },
      { type: 'restarted', kind: 'sample', attempt: 1 },
    ]);
  },
);
it('isolates policies by child kind and never lets a delayed requested exit replace the new child', async () => {
  const { supervisor, children, events } = setup();
  await supervisor.spawn('sample');
  const other = await supervisor.spawn('ocr');
  supervisor.requestStop('sample');
  expect(children[0]!.kill).toHaveBeenCalledOnce();
  const replacement = await supervisor.spawn('sample');
  children[0]!.exit(0);
  expect(await supervisor.spawn('sample')).toBe(replacement);
  expect(await supervisor.spawn('ocr')).toBe(other);
  expect(events).toEqual([{ type: 'exited', kind: 'sample', code: 0, requested: true }]);
  children[2]!.exit(0);
  await vi.advanceTimersByTimeAsync(250);
  expect(children).toHaveLength(4);
  expect(await supervisor.spawn('ocr')).toBe(other);
});
it('cancels a pending restart on stop and refuses spawning into an open circuit', async () => {
  const { supervisor, children, events } = setup();
  await supervisor.spawn('sample');
  children[0]!.exit(0);
  const waiting = supervisor.spawn('sample');
  const rejected = expect(waiting).rejects.toThrow('Stopped');
  supervisor.requestStop('sample');
  await rejected;
  await vi.advanceTimersByTimeAsync(20000);
  expect(children).toHaveLength(1);
  await supervisor.spawn('sample');
  for (let count = 0; count < 5; count++) {
    children.at(-1)!.exit(0);
    if (count < 3) await vi.advanceTimersByTimeAsync(backoffMs(count + 1));
    if (count === 3) break;
  }
  await expect(supervisor.spawn('sample')).rejects.toThrow('CircuitOpen');
  const count = children.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(children).toHaveLength(count);
  expect(events.at(-1)).toEqual({ type: 'circuit-open', kind: 'sample' });
});
