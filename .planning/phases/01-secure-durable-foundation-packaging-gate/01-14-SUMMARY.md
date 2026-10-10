---
phase: 01-secure-durable-foundation-packaging-gate
plan: "14"
subsystem: supervision
status: complete
completed: 2026-10-10
platform-verification:
  windows: verified locally with real Electron processes
  macos: unverified
requires: [01-13]
provides:
  - Supervised engine and Core restart, watchdog, bounded retries and requested shutdown
  - Replacement renderer transport without window reload or committed-output re-execution
  - Honest Core-failed state with guarded application relaunch
requirements-completed: [PLAT-04]
actuals:
  tasks: 3
  implementation_commits: 3
tech-stack:
  added: []
---

# Plan 01-14: crash recovery verified on Windows

This enables interrupted document processing and future learning jobs to preserve verified outputs while the learner's window remains usable. It delivers recovery infrastructure, not curriculum, lessons or learning outcomes.

## Delivered

- Task 1 (`30a0827`): the Electron adapter uses the existing domain supervisor; Core receives validated exit/circuit metadata. A real sample-host kill retries only the interrupted chunk and leaves the window, Main and Core running.
- Task 2 (`752ec93`): real kill/exit0/exit1/abort/spin/OOM faults; watchdog; bounded task quarantine; invalid-message containment; requested shutdown; persistent metadata-only evidence; one System check probe retry and the required Persian restart copy. Plain-Node fixtures separately exercise the core Gherkin policy; they are not described as Electron evidence.
- Task 3 (`382c80d`): the same supervisor handles Core. Core death requests all old hosts to stop, rejects pending path acknowledgements, reinitializes Core after backoff and replaces the renderer port. Preload fences old transports, rejects pending calls with UNAVAILABLE and preserves subscriptions. The same window completes real database/LLM/OCR/TTS checks and resumes a job without re-executing committed chunks; every final CAS output hash is verified.
- Three boot failures within 60000 ms stop retries. Home shows the exact Core-failed Persian title/body, logs path in technical details and the sole relaunch button. Strict, origin-checked `shell.relaunch` is unavailable outside this state. Its real Main handler's relaunch/exit calls were observed using an E2E stub that avoids creating an unmanaged second app; an actual relaunch cycle is not claimed.
- A regression test first failed because an exit observer could cancel retries before the restart timer was installed. Installing the timer before notifying observers makes cancellation effective. The fake-clock test and domain acceptance now pass.

Existing policy remains: backoff base 250 ms, cap 15000 ms, healthy reset 60000 ms, circuit five unrequested exits within 120000 ms, production watchdog 5000 ms and three attempts per task. The heartbeat arithmetic, responsiveness thresholds/minimum samples and concurrent engine checks are unchanged.

## Actual Windows evidence

Saved real Electron process IDs, timestamps and exit records: [host faults](evidence/01-14-host-crashes-win32-x64.json) and [Core/job recovery](evidence/01-14-core-recovery-win32-x64.json).

| Fault | Exit code | Crash-to-restart delay |
|-------|-----------|------------------------|
| kill | 1 | 261 ms |
| exit0 | 0 | 260 ms |
| exit1 | 1 | 261 ms |
| abort | 134 | 251 ms |
| spin, killed by watchdog | 1 | 260 ms |
| bounded V8 OOM | 0 | 251 ms |

Core SIGKILL exited 1 and restarted after 256 ms. The window's process and DOM token remained unchanged; only the in-flight task reached attempt 2. All twelve executions have valid CAS hashes; previously committed task/execution records are unchanged.

The fault matrix alone uses a 64 MB heap, a 2000 ms watchdog and a 3000 ms probe delay. Initially those fixture settings applied to every Plan 01-14 scenario, and the post-Core-recovery TTS probe was twice killed by that artificially shortened watchdog. Actual row/log evidence showed HostExited and two watchdog kills. `8e1d9b5` identifies the six deliberate fault cases; the fixture is now scoped to them. Core recovery runs with the unchanged production watchdog. No native thread or scheduling flags were changed.

## Verification and limits

| Check | Actual result |
|-------|---------------|
| Required domain acceptance | 157 passing tests |
| Focused supervisor/client/shell security regression | 105 passing tests |
| Final shell dispatch subset | 8 passing tests |
| Required types | Pass, both TypeScript projects |
| Final `@plan-01-14` plus isolated Reader evidence E2E | 15 passed: all 14 Plan 01-14 scenarios, none skipped or failed; one source-evidence scenario |
| Broader Windows unit checkpoint | 666 passed, 42 files |
| Broader Windows E2E checkpoint | 68 passed, 4 failed, 8 skipped; all 14 Plan 01-14 scenarios passed. Skips belong to unimplemented Plan 01-15. No clean full-suite rerun claimed. |
| Formatting, lint, dependency boundaries | Pass; 205 modules / 701 dependencies; focused lint/types repeated after Reader accessibility correction |
| Production build and test-hook scanner | Pass; zero markers, including Core boot-failure control |
| Features before code | `--allow-unbound`: zero failures; future egress coverage remains unbound |

The broader failures are retained: clipboard copy returned empty despite a valid focused selection/copy event; native default window dimensions exceeded a 4-pixel tolerance by measuring a 6-pixel difference; two existing running-chunk shape assertions measured 1.6px against their specified 2px. The Reader clipboard and window-size failures reproduced in focused checks. Assertions remain enabled and unchanged. No unproven product correction is retained for these failures. An independent Reader evidence scenario verifies raw excerpts/provenance without bypassing or replacing the failing clipboard scenario. See STATE.md for product status.

No macOS execution, new installed-package verification or Tier B clean-machine evidence is claimed. The observed pre-push CI snapshot was [38029631841](https://github.com/qmahmoudi74/danesh/actions/runs/38029631841) at `21d7bdf`: Windows in progress; macOS failed smoke (idle p95 151 ms, loaded p95 139 ms, zero renderer long tasks). This snapshot does not establish the present Windows conclusion. macOS investigation remains owner-deferred; the original 50 ms gate remains.

## Next dependency

Plan 01-14 is complete with Windows-only acceptance, and PLAT-04 is locally verified. Phase 1 becomes 13/16 plans, with 0/12 phases complete. Plan 01-10 stays partial. Plan 01-15 explicitly depends on 01-09, **01-10** and 01-14; it cannot start while 01-10 is open. Plan 01-16 and separate Tier B requirements also remain open. No subsequent plan was begun and no learning capability was falsely marked delivered.
