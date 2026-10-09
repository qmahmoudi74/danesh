# covers: packages/egress/src/policy.ts, packages/egress/src/broker.ts, packages/egress/src/guard.ts
@core @req-PLAT-05
Feature: Default-deny network policy with an empty production allowlist
  The broker denies every Phase 1 outbound request and records no private request content.

  # n/a kind-cancellation: no outbound request can be in flight because none is ever permitted in Phase 1.

  @plan-01-15 @kind-happy
  Scenario: The production broker denies every outbound purpose
    Given the empty Phase 1 production allowlist
    When model-download, web-research and update-check requests reach the broker
    Then every request is denied before reaching a transport
    And denial logs identify the normalized host without path, query, headers or body

  @plan-01-15 @kind-invalid
  Scenario Outline: Normalization does not let host variants bypass default deny
    Given the empty Phase 1 production allowlist
    When the policy receives host <host>
    Then lowercase, IDNA-to-punycode and trailing-dot normalization precede host matching
    And the request is denied

    Examples:
      | host                       |
      | HuggingFace.co             |
      | huggingface.co.            |
      | مثال.example              |
      | evil-huggingface.co        |
      | huggingface.co.evil.example |

  @plan-01-15 @kind-edge
  Scenario: Only an exact normalized host can match an allow rule
    Given a test-only allowlist fixture and an accepted test consent grant
    When HTTPS requests with the rule's purpose use an exact normalized host or a prefix or suffix lookalike
    Then only the exact normalized host matches
    And permuting the fixture's rules never changes any decision
    And the fixture never changes the empty production allowlist

  @plan-01-15 @kind-invalid
  Scenario Outline: Network APIs outside the egress boundary fail lint
    Given an application module outside "packages/egress"
    When the module uses <network_api>
    Then boundary lint rejects that module

    Examples:
      | network_api       |
      | an http import    |
      | an https import   |
      | a net import      |
      | a tls import      |
      | a dns import      |
      | an undici import  |
      | global fetch      |
      | a dgram import    |
      | an http2 import   |

  @plan-01-15 @kind-recovery
  Scenario Outline: Process restarts reinstall the guard before application modules
    Given a guarded <process_kind> process
    When that process restarts
    Then its deny guard is installed before any other application module runs
    And its production allowlist remains empty

    Examples:
      | process_kind |
      | Core         |
      | engine host  |

  @plan-01-15 @kind-persistence
  Scenario: Builds and relaunches retain denied outbound stubs
    Given the production build with an empty frozen allowlist
    When Core and every engine host are relaunched
    Then the allowlist remains empty in each process
    And model-download, web-research and update-check entry points remain denied stubs
    And no real network transport is present in the Phase 1 build
