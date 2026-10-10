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

The last run's annotation reports a responsiveness-policy failure, not an engine-loading failure. Its exact
annotation and URL are retained in `evidence/tier-a-ci/38010302448/RUN.md`. The REST API was rate-limited and `gh`
is unavailable; public HTML provided the diagnostic detail. The latest Windows job conclusion was not collected.

## Local follow-up

The concurrent probes now bound CPU evaluation threads: two for the LLM, one intra-op and one inter-op thread for
ONNX Runtime, with sequential execution and the same limits on its Unicode-path buffer fallback. CPU contention
is an inference, not a proven explanation of the macOS failure. PK5 thresholds and concurrency are unchanged.

This follow-up runs through the Plan 01-11 local verification log. Windows packaged smoke passed with Persian paths,
schema version 2 and all engine checks; renderer heartbeat p95 was 13 ms and maximum 14 ms. The report is copied to
`evidence/01-11-packaged-smoke-win32-x64.json` so the earlier NSIS-install evidence remains intact. The copied report
passed the evidence validator with the Persian-path, Windows and database/engine/responsiveness requirements.

## Remaining work

- A user-triggered CI rerun of the new commits on Windows and macOS, followed by artifact download and validation.
- Tier B clean-machine verification on both target operating systems remains separate from hosted CI.

REL-01 remains partially verified. This is a draft summary, not completion of Plan 01-10 or a macOS verification
claim. The already-started Plan 01-11 local slice was resumed and finished; no new downstream plan was started.
