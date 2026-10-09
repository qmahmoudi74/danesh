# covers: packages/contracts/src/rpc.ts, apps/core/src/rpc-server.ts, apps/preload/src/index.ts, packages/logging/src/jsonl.ts
@core @req-PLAT-02
Feature: Strict validation at the private RPC boundary
  Every receiver validates requests before dispatch and logs metadata without user content.

  @plan-01-07 @kind-happy
  Scenario: A valid ping returns its integer and the Core process id
    Given a connected preload and Core using the closed RPC contract map
    When the renderer calls "system.ping" with integer 42
    Then the response contains integer 42 and the Core process id

  @plan-01-07 @kind-invalid
  Scenario Outline: Method names must match the contract map exactly
    Given a connected preload and Core using the closed RPC contract map
    When a request uses the method decoded from JSON <method_json>
    Then the request is rejected as UNKNOWN_METHOD
    And a local rejection record is written without the request body

    Examples:
      | method_json    |
      | "system.ping " |
      | "System.ping"  |
      | "system.pingX" |
      | "system.pin"   |
      | ""             |

  @plan-01-07 @kind-invalid
  Scenario Outline: Required request fields are validated independently at both boundaries
    Given a request fixture with <invalid_fields>
    When the request is submitted to the preload validator
    Then strict validation rejects it before sending
    When the same request bypasses preload and reaches Core
    Then strict validation rejects it before dispatch
    And the rejection record contains only schema name, sender and error class

    Examples:
      | invalid_fields                          |
      | a missing method                        |
      | a null input                            |
      | an undefined input                      |
      | an empty input object requiring fields  |

  @plan-01-07 @kind-invalid
  Scenario Outline: Invalid requests cause no handler side effects
    Given valid requests with recorded database, job and engine effects
    When a schema-invalid request arrives <position> valid requests
    Then no database write, job creation or engine call is attributable to the invalid request
    And valid requests retain their expected effects

    Examples:
      | position |
      | before   |
      | between  |
      | after    |

  @plan-01-07 @kind-edge
  Scenario: Payload limits count serialized UTF-8 bytes and are enforced by Core
    Given schema-valid payload fixtures at a contract method's declared maximum UTF-8 byte size and one byte over
    And the fixtures contain multi-byte Persian text
    When each fixture is submitted through preload and directly to Core
    Then the payload exactly at the limit is accepted at both boundaries
    And the payload one byte over is rejected as PAYLOAD_TOO_LARGE at both boundaries
    And the measured size equals serialized UTF-8 bytes rather than JavaScript string length

  @plan-01-07 @kind-edge
  Scenario: Rejection logs exclude Unicode payload content
    Given an invalid payload containing Persian text, ZWNJ U+200C, bidi control characters and a lone UTF-16 surrogate
    When Core rejects the payload
    Then its rejection record contains only schema name, sender, error class and payload byte length
    And the log contains neither the payload characters nor their escaped representations

  @plan-01-07 @kind-recovery
  Scenario: Rejection leaves the connection usable
    Given a connected preload and Core using the closed RPC contract map
    When an invalid request is rejected
    And a valid "system.ping" request is sent on the same connection
    Then the valid ping is answered successfully

  @plan-01-07 @kind-cancellation
  Scenario: Closing the Core connection settles pending calls
    Given unresolved calls on the private Core connection
    When the Core connection closes
    Then every pending call fails with UNAVAILABLE
    And no pending call remains unresolved

  @plan-01-07 @kind-persistence
  Scenario: Local rejection logs rotate within their configured bounds
    Given a library with configured log size and file-count limits
    When enough invalid requests are rejected to trigger log rotation
    Then rejection records are stored under the library in "logs/core.jsonl" and its rotated files
    And rotation respects the configured size threshold and maximum file count
    And the records contain no payload bodies
