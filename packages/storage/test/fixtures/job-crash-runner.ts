// Plain Node, real SQLite/WAL and CAS: no mocked process or successful task commit.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { createCas } from '../../src/cas.ts';
import { createJobsRepo } from '../../src/jobs-repo.ts';
import { planMigrations, runMigrations } from '../../src/migrate.ts';

const [root, crashPoint] = process.argv.slice(2);
if (!root) throw new Error('Library root required');
mkdirSync(root, { recursive: true });
const cas = createCas({ blobsDir: join(root, 'blobs'), tmpDir: join(root, 'tmp') });
await cas.sweepTmp();
const db = new Database(join(root, 'danesh.db'));
db.pragma('journal_mode=WAL');
db.pragma('synchronous=FULL');
db.pragma('foreign_keys=ON');
const migrationsDir = resolve('packages/storage/migrations');
const migrations = readdirSync(migrationsDir).map((name) => ({
  id: name.slice(0, 4),
  sql: readFileSync(join(migrationsDir, name), 'utf8'),
}));
runMigrations(db, planMigrations(migrations), { appVersion: 'crash-fixture' });
const repo = createJobsRepo(db);
const bootId = randomBytes(16).toString('hex');
repo.recover(bootId);
const jobId =
  repo.latestJob('sample.durable')?.jobId ??
  repo.createJob(
    'sample.durable',
    'bundled-fixture',
    Array.from({ length: 12 }, (_, unitOrder) => ({ unitOrder, unitKey: String(unitOrder) })),
  );
function checkpoint(stage: string, order: number): void {
  process.stdout.write(`${JSON.stringify({ stage, order, progress: repo.progress(jobId) })}\n`);
  if (crashPoint === `${stage}:${order}`) process.kill(process.pid, 'SIGKILL');
}
try {
  for (;;) {
    const task = repo.claimNext(jobId, bootId);
    if (!task) break;
    checkpoint('after-claim', task.unitOrder);
    const result = await cas.put(Buffer.from(`sample unit ${task.unitOrder}`));
    checkpoint('after-blob', task.unitOrder);
    repo.commit(task.taskId, task.attempt, result.sha256);
    checkpoint('after-commit', task.unitOrder);
  }
  process.stdout.write(`${JSON.stringify({ snapshot: repo.snapshot(jobId) })}\n`);
} finally {
  db.close();
}
