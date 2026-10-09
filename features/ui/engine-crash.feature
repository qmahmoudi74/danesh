# covers: apps/main/src/supervisor.ts, apps/core/src/engine-client.ts
@ui @req-PLAT-04
Feature: Engine crashes and Core restarts leave the window usable
  Recovery preserves committed work and closing the application stops its entire process tree.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  @plan-01-14 @kind-happy
  Scenario: A healthy host completes work without a recovery notice
    Given Danesh is launched with that library folder on System check
    When a sample job runs with a healthy sample host
    Then the job completes and the window stays responsive
    And no engine restart is recorded or recovery notice shown

  @plan-01-14 @kind-recovery
  Scenario Outline: An unexpected host exit restarts only that host
    Given the test build of Danesh is launched with that library folder on System check
    And an engine probe is running with the Core and other hosts' process ids recorded
    And the OOM fault host is bounded to a 64 MB V8 heap
    When the probe host experiences fault <fault>
    Then the window stays responsive and Core and other hosts keep their recorded ids
    And the probe row shows «موتور متوقف شد و تا چند لحظهٔ دیگر دوباره راه‌اندازی می‌شود (تلاش ۱).» during restart
    And the host restarts after backoff with a new process id

    Examples:
      | fault |
      | kill  |
      | exit0 |
      | exit1 |
      | abort |
      | spin  |
      | oom   |

  @plan-01-14 @kind-edge
  Scenario: Repeated crashes quarantine one task without discarding other work
    Given the test build of Danesh is launched with that library folder on System check
    And a sample job has committed chunks
    When the same in-flight task crashes its host on all 3 attempts
    Then that task is quarantined and the job ends completed_with_issues
    And committed chunks remain done and the window stays usable

  @plan-01-14 @kind-recovery
  Scenario: Core killed mid-job is respawned and reconnects without window reload
    Given the test build of Danesh is launched with that library folder on System check
    And a sample job has committed chunks and one in-flight chunk
    When Core is killed unexpectedly
    Then Main respawns Core and re-brokers the renderer and host ports
    And the window reconnects without reloading
    And the job resumes without redoing any committed chunk

  @plan-01-14 @kind-invalid
  Scenario: Invalid host messages are rejected and logged without their payload
    Given the test build of Danesh is launched with that library folder on System check
    When an engine host sends a message that fails schema validation
    Then the message is rejected and a local metadata-only rejection record is written
    And its in-flight task remains retriable and the window remains usable

  @plan-01-14 @kind-cancellation
  Scenario: Closing Danesh stops every child without restarts
    Given Danesh is launched with that library folder and engine hosts are active
    When I close the application
    Then every host and Core stop as supervisor-requested shutdowns
    And no shutdown exit schedules a restart
    And no process belonging to this Danesh instance remains running

  @plan-01-14 @kind-persistence
  Scenario: Crash and restart evidence remains local across relaunch
    Given the test build of Danesh is launched with that library folder
    And an engine host has crashed and restarted
    When Danesh is closed and reopened with the same library folder
    Then the local log still contains crash and restart records with process kind, exit code and attempt number
    And those records contain no payloads
