export const JOB_STATES = [
  'queued',
  'running',
  'paused',
  'blocked',
  'failed',
  'cancelled',
  'completed',
  'completed_with_issues',
] as const;
export type JobState = (typeof JOB_STATES)[number];
export type JobEvent = 'start' | 'complete' | 'complete-with-issues' | 'fail' | 'retry';
export const TASK_STATES = ['queued', 'running', 'done', 'failed', 'quarantined'] as const;
export type TaskState = (typeof TASK_STATES)[number];
export type TaskEvent = 'claim' | 'commit' | 'retry' | 'quarantine';

export class IllegalTransition extends Error {
  override readonly name = 'IllegalTransition';
}
const jobTable: Partial<Record<JobState, Partial<Record<JobEvent, JobState>>>> = {
  queued: { start: 'running' },
  running: {
    complete: 'completed',
    'complete-with-issues': 'completed_with_issues',
    fail: 'failed',
  },
  failed: { retry: 'queued' },
  completed_with_issues: { retry: 'queued' },
};
const taskTable: Partial<Record<TaskState, Partial<Record<TaskEvent, TaskState>>>> = {
  queued: { claim: 'running' },
  running: { commit: 'done', retry: 'queued', quarantine: 'quarantined' },
  failed: { retry: 'queued' },
  quarantined: { retry: 'queued' },
};
export function jobTransition(state: JobState, event: JobEvent): JobState | IllegalTransition {
  return (
    jobTable[state]?.[event] ?? new IllegalTransition(`Illegal job transition: ${state} ${event}`)
  );
}
export function taskTransition(state: TaskState, event: TaskEvent): TaskState | IllegalTransition {
  return (
    taskTable[state]?.[event] ?? new IllegalTransition(`Illegal task transition: ${state} ${event}`)
  );
}
export function jobOutcome(
  states: readonly TaskState[],
): 'running' | 'completed' | 'completed_with_issues' {
  if (states.some((state) => state === 'queued' || state === 'running')) return 'running';
  return states.some((state) => state === 'quarantined' || state === 'failed')
    ? 'completed_with_issues'
    : 'completed';
}
