# covers: packages/storage/src/migrate.ts, packages/storage/src/backup.ts, packages/storage/src/db.ts
@core @req-PLAT-06 @req-PLAT-07
Feature: Forward-only migrations with verified restorable backups
  A migration may change data only after its preconditions and backup have been verified.

  @plan-01-11 @kind-happy
  Scenario: A fresh library reaches the newest schema without a backup
    Given a library with no database file and a valid numbered migration set
    When the migration runner opens the library
    Then every migration is applied in ascending numeric order
    And the database user_version equals the highest known schema version
    And no pre-migration backup is created

  @plan-01-11 @kind-happy
  Scenario: One pending migration follows one verified backup
    Given an existing library with exactly one pending migration
    When the migration runner upgrades the library
    Then exactly one backup is created using "VACUUM INTO ?" and published to "backups/"
    And the backup passes "PRAGMA quick_check" before the migration begins
    And the migration executes in its own transaction
    And "PRAGMA foreign_key_check" returns zero rows before that transaction commits

  @plan-01-11 @kind-invalid
  Scenario: A changed applied migration is refused while line-ending differences are harmless
    Given an applied migration and its stored checksum
    When the unchanged migration file is represented with CRLF instead of LF
    Then its LF-normalized SHA-256 equals the stored checksum
    When the applied migration SQL content is changed
    And the migration runner opens the library
    Then it refuses to start with a checksum mismatch before applying any migration
    And the prior rows and migration history are unchanged

  @plan-01-11 @kind-invalid
  Scenario Outline: Malformed migration numbering is refused
    Given a migration set with <defect>
    When the migration runner opens the library
    Then it reports a clear migration-set error
    And no migration is applied

    Examples:
      | defect                         |
      | two files with the same number |
      | a gap in the numbering         |

  @plan-01-11 @kind-edge
  Scenario: Equal schema versions open and newer versions are refused untouched
    Given database fixtures at the highest known user_version and one version higher
    And the SHA-256 of each database file has been recorded
    When the migration runner probes each fixture
    Then the equal-version fixture opens normally without a backup
    And the newer-version fixture is refused through a read-only probe
    And the newer-version database file retains its recorded SHA-256

  @plan-01-11 @kind-edge
  Scenario Outline: Backup retention prunes only after a verified replacement
    Given <existing> valid pre-migration backups and a pending migration
    When a new backup is created
    Then no existing backup is deleted before the new backup passes "PRAGMA quick_check"
    And <remaining> valid backups remain after publication and retention
    And any deletion selects the oldest creation time encoded in the filename

    Examples:
      | existing | remaining |
      | 0        | 1         |
      | 1        | 2         |
      | 2        | 3         |
      | 3        | 3         |

  @plan-01-11 @kind-edge
  Scenario: Backups created within the same second cannot overwrite each other
    Given a library requiring two migration attempts within one second
    When both attempts create a verified backup
    Then the backup filenames are distinct
    And neither attempt overwrites the other backup

  @plan-01-11 @kind-recovery
  Scenario: A failed migration preserves prior rows in read-only recovery
    Given an existing library with prior rows and a pending migration that fails
    When the migration runner attempts the upgrade
    Then the failing migration transaction is rolled back
    And the library opens in read-only recovery with the verified backup path offered
    And the prior rows remain intact

  @plan-01-11 @kind-recovery
  Scenario: A pre-migration backup is restorable in a fresh folder
    Given a verified pre-migration backup with known prior rows
    When the backup is restored into a fresh library folder
    And it is opened with the migration set for its previous schema version
    Then user_version equals the previous schema version
    And all prior rows are intact

  @plan-01-11 @kind-cancellation
  Scenario: Killing backup creation cannot publish a partial backup
    Given an existing library with a pending migration and its live data recorded
    When the process is killed during backup creation
    Then the partial copy exists only under "tmp/"
    And it does not count as a valid backup
    And the live database retains its prior data and schema
    When the library is opened again
    Then a new backup is verified before any migration is applied

  @plan-01-11 @kind-persistence
  Scenario: A completed upgrade is a no-op on the second run
    Given a library that has been upgraded successfully
    And its backup files and schema_migration rows have been recorded
    When the migration runner runs again
    Then no migration is re-applied and no backup is taken
    And schema_migration and the backup files are unchanged

  @plan-01-11 @kind-persistence
  Scenario: Relaunch after a failed migration never overwrites an existing backup
    Given a failed migration with an existing verified backup
    And the backup filename and SHA-256 have been recorded
    When the library is relaunched and the migration is attempted again
    Then the existing backup retains its filename and SHA-256
    And the new migration attempt uses a distinct backup file
