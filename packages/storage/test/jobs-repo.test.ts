import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { type Db, openLibrary } from '../src/db.ts';
import { createJobsRepo } from '../src/jobs-repo.ts';

let root: string;
let db: Db;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'دانش jobs '));
  const library = openLibrary(root, { appVersion: 'jobs-test' });
  if (library.state !== 'ready') throw new Error('Test library not ready');
  db = library.db;
});
afterEach(async () => {
  db?.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const units = [2, 0, 1].map((unitOrder) => ({ unitKey: String(unitOrder), unitOrder }));
const sha = 'a'.repeat(64);
it('creates idempotent fan-out and claims in original order, counting only committed tasks', () => {
  const repo = createJobsRepo(db);
  const jobId = repo.createJob('sample.durable', 'bundled', units);
  repo.fanOut(jobId, 'sample.durable', units);
  expect(repo.progress(jobId)).toEqual({ committed: 0, total: 3 });
  for (let index = 0; index < 3; index++) {
    const task = repo.claimNext(jobId, 'boot')!;
    expect(task.unitOrder).toBe(index);
    expect(task.attempt).toBe(1);
    expect(repo.progress(jobId).committed).toBe(index);
    repo.commit(task.taskId, task.attempt, sha);
  }
  expect(repo.claimNext(jobId, 'boot')).toBeUndefined();
  expect(repo.snapshot(jobId)?.state).toBe('completed');
  expect(db.prepare('SELECT COUNT(*) AS n FROM exec_log').get()).toEqual({ n: 3 });
  expect(repo.latestJob('sample.durable')?.jobId).toBe(jobId);
});
it('rolls back both the execution log and done flip on a failed commit and rejects stale commits', () => {
  const repo = createJobsRepo(db);
  const job = repo.createJob('sample.durable', 'bundled', units);
  const task = repo.claimNext(job, 'old')!;
  db.exec(
    "CREATE TRIGGER stop_log BEFORE INSERT ON exec_log BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  expect(() => repo.commit(task.taskId, 1, sha)).toThrow();
  expect(repo.progress(job).committed).toBe(0);
  expect(db.prepare('SELECT COUNT(*) AS n FROM exec_log').get()).toEqual({ n: 0 });
  db.exec('DROP TRIGGER stop_log');
  repo.recover('new');
  expect(() => repo.commit(task.taskId, 1, sha)).toThrow();
  const resumed = repo.claimNext(job, 'new')!;
  expect(resumed.attempt).toBe(2);
  expect(() => repo.commit(task.taskId, 1, sha)).toThrow();
  repo.commit(resumed.taskId, 2, sha);
  expect(() => repo.commit(resumed.taskId, 2, sha)).toThrow();
  expect(() => repo.commit(999, 1, '../not-a-hash')).toThrow();
});
it('quarantines at the bound and targeted retry gives a fresh budget without changing done work', () => {
  const repo = createJobsRepo(db);
  const job = repo.createJob('sample.durable', 'bundled', units.slice(1));
  let task = repo.claimNext(job, 'boot')!;
  repo.commit(task.taskId, 1, sha);
  for (let attempt = 1; attempt <= 3; attempt++) {
    task = repo.claimNext(job, 'boot')!;
    expect(task.attempt).toBe(attempt);
    expect(repo.failAttempt(task.taskId, 'HostError')).toBe(attempt < 3 ? 'queued' : 'quarantined');
  }
  repo.claimNext(job, 'boot');
  expect(repo.snapshot(job)?.state).toBe('completed_with_issues');
  repo.retry(job);
  task = repo.claimNext(job, 'boot')!;
  expect(task.attempt).toBe(4);
  expect(task.maxAttempts).toBe(6);
  repo.commit(task.taskId, 4, sha);
  repo.claimNext(job, 'boot');
  expect(repo.snapshot(job)?.chunks.map((row) => row.attempt)).toEqual([1, 4]);
  expect(repo.snapshot(job)?.state).toBe('completed');
});
it('completes empty jobs and leaves current-boot work untouched on recovery', () => {
  const repo = createJobsRepo(db);
  const empty = repo.createJob('sample.durable', 'bundled', []);
  expect(repo.snapshot(empty)?.state).toBe('completed');
  expect(repo.recover('boot')).toBe(0);
  const job = repo.createJob('sample.durable', 'bundled', units);
  repo.claimNext(job, 'boot');
  expect(repo.recover('boot')).toBe(0);
  expect(repo.snapshot(job)?.chunks[0]?.state).toBe('running');
});
