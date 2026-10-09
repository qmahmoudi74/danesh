# covers: packages/storage/src/cas.ts
@core @req-PLAT-08
Feature: Atomic hash-addressed artifact storage
  Only complete verified bytes are published at paths derived from their content hash.

  @plan-01-12 @kind-happy
  Scenario: Stored bytes are addressed and read back by their SHA-256
    Given an artifact byte stream and its expected SHA-256
    When the content-addressed store writes the artifact
    Then its key is the lowercase 64-hex SHA-256
    And its path is "blobs/sha256/<first 2 hex>/<64 hex>" derived only from the hash
    And reading by that key returns exactly the original bytes

  @plan-01-12 @kind-invalid
  Scenario: Corrupted stored bytes are rejected on read
    Given a stored blob whose bytes have been changed after publication
    When the blob is read by its original hash
    Then the store rejects the read with an integrity error

  @plan-01-12 @kind-edge
  Scenario: A zero-byte artifact is a valid stored blob
    Given an empty artifact byte stream
    When the content-addressed store writes and reads the artifact
    Then the key equals the SHA-256 of empty input
    And reading returns zero bytes rather than a missing-blob result

  @plan-01-12 @kind-edge
  Scenario Outline: Duplicate writes publish one blob without rewriting it
    Given two artifact streams with identical bytes
    When the streams are stored <ordering>
    Then both writes return the same hash and exactly one final blob exists
    And the later publication does not rewrite the existing final file

    Examples:
      | ordering     |
      | sequentially |
      | concurrently |

  @plan-01-12 @kind-edge
  Scenario Outline: Transient Windows publication errors use bounded retries
    Given a publish operation that transiently fails with <error>
    And an existing final blob with the expected bytes
    When the content-addressed store publishes the same bytes
    Then retries use bounded backoff rather than an unbounded loop
    And success requires verifying the existing final file's hash

    Examples:
      | error  |
      | EPERM  |
      | EBUSY  |
      | EACCES |

  @plan-01-12 @kind-recovery
  Scenario: Killing a writer leaves no partial final blob
    Given an artifact stream whose write has not finished
    When the writer process is killed mid-write
    Then no partial blob exists at the final hash path
    When the store starts again
    Then orphaned temporary files are swept before further writes

  @plan-01-12 @kind-cancellation
  Scenario: Aborting a write cleans up unpublished bytes
    Given an artifact write stream in progress
    When the write is aborted before publication
    Then neither a final blob nor its temporary file remains

  @plan-01-12 @kind-persistence
  Scenario: A published blob remains verifiable after restart
    Given an artifact stored successfully by its hash
    When the store is closed and reopened with the same library
    Then reading the artifact returns the original bytes with a matching SHA-256
