import { backoffMs } from './backoff.ts';

export type ExitDecision =
  | { action: 'none' }
  | { action: 'restart'; afterMs: number; attempt: number }
  | { action: 'circuit-open' };

export function createSupervisionPolicy({
  resetWindowMs = 60000,
  circuitThreshold = 5,
  circuitWindowMs = 120000,
}: {
  resetWindowMs?: number;
  circuitThreshold?: number;
  circuitWindowMs?: number;
} = {}) {
  for (const value of [resetWindowMs, circuitThreshold, circuitWindowMs]) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new RangeError('Supervision parameters must be positive integers');
  }
  let startedAt: number | undefined;
  let failures = 0;
  let crashTimes: number[] = [];
  let circuitOpen = false;
  function onHealthy(t: number): void {
    if (startedAt !== undefined && t - startedAt >= resetWindowMs) {
      failures = 0;
      startedAt = t;
    }
  }
  function onExit({ requested, t }: { requested: boolean; t: number }): ExitDecision {
    if (requested) return { action: 'none' };
    if (circuitOpen) return { action: 'circuit-open' };
    onHealthy(t);
    startedAt = undefined;
    crashTimes = crashTimes.filter((time) => t - time <= circuitWindowMs);
    crashTimes.push(t);
    failures++;
    if (crashTimes.length >= circuitThreshold) {
      circuitOpen = true;
      return { action: 'circuit-open' };
    }
    return { action: 'restart', afterMs: backoffMs(failures - 1), attempt: failures };
  }
  return {
    onStarted: (t: number) => {
      startedAt = t;
    },
    onHealthy,
    onExit,
    failureCount: () => failures,
    isCircuitOpen: () => circuitOpen,
  };
}
export type SupervisionPolicy = ReturnType<typeof createSupervisionPolicy>;
