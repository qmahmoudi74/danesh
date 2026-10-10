import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SampleChunkResultSchema } from '@danesh/contracts/jobs.ts';
import { type Cas, createCas } from '@danesh/storage/cas.ts';
import { type Db, openLibrary } from '@danesh/storage/db.ts';
import { createJobsRepo, type JobsRepo } from '@danesh/storage/jobs-repo.ts';
import { afterEach, beforeEach, expect, it } from 'vitest';
import sample from '../assets/sample-durable-job.txt?raw';
import type { EngineClient } from '../src/engine-client.ts';
import { createSampleJob, type SampleJob } from '../src/sample-job.ts';

let root: string;
let db: Db;
let repo: JobsRepo;
let cas: Cas;
let runner: SampleJob;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'دانش sample '));
  const library = openLibrary(root, { appVersion: 'test' });
  if (library.state !== 'ready') throw new Error('Library not ready');
  db = library.db;
  repo = createJobsRepo(db);
  cas = createCas({ blobsDir: join(root, 'blobs'), tmpDir: join(root, 'tmp') });
});
afterEach(async () => {
  runner?.dispose();
  db.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function service(withHost: EngineClient['withHost']) {
  runner = createSampleJob({
    repo,
    cas,
    engines: { withHost },
    bootId: 'test-boot',
    notify: () => undefined,
    logger: { log: () => undefined },
  });
  return runner;
}
it('processes only the exact bundled sample, validates host replies and commits real CAS outputs', async () => {
  const received: string[] = [];
  service((_kind, input) => {
    if (input.type !== 'sampleChunk') throw new Error('Unexpected operation');
    received.push(input.text);
    return Promise.resolve({
      hostPid: 1,
      entry: undefined,
      output: {
        index: input.index,
        sha256: createHash('sha256').update(input.text).digest('hex'),
        length: input.text.length,
      },
    });
  });
  const { jobId } = runner.start();
  expect(runner.start().jobId).toBe(jobId);
  await expect.poll(() => runner.get()?.state).toBe('completed');
  expect(received.join('')).toBe(sample.normalize('NFC'));
  const tasks = repo.tasks(jobId);
  expect(tasks).toHaveLength(12);
  for (const task of tasks) {
    const bytes = await cas.get(task.outputRef!);
    const value = SampleChunkResultSchema.parse(JSON.parse(bytes.toString()) as unknown);
    expect(value.index).toBe(task.unitOrder + 1);
    expect(task.attempt).toBe(1);
  }
  const next = runner.start().jobId;
  expect(next).not.toBe(jobId);
  await expect.poll(() => runner.get()?.state).toBe('completed');
  expect(repo.snapshot(jobId)?.committed).toBe(12);
});
it('rejects well-shaped but incorrect host results before CAS publication and retries only that unit', async () => {
  let invalid = true;
  service((_kind, input) => {
    if (input.type !== 'sampleChunk') throw new Error('Unexpected operation');
    return Promise.resolve({
      hostPid: 1,
      entry: undefined,
      output: {
        index: input.index,
        sha256:
          invalid && input.index === 4
            ? '0'.repeat(64)
            : createHash('sha256').update(input.text).digest('hex'),
        length: input.text.length,
      },
    });
  });
  const { jobId } = runner.start();
  await expect.poll(() => runner.get()?.state).toBe('completed_with_issues');
  expect(repo.progress(jobId)).toEqual({ total: 12, committed: 11 });
  expect(repo.tasks(jobId)[3]?.outputRef).toBeNull();
  invalid = false;
  runner.retry(jobId);
  await expect.poll(() => runner.get()?.state).toBe('completed');
  expect(repo.tasks(jobId).map((task) => task.attempt)).toEqual([
    1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1,
  ]);
});
