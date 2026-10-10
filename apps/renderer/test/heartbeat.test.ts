import { afterEach, expect, it, vi } from 'vitest';
import {
  installResponsivenessProbe,
  measureSmokeIdle,
  startHeartbeat,
} from '../src/lib/heartbeat.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('cancels an in-flight heartbeat and its deferred report when the renderer unsubscribes', () => {
  vi.useFakeTimers();
  let listener: (payload: unknown) => void = () => {};
  const unsubscribe = vi.fn();
  const call = vi.fn();
  vi.stubGlobal('window', {
    danesh: {
      on: (_topic: string, callback: typeof listener) => {
        listener = callback;
        return unsubscribe;
      },
      call,
    },
  });
  const dispose = installResponsivenessProbe();
  const runId = '11111111-1111-4111-8111-111111111111';
  listener({ runId, checkId: 'engine-llm', status: 'pending' });
  listener({ runId, checkId: 'engine-llm', status: 'running' });
  listener({ runId, checkId: 'engine-llm', status: 'pass' });
  expect(vi.getTimerCount()).toBe(2);
  dispose();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(6000);
  expect(call).not.toHaveBeenCalled();
});

it('keeps consecutive-interval lateness unchanged and reports the actual timestamp', () => {
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, 'now');
  clock
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(50)
    .mockReturnValueOnce(177)
    .mockReturnValueOnce(320);
  const ticks: number[][] = [];
  const stop = startHeartbeat(50, (lateness, timestamp) => ticks.push([lateness, timestamp]));
  vi.advanceTimersByTime(150);
  expect(stop()).toEqual([0, 77, 93]);
  expect(ticks).toEqual([
    [0, 50],
    [77, 177],
    [93, 320],
  ]);
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds observed samples and releases both idle timers on cancellation', async () => {
  vi.useFakeTimers();
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    clock += 50;
    return clock;
  });
  const record = vi.fn();
  const stop = startHeartbeat(50, record);
  vi.advanceTimersByTime(201_000);
  expect(stop()).toHaveLength(4000);
  expect(record).toHaveBeenCalledTimes(4000);
  const controller = new AbortController();
  const idle = measureSmokeIdle(controller.signal);
  controller.abort();
  await idle;
  expect(vi.getTimerCount()).toBe(0);
});
