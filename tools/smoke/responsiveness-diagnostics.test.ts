import { expect, it } from 'vitest';
import type { SmokeReport } from '../../packages/contracts/src/smoke-report.ts';
import { summarizeResponsiveness } from './responsiveness-diagnostics.ts';

const report: SmokeReport = {
  schemaVersion: 1,
  appVersion: 'test',
  electronVersion: 'test',
  platform: 'test',
  arch: 'test',
  startedAt: '2026-10-10T00:00:00.000Z',
  finishedAt: '2026-10-10T00:00:01.000Z',
  overall: 'fail',
  checks: [
    {
      checkId: 'engine-llm',
      status: 'pass',
      detail: '',
      durationMs: 100,
      fields: { checkStartedAtMs: 1000, checkFinishedAtMs: 1100 },
    },
    {
      checkId: 'engine-ocr',
      status: 'pass',
      detail: '',
      durationMs: 150,
      fields: { checkStartedAtMs: 1000, checkFinishedAtMs: 1150 },
    },
    {
      checkId: 'ui-responsive',
      status: 'fail',
      detail: '',
      durationMs: 0,
      fields: {
        intervalMs: 50,
        diagnostics: JSON.stringify({
          startedAtEpochMs: 1000,
          idleSamplesMs: [0, 2],
          samplesMs: [0, 20, 40, 0],
          sampleElapsedMs: [50, 120, 210, 260],
          longTasksSupported: true,
          longTasks: [{ startMs: 50, durationMs: 70 }],
          visibility: 'hidden',
        }),
      },
    },
  ],
};
it('correlates whole timer intervals with engine overlap, including transitions', () => {
  const before = JSON.stringify(report);
  expect(summarizeResponsiveness(report)).toMatchObject({
    available: true,
    idle: { count: 2, p95: 2 },
    loaded: { count: 4, p95: 40 },
    phases: {
      'engine-llm+engine-ocr': { count: 2, p95: 20 },
      'engine-ocr': { count: 1, p95: 40 },
      'after-engines': { count: 1, p95: 0 },
    },
    longTaskCount: 1,
    longestTaskMs: 70,
  });
  expect(JSON.stringify(report)).toBe(before);
});
it('reports missing or invalid diagnostics without turning a failed report into a pass', () => {
  for (const diagnostics of [undefined, '{invalid', JSON.stringify({ samplesMs: [0] })]) {
    const invalid: SmokeReport = {
      ...report,
      checks: [{ ...report.checks[2]!, fields: diagnostics ? { diagnostics } : {} }],
    };
    expect(summarizeResponsiveness(invalid).available).toBe(false);
    expect(invalid.overall).toBe('fail');
  }
});
