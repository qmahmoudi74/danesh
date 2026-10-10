import { randomUUID } from 'node:crypto';
import type { SampleJobSnapshot } from '../../contracts/src/jobs.ts';
import {
  IllegalTransition,
  type JobEvent,
  type JobState,
  jobOutcome,
  jobTransition,
  type TaskState,
  taskTransition,
} from '../../domain/src/jobs/fsm.ts';
import { planRecovery } from '../../domain/src/jobs/recovery.ts';
import type { Db } from './db.ts';

type Job = {
  jobId: string;
  state: JobState;
  createdAt: number;
  finishedAt: number | null;
  resumedFromUnit: number | null;
  notRedoneCount: number | null;
};
export type DurableTask = {
  taskId: number;
  jobId: string;
  unitKey: string;
  unitOrder: number;
  state: TaskState;
  attempt: number;
  maxAttempts: number;
  bootId: string | null;
  outputRef: string | null;
};
export type JobUnit = { unitKey: string; unitOrder: number };
const JOB_COLUMNS =
  'job_id AS jobId, state, created_at AS createdAt, finished_at AS finishedAt, resumed_from_unit AS resumedFromUnit, not_redone_count AS notRedoneCount';
const TASK_COLUMNS =
  'task_id AS taskId, job_id AS jobId, unit_key AS unitKey, unit_order AS unitOrder, state, attempt, max_attempts AS maxAttempts, boot_id AS bootId, output_ref AS outputRef';

/** The single Core writer owns this repository; task results publish in CAS before commit. */
export function createJobsRepo(db: Db, now = Date.now) {
  const getJob = (jobId: string) =>
    db.prepare(`SELECT ${JOB_COLUMNS} FROM job WHERE job_id=?`).get(jobId) as Job | undefined;
  const tasks = (jobId: string) =>
    db
      .prepare(`SELECT ${TASK_COLUMNS} FROM task WHERE job_id=? ORDER BY unit_order,task_id`)
      .all(jobId) as DurableTask[];
  function transition(jobId: string, event: JobEvent): void {
    const job = getJob(jobId);
    if (!job) throw new Error('Unknown job');
    const state = jobTransition(job.state, event);
    if (state instanceof IllegalTransition) throw state;
    const terminal = ['completed', 'completed_with_issues', 'failed'].includes(state);
    db.prepare('UPDATE job SET state=?,updated_at=?,finished_at=? WHERE job_id=?').run(
      state,
      now(),
      terminal ? now() : null,
      jobId,
    );
  }
  function settle(jobId: string): void {
    const outcome = jobOutcome(tasks(jobId).map((task) => task.state));
    if (outcome === 'running' || getJob(jobId)?.state !== 'running') return;
    transition(jobId, outcome === 'completed' ? 'complete' : 'complete-with-issues');
  }
  function fanOut(jobId: string, kind: string, units: readonly JobUnit[]): void {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO task(job_id,kind,unit_key,unit_order,state) VALUES (?,?,?,?,'queued')",
    );
    db.transaction(() => {
      for (const unit of units) {
        if (!Number.isSafeInteger(unit.unitOrder) || unit.unitOrder < 0 || !unit.unitKey)
          throw new TypeError('Invalid job unit');
        insert.run(jobId, kind, unit.unitKey, unit.unitOrder);
      }
    })();
  }
  function createJob(kind: string, inputRef: string, units: readonly JobUnit[]): string {
    return db.transaction(() => {
      const jobId = randomUUID();
      db.prepare(
        "INSERT INTO job(job_id,kind,state,input_ref,created_at,updated_at) VALUES (?,?,'queued',?,?,?)",
      ).run(jobId, kind, inputRef, now(), now());
      fanOut(jobId, kind, units);
      if (units.length === 0) {
        transition(jobId, 'start');
        settle(jobId);
      }
      return jobId;
    })();
  }
  function claimNext(jobId: string, bootId: string): DurableTask | undefined {
    return db.transaction(() => {
      const job = getJob(jobId);
      if (!job || !['queued', 'running'].includes(job.state)) return undefined;
      if (job.state === 'queued') transition(jobId, 'start');
      const task = db
        .prepare(`UPDATE task SET state='running',attempt=attempt+1,boot_id=?,error_class=NULL
        WHERE task_id=(SELECT task_id FROM task WHERE job_id=? AND state='queued' AND attempt<max_attempts ORDER BY unit_order,task_id LIMIT 1)
        RETURNING ${TASK_COLUMNS}`)
        .get(bootId, jobId) as DurableTask | undefined;
      if (!task) settle(jobId);
      return task;
    })();
  }
  function commit(taskId: number, attempt: number, outputRef: string): void {
    if (outputRef.length !== 64 || !/^[0-9a-f]{64}$/.test(outputRef))
      throw new TypeError('Invalid CAS reference');
    db.transaction(() => {
      const task = db
        .prepare(
          `UPDATE task SET state='done',output_ref=? WHERE task_id=? AND state='running' AND attempt=? RETURNING ${TASK_COLUMNS}`,
        )
        .get(outputRef, taskId, attempt) as DurableTask | undefined;
      if (!task) throw new IllegalTransition('Task claim is stale or already committed');
      db.prepare(
        'INSERT INTO exec_log(task_id,attempt,output_ref,committed_at) VALUES (?,?,?,?)',
      ).run(taskId, attempt, outputRef, now());
      settle(task.jobId);
    })();
  }
  function failAttempt(taskId: number, errorClass: string): TaskState {
    return db.transaction(() => {
      const task = db.prepare(`SELECT ${TASK_COLUMNS} FROM task WHERE task_id=?`).get(taskId) as
        | DurableTask
        | undefined;
      if (!task || task.state !== 'running')
        throw new IllegalTransition('Only a running task may fail');
      const state = taskTransition(
        task.state,
        task.attempt < task.maxAttempts ? 'retry' : 'quarantine',
      );
      if (state instanceof IllegalTransition) throw state;
      db.prepare('UPDATE task SET state=?,error_class=?,boot_id=NULL WHERE task_id=?').run(
        state,
        errorClass.replace(/[^A-Za-z]/g, '').slice(0, 64) || 'TaskError',
        taskId,
      );
      settle(task.jobId);
      return state;
    })();
  }
  function progress(jobId: string) {
    return db
      .prepare(
        "SELECT COUNT(*) AS total,COALESCE(SUM(state='done'),0) AS committed FROM task WHERE job_id=?",
      )
      .get(jobId) as { total: number; committed: number };
  }
  function snapshot(jobId: string): SampleJobSnapshot | null {
    const job = getJob(jobId);
    if (!job) return null;
    return {
      ...job,
      ...progress(jobId),
      notRedoneCount: job.notRedoneCount ?? 0,
      chunks: tasks(jobId).map((task) => ({
        index: task.unitOrder + 1,
        state: task.state,
        attempt: task.attempt,
      })),
    };
  }
  function latestJob(kind: string): SampleJobSnapshot | null {
    const job = db
      .prepare(
        `SELECT ${JOB_COLUMNS} FROM job WHERE kind=? ORDER BY created_at DESC,rowid DESC LIMIT 1`,
      )
      .get(kind) as Job | undefined;
    return job ? snapshot(job.jobId) : null;
  }
  function retry(jobId: string): void {
    db.transaction(() => {
      transition(jobId, 'retry');
      db.prepare(
        "UPDATE task SET state='queued',max_attempts=attempt+3,boot_id=NULL,error_class=NULL WHERE job_id=? AND state IN ('failed','quarantined')",
      ).run(jobId);
    })();
  }
  type RecoveryPlan = ReturnType<typeof planRecovery> & { jobId: string; bootId: string };
  function applyRecovery(plan: RecoveryPlan): void {
    db.transaction(() => {
      const update = db.prepare(
        "UPDATE task SET state=?,boot_id=NULL WHERE task_id=? AND job_id=? AND state='running' AND (boot_id IS NULL OR boot_id!=?)",
      );
      for (const taskId of plan.requeue) update.run('queued', taskId, plan.jobId, plan.bootId);
      for (const taskId of plan.quarantine)
        update.run('quarantined', taskId, plan.jobId, plan.bootId);
      db.prepare(
        'UPDATE job SET resumed_from_unit=?,not_redone_count=?,updated_at=? WHERE job_id=?',
      ).run(plan.resumedFromUnit, plan.notRedoneCount, now(), plan.jobId);
      settle(plan.jobId);
    })();
  }
  function activeJobs(kind?: string): string[] {
    const rows =
      kind === undefined
        ? db.prepare("SELECT job_id AS jobId FROM job WHERE state IN ('queued','running')").all()
        : db
            .prepare(
              "SELECT job_id AS jobId FROM job WHERE kind=? AND state IN ('queued','running')",
            )
            .all(kind);
    return (rows as { jobId: string }[]).map((row) => row.jobId);
  }
  function recover(bootId: string): number {
    let changed = 0;
    for (const jobId of activeJobs()) {
      const rows = tasks(jobId);
      if (rows.some((row) => row.state === 'running' && row.bootId === bootId)) continue;
      const plan = planRecovery(rows, bootId);
      if (getJob(jobId)?.state !== 'running' && plan.resumedFromUnit === null) continue;
      plan.resumedFromUnit ??=
        rows.find((row) => row.state === 'queued')?.unitOrder !== undefined
          ? rows.find((row) => row.state === 'queued')!.unitOrder + 1
          : null;
      if (plan.resumedFromUnit === null) continue;
      applyRecovery({ ...plan, jobId, bootId });
      changed += plan.requeue.length + plan.quarantine.length;
    }
    return changed;
  }
  return {
    createJob,
    fanOut,
    claimNext,
    commit,
    failAttempt,
    progress,
    snapshot,
    latestJob,
    tasks,
    retry,
    recover,
    applyRecovery,
    activeJobs,
    failJob: (jobId: string) => transition(jobId, 'fail'),
  };
}
export type JobsRepo = ReturnType<typeof createJobsRepo>;
