import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { afterAll, expect } from 'vitest';
import { createCas } from '../src/cas.ts';
import { type Db, openLibrary } from '../src/db.ts';
import { createJobsRepo, type JobsRepo } from '../src/jobs-repo.ts';
import { readJobAudit } from './job-audit.ts';

const feature = await loadFeature(resolve('features/core/durable-jobs.feature'));
const units = Array.from({ length: 12 }, (_, unitOrder) => ({
  unitOrder,
  unitKey: String(unitOrder),
}));
let root: string;
let db: Db | undefined;
let repo: JobsRepo;
let jobId: string;
let before: { outputRef: string; bytes: Buffer }[];
const snapshots: { total: number; committed: number }[] = [];
const roots: string[] = [];
async function setup(count = 12) {
  db?.close();
  db = undefined;
  root = await mkdtemp(join(tmpdir(), 'دانش کار پایدار '));
  roots.push(root);
  connect();
  jobId = repo.createJob('sample.durable', 'bundled-fixture', units.slice(0, count));
  snapshots.length = 0;
}
function connect() {
  const library = openLibrary(root, { appVersion: 'feature-test' });
  if (library.state !== 'ready') throw new Error('Library not ready');
  db = library.db;
  repo = createJobsRepo(db);
}
function runFixture(crashPoint?: string) {
  db?.close();
  db = undefined;
  const result = spawnSync(
    process.execPath,
    [
      resolve('packages/storage/test/fixtures/job-crash-runner.ts'),
      root,
      ...(crashPoint ? [crashPoint] : []),
    ],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true },
  );
  if (result.error) throw result.error;
  if (crashPoint) expect(result.status).not.toBe(0);
  else expect(result.status, result.stderr).toBe(0);
  for (const line of result.stdout.trim().split('\n')) {
    const value = JSON.parse(line) as { progress?: { total: number; committed: number } };
    if (value.progress) snapshots.push(value.progress);
  }
  connect();
}
function cas() {
  return createCas({ blobsDir: join(root, 'blobs'), tmpDir: join(root, 'tmp') });
}
async function outputs() {
  const output = [];
  for (const task of repo.tasks(jobId).filter((task) => task.state === 'done')) {
    expect(task.outputRef).not.toBeNull();
    output.push({ outputRef: task.outputRef!, bytes: await cas().get(task.outputRef!) });
  }
  return output;
}
function assertLog() {
  expect(readJobAudit(root, jobId).executions).toHaveLength(12);
  const rows = db!.prepare('SELECT task_id,COUNT(*) AS n FROM exec_log GROUP BY task_id').all() as {
    task_id: number;
    n: number;
  }[];
  expect(rows).toHaveLength(12);
  expect(rows.every((row) => row.n === 1)).toBe(true);
  expect(repo.snapshot(jobId)?.state).toBe('completed');
}
afterAll(async () => {
  db?.close();
  db = undefined;
  for (const path of roots)
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('A job commits each task and its output exactly once', ({ Given, When, Then, And }) => {
    Given('a job with 12 queued tasks in unit order', () => setup());
    When('the job runs to completion', () => runFixture());
    Then('each task runs once and the job ends completed', () => {
      assertLog();
      expect(repo.tasks(jobId).every((task) => task.attempt === 1)).toBe(true);
    });
    And(
      "each task's output reference, successful exec_log row and done flip share one transaction",
      () => {
        const mismatches = db!
          .prepare(
            "SELECT COUNT(*) AS n FROM task t LEFT JOIN exec_log e ON e.task_id=t.task_id WHERE t.state='done' AND (e.task_id IS NULL OR e.output_ref!=t.output_ref OR e.attempt!=t.attempt)",
          )
          .get();
        expect(mismatches).toEqual({ n: 0 });
      },
    );
    And('every committed output reference resolves to verified bytes', async () => {
      expect(await outputs()).toHaveLength(12);
    });
  });
  Scenario('Repeated fan-out cannot duplicate a task', ({ Given, When, Then }) => {
    Given('an existing task identified by job_id, kind and unit_key', () => setup(1));
    When('fan-out inserts that same identity again', () =>
      repo.fanOut(jobId, 'sample.durable', units.slice(0, 1)),
    );
    Then('the insert is a no-op and exactly one task retains that identity', () => {
      expect(repo.tasks(jobId)).toHaveLength(1);
    });
  });
  Scenario(
    'An empty job and an empty recovery pass require no task work',
    ({ Given, When, Then, And }) => {
      Given('a job with zero tasks and no orphaned tasks in the library', () => setup(0));
      When('the job is scheduled and boot recovery runs', () => {
        expect(repo.recover('new')).toBe(0);
      });
      Then('the job completes immediately', () => {
        expect(repo.snapshot(jobId)?.state).toBe('completed');
      });
      And('boot recovery changes no task rows', () => {
        expect(repo.tasks(jobId)).toEqual([]);
      });
    },
  );
  Scenario('Attempt limits quarantine persistent failures', ({ Given, When, Then, And }) => {
    let limitTask: number;
    let retryTask: number;
    Given('failed tasks at and below the configured maximum attempt count', async () => {
      await setup(2);
      limitTask = repo.claimNext(jobId, 'boot')!.taskId;
      repo.failAttempt(limitTask, 'HostError');
      repo.claimNext(jobId, 'boot');
      repo.failAttempt(limitTask, 'HostError');
      repo.claimNext(jobId, 'boot');
      retryTask = repo.claimNext(jobId, 'boot')!.taskId;
    });
    When('retry decisions are made', () => {
      repo.failAttempt(limitTask, 'HostError');
      repo.failAttempt(retryTask, 'HostError');
    });
    Then('the task at the limit is quarantined', () => {
      expect(repo.tasks(jobId)[0]?.state).toBe('quarantined');
    });
    And('the task below the limit is queued for retry', () => {
      expect(repo.tasks(jobId)[1]?.state).toBe('queued');
    });
    When('all remaining tasks have settled', async () => {
      const task = repo.claimNext(jobId, 'boot')!;
      const output = await cas().put(Buffer.from('settled'));
      repo.commit(task.taskId, task.attempt, output.sha256);
    });
    Then('the job containing the quarantined task ends completed_with_issues', () => {
      expect(repo.snapshot(jobId)?.state).toBe('completed_with_issues');
    });
  });
  ScenarioOutline(
    'SIGKILL at a transactional crash point leaves a resumable job',
    ({ Given, When, Then, And }, { crash_point }) => {
      Given(
        'an interrupted job with committed tasks and a running task under the current boot_id',
        () => setup(),
      );
      When('Core is killed with SIGKILL at <crash_point>', async () => {
        if (typeof crash_point !== 'string') throw new Error('Expected crash point');
        runFixture(`${crash_point}:3`);
        before = await outputs();
        expect(before.length).toBe(crash_point === 'after-commit' ? 4 : 3);
      });
      And('Core restarts with a new boot_id and the same library', () => {
        repo.recover('restarted');
      });
      Then(
        'tasks running under the previous boot_id are re-queued within their attempt limit',
        () => {
          expect(repo.tasks(jobId).some((task) => task.state === 'running')).toBe(false);
          expect(
            repo
              .tasks(jobId)
              .filter((task) => task.state === 'queued')
              .every((task) => task.attempt < task.maxAttempts),
          ).toBe(true);
        },
      );
      And('committed output references and their verified bytes are preserved', async () => {
        expect(await outputs()).toEqual(before);
      });
      When('the job finishes', () => runFixture());
      Then('exec_log contains exactly one successful row for every done task', async () => {
        assertLog();
        expect((await outputs()).slice(0, before.length)).toEqual(before);
        expect(await readdir(join(root, 'tmp'))).toEqual([]);
      });
    },
  );
  Scenario('Two consecutive restarts never redo committed tasks', ({ Given, When, Then, And }) => {
    Given('a partially committed job whose tasks have an original unit order', async () => {
      await setup();
      runFixture('after-blob:3');
      before = await outputs();
    });
    When('Core is restarted twice while the job resumes', () => {
      runFixture('after-claim:7');
      runFixture();
    });
    And('the job runs to completion', () => {
      expect(repo.snapshot(jobId)?.state).toBe('completed');
    });
    Then('no committed task is executed again', async () => {
      expect((await outputs()).slice(0, before.length)).toEqual(before);
      expect(
        repo
          .tasks(jobId)
          .slice(0, 3)
          .every((task) => task.attempt === 1),
      ).toBe(true);
    });
    And('resumed tasks run in their original unit order', () => {
      const order = db!
        .prepare(
          'SELECT t.unit_order AS n FROM exec_log e JOIN task t ON e.task_id=t.task_id ORDER BY e.rowid',
        )
        .all() as { n: number }[];
      expect(order.map((row) => row.n)).toEqual(Array.from({ length: 12 }, (_, n) => n));
    });
    And('every progress snapshot is the integer count of committed tasks out of the total', () => {
      expect(
        snapshots.every((value) => value.total === 12 && Number.isInteger(value.committed)),
      ).toBe(true);
      expect(snapshots.map((value) => value.committed)).toEqual(
        [...snapshots.map((value) => value.committed)].sort((a, b) => a - b),
      );
      expect(repo.progress(jobId)).toEqual({ committed: 12, total: 12 });
    });
    And('exec_log contains exactly one successful row per done task', assertLog);
  });
});
