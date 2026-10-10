import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createJobsRepo } from '../src/jobs-repo.ts';

/** Read-only evidence for crash and Electron acceptance tests; SQL stays in the storage layer. */
export function readJobAudit(root: string, jobId: string) {
  const db = new Database(join(root, 'danesh.db'), { readonly: true, fileMustExist: true });
  try {
    const repo = createJobsRepo(db);
    const snapshot = repo.snapshot(jobId);
    if (!snapshot) throw new Error('Job audit requires an existing job');
    return {
      snapshot,
      tasks: repo.tasks(jobId),
      executions: db
        .prepare(
          'SELECT e.task_id AS taskId,e.attempt,e.output_ref AS outputRef FROM exec_log e JOIN task t ON t.task_id=e.task_id WHERE t.job_id=? ORDER BY t.unit_order',
        )
        .all(jobId) as { taskId: number; attempt: number; outputRef: string }[],
    };
  } finally {
    db.close();
  }
}
