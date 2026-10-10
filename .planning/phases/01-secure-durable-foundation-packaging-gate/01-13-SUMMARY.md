---
phase: 01-secure-durable-foundation-packaging-gate
plan: "13"
subsystem: jobs
status: complete
completed: 2026-10-10
platform-verification:
  windows: verified locally, including packaged acceptance and installed smoke
  macos: unverified
requires: [01-12]
provides:
  - Transactional jobs, idempotent ordered tasks, bounded retries and quarantine in migration 0005
  - Boot recovery and automatic sample-job resume without redoing committed work
  - Bundled sample processed in a utility host, verified CAS outputs and honest Persian progress
affects: [01-14, pdf-import]
actuals:
  tokens: 26153
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [pure state machines, CAS before transactional commit, boot-id recovery]
requirements-completed: [JOB-03]
key-files:
  created:
    - packages/storage/migrations/0005_jobs.sql
    - packages/storage/src/jobs-repo.ts
    - packages/domain/src/jobs/fsm.ts
    - packages/domain/src/jobs/recovery.ts
    - apps/core/src/sample-job.ts
    - apps/renderer/src/sample-job/SampleJobCard.tsx
    - features/steps/sample-job.steps.ts
  modified:
    - apps/core/src/boot.ts
    - apps/core/src/engine-client.ts
    - apps/core/src/index.ts
    - packages/engine-api/src/sample-host.ts
    - packages/contracts/src/rpc.ts
    - apps/renderer/src/screens/SystemCheck.tsx
    - apps/renderer/src/screens/Home.tsx
coverage:
  - id: DURABLE-KERNEL
    description: Ordered idempotent tasks, atomic execution records and three real SIGKILL crash points
    requirement: JOB-03
    verification:
      - {kind: unit, ref: packages/domain/test/fsm.test.ts, status: pass}
      - {kind: integration, ref: packages/storage/test/durable-jobs.feature.test.ts, status: pass}
    human_judgment: false
  - id: SAMPLE-JOB-WINDOWS
    description: Real host/CAS commits, Main-kill relaunch, preserved attempts and targeted retry
    requirement: JOB-03
    verification:
      - {kind: e2e, ref: features/ui/sample-job.feature, status: pass}
      - {kind: integration, ref: evidence/01-13-packaged-smoke-win32-x64.json, status: pass}
    human_judgment: false
---

# Plan 01-13: durable sample jobs verified on Windows

All three tasks and every Plan 01-13 acceptance scenario passed locally on Windows.
The owner authorized Windows-first development and pushing verified increments. Plan 01-10 remains partial;
macOS execution and Tier B clean-machine requirements remain outstanding. Phase 1 is not complete.

The forward-only `0005_jobs.sql` migration preserves existing 0003/0004 migrations. Strict job/task/exec_log
tables enforce idempotent fan-out and a single successful execution per task. Claims retain stable unit order,
attempt limits quarantine persistent failures, and retry grants only failed/quarantined work a fresh three-attempt
budget. Progress counts committed rows. Pure FSM tests cover every state/event pair, including illegal transitions.

Core sweeps CAS temporary writes, opens/migrates the library, applies boot-id recovery, then automatically resumes
queued/running sample jobs. The bundled original Persian/English text is the only input; start/retry RPCs accept no
user path. A utility host returns index, hash and length. Core validates the schema and all three values before CAS
publication, then atomically records execution and flips the task to done. A rollback regression proves both DB
changes roll back together. Invalid host output never receives a committed output reference.

Real plain-Node runners are killed after claim, blob publication and commit, and through two consecutive restarts.
Every committed output remains verified, order remains stable, and no done task is re-executed. The real Electron
Main process is killed mid-job and relaunched on the same library: completed attempts stay 1, the interrupted
attempt becomes 2, and automatic-resume copy reports the actual preserved count.

The card implements idle/running/resumed/completed/failed states, Persian counts, committed progress value text,
N=1/12/64 wrapping at 720px, shape and hidden-text state cues, a focusable 320px technical region, LTR identifiers
and UTC timestamps, start-again record preservation and targeted retry. Home exposes activity only while running.
Lifecycle announcements share System Check's existing status region and never announce progress ticks.

**UI-SPEC extension:** quarantined cells use the failure color, an x glyph and hidden text `بخش {i}: ناموفق`.
Their detail-table state is also `ناموفق`. This extension is explicitly prescribed by Task 3.

## Commits and corrections

- `f77d1a0`: transactional kernel, pure FSM/recovery, migration and real-crash tests.
- `05809fb`: utility-host/Core/UI integration and all UI bindings; delayed requested host exits cannot reject the
  next host generation. The focused regression was observed failing before the correction and passing afterward.
- `0d6872d`: packaged acceptance additionally verifies keyboard focus, detail-region height and LTR metadata.

Acceptance features were already committed in `f44c966`, before implementation. Kernel/service tests were written
before their new modules; initial RED collection failures and the subsequent passing runs were observed. The
approved plans prescribe the new pure `packages/domain` folder; no dependency or framework was added. Actual token
figure is realized diff characters divided by four, not a harness count. Duration was not measured.

The first kill/relaunch UI failure was a Windows Playwright launcher-wrapper mistake. Main's PID now comes from
Electron itself; the test kills Main and checks its recorded children exit before relaunch. No production lifecycle
fix was inferred from that harness failure. The integration run exposed a missing dark-theme token and duplicate
status region; both were corrected and their affected tests passed.

## Verification

See [local verification](evidence/01-13-local-verification.md) for commands and initial/corrective results.
The mandated domain/storage run passed 273 tests; this includes nine separate pure Plan 01-14 tests.
All nine Plan 01-13 UI scenarios passed in both development and packaged builds, with none skipped.
The packaged fuse positive control also passed: 10 packaged scenarios total. Production test-hook scan found zero
markers; the test-build positive control found 18. Production NSIS packaging and installed Persian-path smoke
passed; the test install was successfully uninstalled. Smoke evidence validated all eight applicable checks.
Idle timer-lateness p95 was 12ms (40 samples); loaded p95 was 13ms (119 samples), with no recorded renderer long tasks.
These are local Windows measurements, not macOS or hosted-runner evidence.

Broad units/E2E were each run once at the integration checkpoint. Failures were corrected and verified with affected
subsets, following the owner's efficient-testing instruction; no clean full-suite rerun is claimed. Required plan
acceptance, static/security gates, production package, installed smoke and packaged acceptance are passing.

Latest CI observed before pushing these increments: run 38026098213 failed the format step on both platforms.
The formatting correction is `55626a6`; new hosted verification must be evaluated separately. Existing macOS
responsiveness diagnostics and thresholds remain unchanged and investigation stays deferred.

Plan count becomes 12/16, with 0/12 phases complete. Plan 01-14 depends on this plan and has a verified pure-policy
checkpoint; its live Electron integration and remaining acceptance are not complete. See its canonical summary.
