import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { ResponsivenessInputSchema } from '../src/responsiveness.ts';
import { rpcMethods } from '../src/rpc.ts';

const input = {
  runId: randomUUID(),
  intervalMs: 50,
  samplesMs: [0, 60],
  diagnostics: {
    startedAtEpochMs: 1000,
    idleSamplesMs: [0, 2],
    sampleElapsedMs: [50, 160],
    longTasksSupported: true,
    longTasks: [{ startMs: 60, durationMs: 100 }],
    visibility: 'hidden',
  },
};
it('accepts aligned bounded diagnostics and keeps the older heartbeat input valid', () => {
  expect(ResponsivenessInputSchema.safeParse(input).success).toBe(true);
  const { diagnostics: _diagnostics, ...older } = input;
  expect(ResponsivenessInputSchema.safeParse(older).success).toBe(true);
});
it('rejects private fields, excessive arrays and unmatched or reordered timestamps', () => {
  for (const diagnostics of [
    { ...input.diagnostics, path: 'private' },
    { ...input.diagnostics, idleSamplesMs: Array(101).fill(0) },
    { ...input.diagnostics, longTasks: Array(101).fill({ startMs: 1, durationMs: 50 }) },
    { ...input.diagnostics, sampleElapsedMs: [50] },
    { ...input.diagnostics, sampleElapsedMs: [160, 50] },
  ])
    expect(ResponsivenessInputSchema.safeParse({ ...input, diagnostics }).success).toBe(false);
});
it('fits the largest valid diagnostic payload within its closed RPC byte limit', () => {
  const largest = {
    ...input,
    samplesMs: Array(4000).fill(60_000),
    diagnostics: {
      ...input.diagnostics,
      startedAtEpochMs: 8_640_000_000_000_000,
      idleSamplesMs: Array(100).fill(60_000),
      sampleElapsedMs: Array.from({ length: 4000 }, (_, index) => (index + 1) * 150),
      longTasks: Array(100).fill({ startMs: 600_000, durationMs: 600_000 }),
    },
  };
  expect(ResponsivenessInputSchema.safeParse(largest).success).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThan(
    rpcMethods['systemCheck.reportResponsiveness']!.maxInputBytes,
  );
});
