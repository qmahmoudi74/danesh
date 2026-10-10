import type { Check } from './registry.ts';

/** ADR 0003 PK5: thresholds for heartbeat lateness while all probe engines run concurrently. */
export const RESPONSIVENESS_POLICY = { minSamples: 100, maxP95Ms: 50, maxMs: 250 } as const;

/** Nearest-rank percentile: the smallest sample with at least q of the samples at or below it. */
export function nearestRank(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN;
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

export function judgeResponsiveness(
  samplesMs: number[],
  intervalMs: number,
): { pass: boolean; fields: Record<string, string | number> } {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sampleCount = sorted.length;
  if (!sampleCount)
    return { pass: false, fields: { sampleCount: 0, intervalMs, method: 'nearest-rank' } };
  const p50 = nearestRank(sorted, 0.5),
    p95 = nearestRank(sorted, 0.95),
    max = sorted[sampleCount - 1]!;
  return {
    pass:
      sampleCount >= RESPONSIVENESS_POLICY.minSamples &&
      p95 <= RESPONSIVENESS_POLICY.maxP95Ms &&
      max <= RESPONSIVENESS_POLICY.maxMs,
    fields: {
      sampleCount,
      p50,
      p95,
      max,
      intervalMs,
      method: 'nearest-rank',
      policy: `samples>=${RESPONSIVENESS_POLICY.minSamples}, p95<=${RESPONSIVENESS_POLICY.maxP95Ms}ms, max<=${RESPONSIVENESS_POLICY.maxMs}ms`,
    },
  };
}

/** Judges the renderer's heartbeat while the engine group ran; no samples is a failure, never a pass. */
export const check: Check = {
  id: 'ui-responsive',
  async run({ responsiveness }) {
    const measured = await responsiveness(14_000);
    if (!measured)
      return {
        checkId: 'ui-responsive',
        status: 'fail',
        durationMs: 0,
        detail: 'no heartbeat samples received',
        fields: { sampleCount: 0, method: 'nearest-rank' },
      };
    const verdict = judgeResponsiveness(measured.samplesMs, measured.intervalMs);
    if (measured.diagnostics) {
      verdict.fields.diagnostics = JSON.stringify({
        ...measured.diagnostics,
        samplesMs: measured.samplesMs,
      });
    }
    return {
      checkId: 'ui-responsive',
      status: verdict.pass ? 'pass' : 'fail',
      durationMs: 0,
      detail: verdict.pass ? 'heartbeat within policy' : 'heartbeat outside policy',
      fields: verdict.fields,
    };
  },
};
