---
phase: 01-secure-durable-foundation-packaging-gate
plan: "12"
subsystem: storage
status: complete
completed: 2026-10-10
platform-verification:
  windows: verified locally
  macos: unverified
requires: [01-11]
provides:
  - Persistent SHA-256 addressed blobs with bounded streaming writes and atomic non-overwriting publication
  - Integrity-verified reads and deduplication, interruption cleanup and bounded Windows publication retries
  - Core startup sweep before database migrations and a real cas-storage System Check
affects: [01-13, pdf-import]
actuals:
  tokens: 10070
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [atomic hard-link publication, startup-only CAS partial cleanup]
requirements-completed: [PLAT-08]
key-files:
  created:
    - packages/storage/src/cas.ts
    - apps/core/src/checks/cas-storage.check.ts
    - apps/core/test/cas.test.ts
    - packages/storage/test/cas.test.ts
    - packages/storage/test/content-addressed-store.feature.test.ts
    - packages/storage/test/cas-fixture.ts
    - packages/storage/test/fixtures/kill-during-cas-write.ts
  modified:
    - apps/core/src/boot.ts
    - apps/core/src/index.ts
    - apps/core/src/checks/registry.ts
    - apps/core/src/system-check.ts
    - features/steps/system-check.steps.ts
key-decisions:
  - Owner-approved Windows-first development changes sequencing only; cross-platform and release gates remain intact.
  - Unsupported hard links fail closed because a plain rename fallback can overwrite a concurrently published valid blob.
  - Sweep only recognized CAS partials because tmp also contains verified database backup work.
coverage:
  - id: CAS-WINDOWS
    description: Bounded streaming, verified content identity, deduplication and interrupted-write recovery on Windows
    requirement: PLAT-08
    verification:
      - kind: unit
        ref: packages/storage/test/cas.test.ts
        status: pass
      - kind: integration
        ref: packages/storage/test/content-addressed-store.feature.test.ts
        status: pass
    human_judgment: false
  - id: CORE-CAS-WINDOWS
    description: Real Core CAS startup and System Check in the packaged Windows application
    requirement: PLAT-08
    verification:
      - kind: e2e
        ref: features/ui/system-check.feature#Core verifies a persistent content-addressed blob
        status: pass
      - kind: integration
        ref: evidence/01-12-packaged-smoke-win32-x64.json
        status: pass
    human_judgment: false
---

# Plan 01-12: persistent CAS verified on Windows

Implementation is complete and locally verified on Windows x64. macOS execution is unverified. The owner
explicitly authorized this development sequence while Plan 01-10 remains partially verified; no phase or
cross-platform/release gate is closed by this summary.

## Implemented behavior

`createCas` provides `put`, `get`, `has`, `pathFor` and `sweepTmp`. Keys must be exactly 64 lowercase hex
characters, including rejection of a trailing newline. Paths use `blobs/sha256/<first-two-hex>/<hash>`.
Writes copy at most 64 KiB at a time, handle partial filesystem writes, hash incrementally, sync and close the
temporary file, then publish with an atomic hard link. Five attempts with 50/100/200/400 ms backoff bound
EPERM/EBUSY/EACCES retries. Empty input is a valid blob. Errors and cooperative cancellation clean up owned
partials; a real killed writer leaves a partial that startup removes before another write.

Concurrent identical writers produce one final file. Every duplicate publication streams and verifies the
existing target without rewriting its inode or mtime. Every `get` verifies the full SHA-256 before returning
bytes; corruption raises `CasIntegrityError` and remains preserved on disk. Write and duplicate-verification
memory is bounded by chunks; the approved `get` API returns a complete verified Buffer.

Core awaits its CAS startup sweep before opening/migrating the database and announcing readiness. Startup
failure leaves the library failed and write guarded. System Check uses that instance, writes and reads the fixed
19-byte payload, and reports its SHA-256, size, duplicate flag and shard in position three. It refuses writes for
failed, newer-schema or recovery libraries. The renderer/preload API, migrations and engine settings are unchanged.

## Local commits and test-first evidence

| Commit | Content |
| --- | --- |
| `8fdc9a9` | Owner-approved Windows-first sequencing exception |
| `254d07f` | CAS System Check persistence acceptance scenario, before its implementation |
| `d5095d0` | Both plan tasks: CAS, Core lifecycle/check, unit/Gherkin/E2E bindings and real killed-writer fixture |

The Core storage feature was already committed in `f44c966`. Storage unit tests were written before creating
the CAS module. The recorded initial RED run failed collection because that module did not exist; individual
behavioral RED failures were not separately recorded. Green targeted tests, full regression and feature bindings
then passed. The post-implementation features-first history check reports zero failures. Actual token estimate
above is implementation-diff characters divided by four, not a harness token count. Total duration was not measured.

## Verification actually run

Local environment: Windows 11 x64, Node 24 and Electron 44. No local macOS execution occurred.

| Check | Actual result |
| --- | --- |
| `pnpm check:format`, `pnpm lint`, `pnpm typecheck` | Exit 0; existing Biome informational suggestions remain |
| `pnpm depcruise` | Exit 0; 158 modules, 510 dependencies, no violations |
| `pnpm licenses:scan` | Exit 0; 748 entries, zero failures; existing redistribution/model review warnings remain |
| `pnpm check:ci`, `pnpm check:adr` | Exit 0, zero failures |
| `pnpm test` | 33 files, 423 tests passed; native probe worker crash did not reproduce |
| `pnpm vitest run --project storage` | Five files, 152 tests passed, including backup/migration regression and every CAS Gherkin binding |
| Targeted CAS unit/Gherkin run | Two files, 56 tests passed |
| `pnpm test:e2e` | 39 passed, 31 intentional skips for later plans and the packaged-only fuse scenario |
| Packaged test-build E2E, `@plan-01-08\|@plan-01-12` | Two passed: real CAS row/report/blob and differing test-build fuses; hook scanner positive control passed |
| `pnpm package` | Exit 0; production NSIS build, hook scanner and 85-entry manifest passed |
| `pnpm smoke:packaged --persian-paths --out .../01-12-packaged-smoke-win32-x64.json` | Exit 0; all eight implemented checks passed, including CAS, database, three engines, responsiveness and fuses |
| Evidence validator requiring Windows, Persian path and all eight checks | Exit 0 |
| `pnpm check:features --allow-unbound` | Exit 0 after the implementation commit; later unimplemented plans retain their existing CI policy |

Raw outputs are retained in `evidence/01-12-final-verification.txt`. Production smoke evidence is
`evidence/01-12-packaged-smoke-win32-x64.json`, recorded at `2026-10-10T02:30:23.060Z`. The CAS SHA-256 is
`7b6ce09b1db6c890136d657a75a54a3cc8aac797cb90979af7a07234deff3dbb`, size 19, shard `7b`, first write.
Idle lateness: 40 samples, p95/max 13/13 ms. Loaded: 119 samples, p95/max 13/13 ms. Original thresholds and
concurrent engine checks are intact. External fuse read-back, ASAR contents, manifest, path bound and production
hook exclusion passed. This local smoke used the unpacked production app; NSIS was built but not freshly installed.
The two packaged E2E tests used DaneshTest, not the production binary. No signing or Tier B qualification is claimed.

## Safety corrections to the draft plan

- Omitted plain-rename fallback: a target created after an existence check can be overwritten by rename, violating
  safe deduplication. Atomic hard links preserve the target; ENOTSUP fails closed, with coverage. This follows
  the already verified backup publication pattern. POSIX directory sync is implemented but not executed here;
  Windows skips directory fsync as recorded in the research.
- Sweep recognized `cas-<random>.<pid>.part` files only, before writers. A blanket sweep would delete database
  backup temporary data. Real killed-writer tests and Core startup tests prove CAS cleanup preserves backup partials.
- Stored this plan's smoke in a separate evidence file, preserving historical reports rather than overwriting them.

## CI and next work

Latest observed run: https://github.com/qmahmoudi74/danesh/actions/runs/38016154277 at
`c36666b415c139c9184805291aa8e2282ac3ea29`, before CAS. Windows passed 363 unit tests, installed Persian-path smoke,
38 full E2E tests and one packaged E2E test. Its authenticated artifact ZIP hash matched GitHub metadata, and the
fresh smoke passed validation; see `evidence/tier-a-ci/38016154277/RUN.md`. macOS failed at smoke and skipped E2E.
No macOS investigation was performed. The earlier Windows native worker crash remains tracked; a green rerun is
not proof of a fix. Previous failures, platform support, policy and cross-platform CI are preserved.

Plan 01-10 stays partial; Tier B remains separate and outstanding. Plan 01-11 stays complete. Plan 01-12 counts
as implementation complete with Windows-only verification: 11/16 plans, 0/12 phases. Plan 01-13 is not started:
the remaining execution budget does not support fully implementing and verifying its durable job state machines,
SQLite transitions, CAS commits and real Core crash/restart tests. Resume with the existing approved 01-13 plan;
that kernel is the next prerequisite toward PDF Import. Plan 01-14 was not started. No push or publication occurred.

## Self-check

Required artifacts exist; implementation is committed; Windows unit, Gherkin, E2E, package and smoke gates passed.
macOS and clean-machine verification are explicitly outstanding.
