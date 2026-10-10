import type { TaskState } from './fsm.ts';

export type RecoveryRow = {
  taskId: number;
  unitOrder: number;
  state: TaskState;
  attempt: number;
  maxAttempts: number;
  bootId: string | null;
};
export function planRecovery(rows: readonly RecoveryRow[], currentBootId: string) {
  const orphans = rows
    .filter((row) => row.state === 'running' && row.bootId !== currentBootId)
    .sort((left, right) => left.unitOrder - right.unitOrder || left.taskId - right.taskId);
  return {
    requeue: orphans.filter((row) => row.attempt < row.maxAttempts).map((row) => row.taskId),
    quarantine: orphans.filter((row) => row.attempt >= row.maxAttempts).map((row) => row.taskId),
    resumedFromUnit: orphans[0] ? orphans[0].unitOrder + 1 : null,
    notRedoneCount: rows.filter((row) => row.state === 'done').length,
  };
}
