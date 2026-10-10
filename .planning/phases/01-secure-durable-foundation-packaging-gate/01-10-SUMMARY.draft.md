---
phase: 01-secure-durable-foundation-packaging-gate
plan: "10"
status: partially-verified
updated: 2026-10-10
requirements-completed: []
---

# Plan 01-10: CI evidence still pending

Tasks 1 and 2 were completed in earlier sessions. The recorded Windows local parity run passed all 13 steps
(`evidence/01-10-ci-local.txt`). Workflow parity and evidence-validator tools exist, together with the two Tier B
runbooks. This session reran `pnpm check:ci` and `pnpm check:adr`, both with zero findings.

The original push checkpoint has been passed: the current branch's HEAD was already on its remote when this session
started, and multiple public GitHub CI runs exist. The remaining gate is a green run on both hosted operating
systems and downloaded, validated artifacts. No push was performed in this session.

## Observed GitHub results

| Run | Commit | Observation | Evidence scope |
| --- | --- | --- | --- |
| 38008716935 | 0060826 | Windows license query could not spawn pnpm; macOS packaged smoke failed | Previous-session condensed REST observations, no artifacts |
| 38008995205 | 509cf60 | Windows passed; macOS packaged smoke failed | Previous-session condensed REST observations, no artifacts |
| 38010179906 | 32ea599 | Run failed; per-job details unavailable | Previous-session condensed REST observations, no artifacts |
| 38010302448 | 9746e61 | macOS failed `ui-responsive`: 407 samples, p95 141 ms, max 324 ms | Public run/job HTML observed this session; no artifacts |
| 38011901925 | 34e0ed7 | Both failed: Windows two 5000 ms unit timeouts; macOS 220 samples, p50 56 ms, p95 139 ms, max 156 ms | Public annotations and REST metadata; downloads refused without authentication |

The latest run failed Windows before packaging and macOS at packaged smoke. Exact public annotations are retained
in `evidence/tier-a-ci/38011901925/public-annotations.txt`, with diagnosis and limitations in its `RUN.md`. REST
metadata was available this session; log downloads returned HTTP 403 and both artifact archives HTTP 401. No
authenticated connector was available, and complete CI artifacts have not been downloaded or validated.

## Local follow-up

The previous session bounded CPU evaluation threads: two for the LLM, one intra-op and one inter-op thread for
ONNX Runtime, with sequential execution and the same limits on its Unicode-path buffer fallback. CPU contention
is an inference, not a proven explanation of the macOS failure. PK5 thresholds and concurrency are unchanged.

This follow-up runs through the Plan 01-11 local verification log. Windows packaged smoke passed with Persian paths,
schema version 2 and all engine checks; renderer heartbeat p95 was 13 ms and maximum 14 ms. The report is copied to
`evidence/01-11-packaged-smoke-win32-x64.json` so the earlier NSIS-install evidence remains intact. The copied report
passed the evidence validator with the Persian-path, Windows and database/engine/responsiveness requirements.

The current follow-up preserves those caps, all concurrent engine probes, the original heartbeat samples and PK5
policy. Valid headless smoke startup now adds Electron's documented `disable-renderer-backgrounding` switch before
readiness: disabled timer throttling alone did not explicitly preserve the invisible renderer's process priority.
The real Electron regression failed on the original code (foreground scheduling false). This addresses a confirmed
configuration gap; its contribution to the macOS delay is inferred and remains unverified on that OS.

Both Windows failures were synchronous real-file callbacks, with no competing connection to the fresh database.
Before changes, all 353 unit tests passed locally in 9.50 seconds versus CI's 44.32 seconds. Vitest worker concurrency
is now bounded at two to reduce CPU/disk contention. The logging test uses 40 records instead of 200, still rotating
beyond retention multiple times, and additionally verifies the whole retained sequence is ordered and contiguous.
Production logger behavior, SQLite durability and test timeouts are unchanged. Targeted logging/storage passed
100 tests; full unit verification under concurrent Electron/static-check load passed 353 tests in 22.55 seconds.
Rotation took 49 ms and fresh-library opening 27 ms in that full run. Hosted-runner timing remains unverified.

Current Windows production package and unpacked Persian-path smoke passed with all seven checks, 120 heartbeat
samples, p95 13 ms and maximum 14 ms. The new report `evidence/01-10-ci-fixes-smoke-win32-x64.json` passed the
evidence validator; historical NSIS evidence was preserved. NSIS was built but not installed in this follow-up.
Final command output and the regression reproduction are recorded in `evidence/01-10-ci-fixes-verification.txt`.
Final Electron E2E passed 37 scenarios with 31 intentional skips (30 future-plan scenarios and one packaged-test-only
fuse scenario), including the hidden smoke regression and all Plan 01-11 startup scenarios.
One E2E attempt was invalidated by overlapping packaging, which replaced its test build; it was interrupted and
rerun after packaging. Only the final independent build/run is used as E2E evidence.

## Remaining work

- A user-triggered CI rerun of the new commits on Windows and macOS, followed by artifact download and validation.
- Plan 01-12 CAS is ready in its existing plan and acceptance scenarios, but remains gated; do not start 01-13.
- Tier B clean-machine verification on both target operating systems remains separate from hosted CI.

REL-01 remains partially verified. This is a draft summary, not completion of Plan 01-10 or a macOS verification
claim. The already-started Plan 01-11 local slice was resumed and finished; no new downstream plan was started.
