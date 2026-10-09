# covers: apps/main/src/egress-l1.ts, packages/egress/src/guard.ts, apps/core/src/checks/egress-zero.check.ts
@ui @req-PLAT-05
Feature: A monitored full check makes zero outbound connection attempts
  Positive controls prove the observers work without contacting real internet services.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  # n/a kind-cancellation: no outbound request is ever permitted, so none can be cancelled.

  @plan-01-15 @kind-happy
  Scenario: Full System check remains offline with every engine host active
    Given Danesh is launched with that library folder under a recording proxy and process-tree endpoint sampler
    When I run a full System check with LLM, OCR and TTS hosts active
    Then the proxy records zero requests
    And the sampler observes zero non-loopback TCP connections or UDP endpoints from the app's process tree
    And Chromium and every Node guard record zero outbound attempts
    And «اتصال به اینترنت» shows «موفق»

  @plan-01-15 @kind-edge
  Scenario: Independent observers detect deliberate test-only connections
    Given a separate test-build session uses that library folder with the deny filter disabled only for the positive control
    When its test-only Chromium connection is directed to the local recording proxy
    Then the proxy records the control request without forwarding it to the internet
    When an unguarded test-only host in the app's process tree opens a pending raw socket to "192.0.2.1"
    Then the process-tree sampler records the non-loopback control endpoint
    And no real internet host is contacted

  @plan-01-15 @kind-recovery
  Scenario: Core and engine restarts retain the deny policy
    Given the test build of Danesh is launched with that library folder under all egress monitors
    When a full System check runs with one Core restart and one engine-host restart
    Then every restarted process installs its deny guard before other application modules
    And all monitors still record zero outbound attempts from the app's process tree

  @plan-01-15 @kind-invalid
  Scenario: A blocked request log omits its private path and query
    Given the test build of Danesh is launched with that library folder
    When a test-only request with a private path and query is attempted under the deny policy
    Then the request is blocked before transport
    And its denial log contains the normalized host only as the request address
    And its path and query appear nowhere in the log

  @plan-01-15 @kind-persistence
  Scenario: Relaunch keeps the allowlist empty and the egress row successful
    Given Danesh is launched with that library folder and a full System check has passed
    When Danesh is closed and relaunched with the same library folder under the egress monitors
    And another full System check is run
    Then the production allowlist is still empty
    And «اتصال به اینترنت» shows «موفق» with zero outbound attempts
