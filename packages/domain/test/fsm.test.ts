import { expect, it } from 'vitest';
import { IllegalTransition, jobOutcome, jobTransition, taskTransition } from '../src/jobs/fsm.ts';
import { planRecovery } from '../src/jobs/recovery.ts';

const jobs = [
  'queued',
  'running',
  'paused',
  'blocked',
  'failed',
  'cancelled',
  'completed',
  'completed_with_issues',
] as const;
const jobEvents = ['start', 'complete', 'complete-with-issues', 'fail', 'retry'] as const;
const jobEdges: Record<string, string> = {
  'queued:start': 'running',
  'running:complete': 'completed',
  'running:complete-with-issues': 'completed_with_issues',
  'running:fail': 'failed',
  'failed:retry': 'queued',
  'completed_with_issues:retry': 'queued',
};
for (const state of jobs)
  for (const event of jobEvents) {
    it(`job ${state} + ${event} obeys the approved transition table`, () => {
      const expected = jobEdges[`${state}:${event}`];
      const result = jobTransition(state, event);
      if (expected) expect(result).toBe(expected);
      else expect(result).toBeInstanceOf(IllegalTransition);
    });
  }
const tasks = ['queued', 'running', 'done', 'failed', 'quarantined'] as const;
const taskEvents = ['claim', 'commit', 'retry', 'quarantine'] as const;
const taskEdges: Record<string, string> = {
  'queued:claim': 'running',
  'running:commit': 'done',
  'running:retry': 'queued',
  'running:quarantine': 'quarantined',
  'failed:retry': 'queued',
  'quarantined:retry': 'queued',
};
for (const state of tasks)
  for (const event of taskEvents) {
    it(`task ${state} + ${event} obeys the approved transition table`, () => {
      const expected = taskEdges[`${state}:${event}`];
      const result = taskTransition(state, event);
      if (expected) expect(result).toBe(expected);
      else expect(result).toBeInstanceOf(IllegalTransition);
    });
  }
it('derives completion only from committed or terminal tasks, including empty jobs', () => {
  expect(jobOutcome([])).toBe('completed');
  expect(jobOutcome(['done', 'done'])).toBe('completed');
  expect(jobOutcome(['done', 'quarantined'])).toBe('completed_with_issues');
  expect(jobOutcome(['done', 'failed'])).toBe('completed_with_issues');
  expect(jobOutcome(['done', 'queued'])).toBe('running');
  expect(jobOutcome(['running', 'quarantined'])).toBe('running');
});
it('recovers old-boot tasks in unit order while preserving done/current-boot tasks and attempt limits', () => {
  const rows = [
    {
      taskId: 1,
      unitOrder: 2,
      state: 'running' as const,
      attempt: 1,
      maxAttempts: 3,
      bootId: 'old',
    },
    { taskId: 2, unitOrder: 0, state: 'done' as const, attempt: 1, maxAttempts: 3, bootId: 'old' },
    {
      taskId: 3,
      unitOrder: 1,
      state: 'running' as const,
      attempt: 3,
      maxAttempts: 3,
      bootId: 'old',
    },
    {
      taskId: 4,
      unitOrder: 3,
      state: 'running' as const,
      attempt: 1,
      maxAttempts: 3,
      bootId: 'new',
    },
  ];
  expect(planRecovery(rows, 'new')).toEqual({
    requeue: [1],
    quarantine: [3],
    resumedFromUnit: 2,
    notRedoneCount: 1,
  });
  expect(
    planRecovery(
      rows.filter((row) => row.state === 'done' || row.bootId === 'new'),
      'new',
    ),
  ).toEqual({ requeue: [], quarantine: [], resumedFromUnit: null, notRedoneCount: 1 });
  expect(planRecovery([], 'new')).toEqual({
    requeue: [],
    quarantine: [],
    resumedFromUnit: null,
    notRedoneCount: 0,
  });
});
