import { ResponsivenessInputSchema } from '../../packages/contracts/src/responsiveness.ts';
import type { SmokeReport } from '../../packages/contracts/src/smoke-report.ts';

function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (q: number) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
  return {
    count: samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
    buckets: [0, 10, 25, 50, 100, 250]
      .map((limit, index, limits) => ({
        upperMs: limit,
        count: samples.filter(
          (sample) => sample <= limit && (index === 0 || sample > limits[index - 1]!),
        ).length,
      }))
      .concat([
        {
          upperMs: Number.MAX_SAFE_INTEGER,
          count: samples.filter((sample) => sample > 250).length,
        },
      ]),
  };
}

/** Derived diagnostics only: never changes samples, report status or the acceptance policy. */
export function summarizeResponsiveness(report: SmokeReport) {
  const heartbeat = report.checks.find((check) => check.checkId === 'ui-responsive');
  const raw = heartbeat?.fields.diagnostics;
  if (typeof raw !== 'string')
    return { available: false as const, reason: 'no renderer diagnostics' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { available: false as const, reason: 'invalid diagnostic JSON' };
  }
  if (typeof value !== 'object' || value === null || !('samplesMs' in value))
    return { available: false as const, reason: 'missing samples' };
  const { samplesMs, ...diagnostics } = value;
  const parsed = ResponsivenessInputSchema.safeParse({
    runId: '00000000-0000-4000-8000-000000000000',
    intervalMs: heartbeat?.fields.intervalMs,
    samplesMs,
    diagnostics,
  });
  if (!parsed.success || !parsed.data.diagnostics)
    return { available: false as const, reason: 'invalid diagnostic contract' };
  const measured = parsed.data.diagnostics;
  const engines = report.checks
    .filter((check) => check.checkId.startsWith('engine-'))
    .map((check) => ({
      checkId: check.checkId,
      start: Number(check.fields.checkStartedAtMs),
      finish: Number(check.fields.checkFinishedAtMs),
    }))
    .filter((check) => Number.isFinite(check.start) && Number.isFinite(check.finish));
  // Assign each whole timer interval to an overlap set, not just the engines active at its endpoint.
  const phases = new Map<string, number[]>();
  parsed.data.samplesMs.forEach((sample, index) => {
    const end = measured.startedAtEpochMs + measured.sampleElapsedMs[index]!;
    const start = measured.startedAtEpochMs + (measured.sampleElapsedMs[index - 1] ?? 0);
    const phase =
      engines
        .filter((engine) => engine.start < end && engine.finish > start)
        .map((engine) => engine.checkId)
        .join('+') || 'after-engines';
    const samples = phases.get(phase) ?? [];
    samples.push(sample);
    phases.set(phase, samples);
  });
  return {
    available: true as const,
    idle: distribution(measured.idleSamplesMs),
    loaded: distribution(parsed.data.samplesMs),
    phases: Object.fromEntries(
      [...phases].map(([phase, samples]) => [phase, distribution(samples)]),
    ),
    longTasksSupported: measured.longTasksSupported,
    longTaskCount: measured.longTasks.length,
    longestTaskMs: Math.max(0, ...measured.longTasks.map((task) => task.durationMs)),
    visibility: measured.visibility,
  };
}
