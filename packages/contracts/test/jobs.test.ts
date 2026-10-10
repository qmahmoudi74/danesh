import { expect, it } from 'vitest';
import { SampleChunkResultSchema, SampleJobSnapshotSchema } from '../src/jobs.ts';
import { rpcMethods } from '../src/rpc.ts';
import { testRpcMethods } from '../src/test-rpc.ts';

it('new sample capabilities accept no user paths and bound retry and test inputs', () => {
  expect(rpcMethods['sampleJob.start']!.input.safeParse({ path: 'private.pdf' }).success).toBe(
    false,
  );
  expect(rpcMethods['sampleJob.get']!.input.safeParse({ jobId: 'arbitrary' }).success).toBe(false);
  expect(rpcMethods['sampleJob.retry']!.input.safeParse({ jobId: '../private' }).success).toBe(
    false,
  );
  expect(testRpcMethods['test.sampleChunks']!.input.safeParse({ n: 65 }).success).toBe(false);
  expect(testRpcMethods['test.sampleDelay']!.input.safeParse({ ms: 10001 }).success).toBe(false);
  expect(SampleChunkResultSchema.safeParse({ index: 1, sha256: 'bad', length: 1 }).success).toBe(
    false,
  );
});
it('a progress snapshot cannot count uncommitted tasks as complete', () => {
  expect(
    SampleJobSnapshotSchema.safeParse({
      jobId: '123e4567-e89b-42d3-a456-426614174000',
      state: 'running',
      total: 1,
      committed: 1,
      chunks: [{ index: 1, state: 'running', attempt: 1 }],
      resumedFromUnit: null,
      notRedoneCount: 0,
      createdAt: 0,
      finishedAt: null,
    }).success,
  ).toBe(false);
});
