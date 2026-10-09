# covers: packages/domain/src/supervision/backoff.ts, packages/domain/src/supervision/policy.ts, apps/main/src/supervisor.ts
@core @req-PLAT-04
Feature: Supervised engine hosts contain failures
  Unrequested exits are crashes regardless of exit code; requested shutdowns never restart.

  @plan-01-14 @kind-happy
  Scenario: A healthy host serves its task without restarting
    Given a healthy supervised engine host
    When it serves a task successfully
    Then its process id is unchanged and its restart count is zero

  @plan-01-14 @kind-invalid
  Scenario: Malformed host messages are rejected without losing retry eligibility
    Given a supervised engine host with an in-flight task
    When the host sends a message that fails the host protocol schema
    Then the message is rejected and logged without its payload
    And the in-flight task is marked retriable

  @plan-01-14 @kind-edge
  Scenario Outline: Restart backoff is a deterministic capped integer delay
    Given a backoff base of 250 ms and a cap of 15000 ms
    When the pure backoff function receives restart count <count>
    Then it returns integer <delay> ms on every call
    And the delay never exceeds 15000 ms

    Examples:
      | count | delay |
      | 0     | 250   |
      | 1     | 500   |
      | 2     | 1000  |
      | 5     | 8000  |
      | 6     | 15000 |
      | 20    | 15000 |

  @plan-01-14 @kind-edge
  Scenario: A healthy reset window clears the restart count
    Given a restarted engine host with a nonzero failure count
    When it remains healthy for 60000 ms
    Then its failure count resets to zero
    And its next crash uses the 250 ms initial backoff

  @plan-01-14 @kind-edge
  Scenario: Repeated crashes retry only the in-flight task until quarantine
    Given a job with committed tasks and one in-flight task with a maximum of 3 attempts
    When that task's host crashes on its first and second attempts
    Then each crash follows the same backoff and retry policy
    And no committed task is re-executed
    When the host crashes on the third attempt of the same task
    Then that task is quarantined and its job ends completed_with_issues after the remaining tasks settle

  @plan-01-14 @kind-recovery
  Scenario Outline: Every unrequested termination is a crash
    Given an engine host with an in-flight task and the other processes' ids recorded
    And the OOM fault host has a 64 MB V8 heap bound
    When the host undergoes <fault> without a supervisor-requested shutdown
    Then its in-flight task is marked retriable
    And the host restarts after its policy backoff
    And Main, the renderer, Core and other engine hosts keep running with their recorded ids

    Examples:
      | fault                        |
      | an external kill             |
      | exit code 0                  |
      | exit code 1                  |
      | process abort                |
      | spin past the watchdog       |
      | out-of-memory under the bound |

  @plan-01-14 @kind-cancellation
  Scenario: Requested shutdown stops a host without restarting it
    Given a supervised engine host
    When the supervisor requests its stop for app shutdown
    Then the resulting exit is not classified as a crash
    And no restart is scheduled

  @plan-01-14 @kind-persistence
  Scenario: Crash and restart events leave local metadata evidence
    Given a supervised engine host that crashes and restarts
    When the event log is read from the library
    Then crash and restart records contain process kind, exit code and attempt number
    And neither record contains task payloads
