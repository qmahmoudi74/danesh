---
status: proposed
date: 2026-10-09
decision-makers:
  - Danesh project owner (approved Phase 1 specifications)
kind: infrastructure
spike: S-PACKAGE
---

# 0002: Database driver

## Context and Problem Statement

PLAT-06 and PLAT-07 require a versioned local database, forward-only migrations, refusal of newer schemas and restorable pre-migration backups. D-14 assigns all writes to Core and requires WAL, FULL synchronization, foreign keys, numbered checksummed SQL migrations and retention of the last 3 verified backups.

The approved default is better-sqlite3 13.0.3 behind a synchronous `Db` interface. Existing research identifies `node:sqlite` in Electron 44's bundled Node 24.21.0 as an alternative at Stability 1.2; the packaged Core must measure both drivers before the default can be confirmed. Earlier scratch runs do not fulfill this policy.

## Decision Drivers

- Loads in a packaged Core utilityProcess on Windows 11 x64 and macOS 13+ arm64, including Persian and space characters in the library path.
- WAL, `synchronous=FULL` (2), `foreign_keys=1` and `busy_timeout=5000` without a database connection in Main.
- Verified `VACUUM INTO ?` snapshots and a read-only version probe that sees WAL-committed state.
- One small synchronous adapter compatible with deterministic migration and durable-task tests.
- Permissive dependency licensing and accurate notices for shipped native binaries.

## Considered Options

1. better-sqlite3 13.0.3, N-API prebuilds externalized and unpacked, behind a synchronous `Db` interface.
2. `node:sqlite` in Node 24.21.0, using DatabaseSync behind that same interface.
3. Kysely 0.29.6 on top of a selected driver as an optional query convenience layer; not required in Phase 1 and not a replacement for a native driver.

## Decision Outcome

Propose better-sqlite3 13.0.3 as the approved default while leaving the driver decision proposed pending packaged evidence. Core alone opens the read-write database through `packages/storage/src/db.ts`; callers use the synchronous `Db` interface so a justified driver switch changes the adapter rather than domain logic.

Use WAL, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000` and STRICT tables. Before a pending migration, create one backup with `VACUUM INTO ?` outside a transaction, verify it with `PRAGMA quick_check`, publish it from `tmp/` to `backups/` and only then retain the last 3. Each migration uses its own transaction with LF-normalized SHA-256 checksums, `schema_migration`, `PRAGMA user_version` and a zero-row `PRAGMA foreign_key_check` before commit. Failure rolls back and exposes read-only recovery; a newer schema is probed read-only and never opened for writing. `index.db` is rebuildable and is not a user-data backup target.

Kysely remains optional. Its presence does not remove the checksum, backup and newer-schema guards. Switch to `node:sqlite` only according to the comparison rule below, with evidence of the same failing and passing checks on the affected target.

### Consequences

The native driver must be externalized and packaged at the correct architecture. A synchronous API is safe in Core because heavy work remains outside Main and the renderer. Migration and backup policy remain Danesh-owned and deterministic regardless of driver. Neither an in-memory alternative-driver probe nor its availability alone justifies replacing the approved default.

### Confirmation

Confirm every policy row in the packaged Core and retain driver version and sqlite_version in actual evidence. The storage-migrations feature additionally proves rollback, backup retention and restorability when Plan 01-11 binds it. This ADR cannot be accepted on a Windows-only result.

## Spike Evidence

Pass policy commit: filled at ADR finalization from git history

Commit this policy before governed runs. Never edit it after results exist; a changed policy requires a new separately committed revision preserved alongside the original.

### Pass policy

Evaluate the packaged production Core utilityProcess on **Windows 11 x64** and **macOS 13+ arm64**, using a library path containing **Persian letters and at least 1 space**, with no ASCII-path fallback. Hosted runs are recorded as Tier A separately; D-05 requires clean-machine Tier B evidence for verified support.

| ID | Required outcome on each target |
| --- | --- |
| DB1 | better-sqlite3 13.0.3 loads successfully in Core from `app.asar.unpacked`, with 0 native-loader errors; record its resolved native path and Core process id. |
| DB2 | The `database` smoke check passes, recording `journal_mode=wal`, `synchronous=2` (FULL) and `foreign_keys=1`. |
| DB3 | A bound-parameter `VACUUM INTO ?` backup at the Unicode library path completes and `PRAGMA quick_check` returns exactly `ok`, with 0 integrity errors. |
| DB4 | A read-only probe of a WAL-state copy reads the expected integer `user_version` from SQLite, with 0 database writes and no raw-header version assumption. |
| DB5 | In the same Core process, `node:sqlite` DatabaseSync opens 1 in-memory database and returns a nonempty `sqlite_version()`; record its actual success or failure. This measurement is mandatory evidence, and its failure alone does not reject better-sqlite3 if DB1-DB4 pass. |

Accept better-sqlite3 only when DB1-DB4 pass on both targets and DB5 is measured on both. **Switch only if better-sqlite3 fails a check on a target platform while node:sqlite passes the same check on that target**, using the same path, WAL state and durability conditions. An in-memory DB5 pass alone is insufficient: exercise the corresponding failed file/pragma/backup/read-only check with node:sqlite before switching. If neither driver passes that check, leave the choice unresolved and report the blocker.

### Platforms actually run

No governed run has occurred in this repository. Windows 11 x64 and macOS 13+ arm64 are both **not run** under this policy, including their Tier A and Tier B checks. Later rows must identify OS name, version, architecture, date, tier and an existing evidence path.

### Fixtures

Use `features/core/storage-migrations.feature` and `features/ui/startup-states.feature`; later runs supply known-row database fixtures, a WAL-state copy with known user_version and a Persian library path containing a space. Record full fixture hashes and driver/runtime versions from those runs rather than pre-filling evidence from scratch research.

### Results

### Raw evidence

None collected for this policy. Link the later database smoke check, resolved native path, backup quick_check, WAL probe output and same-process node:sqlite comparison output by actual path and commit.

## License

D-LICENSE selects MIT only for Danesh's original source; third-party driver and SQLite licenses remain their own. Review native prebuild provenance and notices with the permissive-only D-02 gate before distributing them. GPL, AGPL, LGPL and unknown licenses cannot silently pass that gate. No engine ADR may be accepted before the license decision is recorded in accepted ADR 0004.

## Packaging

better-sqlite3 stays an external runtime dependency with only the target platform's needed native files under `app.asar.unpacked`. Keep its native loader layout intact and test it in Core on both targets. Windows paths preserve full Unicode; macOS nested binaries must pass the ADR 0003 ad-hoc signing verification.

## Security

Main and engine hosts never receive a database handle. Schema checks precede writes; backups are validated before pruning, and a failure never automatically restores over live data. Logs carry metadata rather than rows or user content. Egress remains denied throughout all storage checks.

## Pros and Cons of the Options

- better-sqlite3 provides the approved synchronous adapter and transaction tooling but adds native unpacking and platform verification obligations.
- node:sqlite removes a separately packaged driver dependency but remains the research-documented release-candidate alternative and must prove the same durability checks before any switch.
- Kysely offers typed query construction but adds a layer that does not solve the migration guards; it is unnecessary for the Phase 1 kernel.

## More Information

- [Walking skeleton data layer](../../.planning/phases/01-secure-durable-foundation-packaging-gate/SKELETON.md).
- [Context D-13 through D-16](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-CONTEXT.md).
- [Existing research R1/R10 and Pattern 5](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-RESEARCH.md).
- [Process boundaries](0001-process-topology-and-ipc.md) and [packaging policy](0003-packaging-fuses-and-signing.md).

Revisit the driver only on the policy's documented target-platform failure and same-check alternative success, retaining the `Db` interface and migration invariants.
