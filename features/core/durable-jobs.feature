# covers: packages/domain/src/jobs/fsm.ts, packages/domain/src/jobs/recovery.ts, packages/storage/src/jobs-repo.ts, apps/core/src/sample-job.ts
@core @req-JOB-03
Feature: Durable tasks retain committed work across crashes
  Output references and successful execution records commit with the task's done state.

  # n/a kind-cancellation: user pause and cancel of jobs is JOB-02 in Phase 2; the Phase 1 kernel and sample job have no cancel path (UI-SPEC A-08).

  @plan-01-13 @kind-happy
  Scenario: A job commits each task and its output exactly once
    Given a job with 12 queued tasks in unit order
    When the job runs to completion
    Then each task runs once and the job ends completed
    And each task's output reference, successful exec_log row and done flip share one transaction
    And every committed output reference resolves to verified bytes

  @plan-01-13 @kind-invalid
  Scenario: Repeated fan-out cannot duplicate a task
    Given an existing task identified by job_id, kind and unit_key
    When fan-out inserts that same identity again
    Then the insert is a no-op and exactly one task retains that identity

  @plan-01-13 @kind-edge
  Scenario: An empty job and an empty recovery pass require no task work
    Given a job with zero tasks and no orphaned tasks in the library
    When the job is scheduled and boot recovery runs
    Then the job completes immediately
    And boot recovery changes no task rows

  @plan-01-13 @kind-edge
  Scenario: Attempt limits quarantine persistent failures
    Given failed tasks at and below the configured maximum attempt count
    When retry decisions are made
    Then the task at the limit is quarantined
    And the task below the limit is queued for retry
    When all remaining tasks have settled
    Then the job containing the quarantined task ends completed_with_issues

  @plan-01-13 @kind-recovery
  Scenario Outline: SIGKILL at a transactional crash point leaves a resumable job
    Given an interrupted job with committed tasks and a running task under the current boot_id
    When Core is killed with SIGKILL at <crash_point>
    And Core restarts with a new boot_id and the same library
    Then tasks running under the previous boot_id are re-queued within their attempt limit
    And committed output references and their verified bytes are preserved
    When the job finishes
    Then exec_log contains exactly one successful row for every done task

    Examples:
      | crash_point  |
      | after-claim  |
      | after-blob   |
      | after-commit |

  @plan-01-13 @kind-persistence
  Scenario: Two consecutive restarts never redo committed tasks
    Given a partially committed job whose tasks have an original unit order
    When Core is restarted twice while the job resumes
    And the job runs to completion
    Then no committed task is executed again
    And resumed tasks run in their original unit order
    And every progress snapshot is the integer count of committed tasks out of the total
    And exec_log contains exactly one successful row per done task
