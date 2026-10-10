---
phase: 01-secure-durable-foundation-packaging-gate
plan: "11"
subsystem: storage
status: complete
completed: 2026-10-10
requires: [01-10]
provides:
  - Forward-only, checksum-guarded schema upgrades and refusal of newer libraries before a writable open
  - Verified pre-migration backups, keep-last-three retention, interruption safety and storage-layer restore proof
  - Core library status, read-only write guard and Persian recovery states on Home and System check
requirements-completed: [PLAT-06, PLAT-07]
key-files:
  created:
    - packages/storage/src/migrate.ts
    - packages/storage/src/migrations-index.ts
    - packages/storage/src/backup.ts
    - packages/storage/src/library.ts
    - packages/storage/migrations/0002_library_meta.sql
    - packages/storage/test/migrate.test.ts
    - packages/storage/test/backup.test.ts
    - packages/storage/test/storage-migrations.feature.test.ts
    - packages/storage/test/fixtures/kill-during-backup.ts
    - apps/core/src/boot.ts
  modified:
    - packages/storage/src/db.ts
    - packages/contracts/src/rpc.ts
    - packages/contracts/src/test-rpc.ts
    - apps/core/src/index.ts
    - apps/core/src/checks/database.check.ts
    - apps/core/src/checks/registry.ts
    - apps/core/src/system-check.ts
    - apps/core/test/system-check.test.ts
    - apps/renderer/src/screens/Home.tsx
    - apps/renderer/src/components/CheckRow.tsx
    - apps/renderer/src/lib/copy.ts
    - features/steps/startup-states.steps.ts
    - features/steps/app-shell.steps.ts
    - features/steps/fixtures.ts
---

# Plan 01-11 completed locally on Windows

The unfinished storage and recovery implementation from the preceding session is now verified and committed.
Libraries probe read-only before enabling WAL or migrating; newer versions and changed applied SQL are refused
without changing database bytes. Upgrades take one verified backup, apply numbered SQL in separate transactions
with foreign-key checks, and reopen read-only after a failed migration. Home and System check keep the recovery
message separate from paths, versions and migration ids, and System check stays reachable.

## Commits

| Commit | Content |
| --- | --- |
| 2d77a25 | Migration planning/probing, backups and retention, library identity, Core state and write guard, UI and acceptance bindings |
| ecee01d | Separate Plan 01-10 follow-up: bound concurrent packaging-probe CPU threads |

Acceptance features were already committed before implementation. The post-commit features-first check passed with
`--allow-unbound`, the existing CI policy while later plans remain unimplemented.

## D-14 checkpoint

Selected option: **adopt-d14**. The existing implementation was resumed using the plan's `auto_select="adopt-d14"`
and configured `yolo` mode. No separate human confirmation was collected in this session. The history table,
LF-normalized SHA-256 checksums, exact integer versions, backup naming and retention follow D-14.

## Verification actually run

Environment: Windows 11 Pro Insider Preview, build 10.0.29683, x64. No macOS execution occurred locally.

| Command | Result |
| --- | --- |
| `pnpm check:format` | Exit 0; existing informational template-literal suggestions remain |
| `pnpm lint` | Exit 0 |
| `pnpm typecheck` | Exit 0 |
| `pnpm depcruise` | Exit 0; 146 modules, no dependency violations |
| `pnpm test` | 27 files, 353 tests passed |
| `pnpm vitest run --project storage` | 3 files, 96 tests passed; all storage Gherkin scenarios bound and passing |
| `pnpm test:e2e` | 36 passed, 0 failed, 31 intentional skips for later plans and the packaged-only fuse scenario |
| `DANESH_E2E_GREP=@plan-01-11 pnpm test:e2e` | 4 passed, none skipped; all four also passed in the final full run |
| `pnpm package` | Exit 0; Windows NSIS build and production test-hook scanner passed |
| `pnpm smoke:packaged --persian-paths` | Exit 0; all reported checks passed; schema version 2; heartbeat p95 13 ms, maximum 14 ms |
| Evidence validator on the copied smoke report | Passed Persian-path, Windows and database/engine/responsiveness requirements |
| `pnpm check:ci`, `pnpm check:adr` | Zero findings/failures |
| `pnpm check:features --allow-unbound` | Zero failures, after implementation commits |

Raw final verification output: `evidence/01-11-final-verification.txt`. The final rerun section includes every
required gate, packaging and full E2E against the final implementation. Packaged report:
`evidence/01-11-packaged-smoke-win32-x64.json`. Earlier NSIS-install evidence was preserved at its original path.
The final smoke run used the unpacked production app with a Persian library path; it did not install NSIS anew.

## Findings and deviations

- Regression tests first reproduced a writable-open checksum refusal that changed the SQLite file hash, and a
  missed newer history when `user_version` was zero. Both now refuse during read-only preflight. A real WAL test
  also proves the probe reads the committed version while the raw header is still stale.
- Backup publication uses an atomic hard link followed by removing the temporary name. The drafted rename could
  overwrite a target created after its existence check; the collision test reproduced that overwrite before the
  fix. Publication now fails without altering that target. Unsupported filesystems fail closed. Naming, verification
  and retention are unchanged; this publication mechanism has only been executed on Windows here.
- Tests cover rejection of an invalid copy without pruning earlier backups, genuinely frozen same-millisecond
  naming, restore to the prior schema, a real killed backup child, preservation of the live database hash, and a
  fresh verified backup before the retry. Only recognized backup partial filenames are swept from `tmp/`.
- A failed fresh installation with no verified backup reports `failed`; it does not display the recovery sentence
  claiming a backup exists. Existing-library migration failures still reopen read-only with the verified backup.
- The test-only failing migration uses the next contiguous id (`0003` in this build), instead of the plan's `9999`,
  so it exercises SQL rollback without violating the migration-numbering guard.
- Initial UI verification found an ambiguous launch step and a quoted-path binding that skipped the persistence
  scenario. Both were corrected. Full regression then found the older shell test's hardcoded schema version 1 and
  single history row; it now checks the shipped migrations and their checksums. Final verification passed.
- Test cleanup now closes the failed-migration handle and reports cleanup failures instead of silently swallowing
  them. The new runtime APIs retain the closed, schema-validated preload surface and production hook exclusions.

## Remaining phase work

Plan 01-10 is still partially verified. Latest run 38015174157 at `1a1c397` failed both jobs: macOS unit/package
passed, but smoke recorded idle p95 120 ms and loaded p95 143 ms; Windows unit tests lost the native probe worker
with exit 3221226356. Both platforms skipped E2E. Authenticated access downloaded both artifacts; the exact macOS
report is structurally valid and correctly rejected by the pass gate. No specific runtime cause was proved and
no speculative correction was made. See `01-10-SUMMARY.draft.md` and `evidence/tier-a-ci/38015174157/RUN.md`.
Plan 01-11 remains complete locally, with macOS E2E verification pending. Green cross-platform CI and current-run
artifacts validated as passing are still necessary. Tier B remains separate; Plan 01-12 remains gated.
No new downstream plan, push, publication or deployment occurred.

## Self-Check: PASSED

Created files exist, implementation is committed, required local gates and all Plan 01-11 acceptance scenarios
passed. macOS and clean-machine verification remain explicit phase-level limits.
