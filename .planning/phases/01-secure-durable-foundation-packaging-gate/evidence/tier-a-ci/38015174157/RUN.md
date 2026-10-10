# Diagnostic CI run 38015174157

- Run: https://github.com/qmahmoudi74/danesh/actions/runs/38015174157
- Commit: `1a1c397b978e540a7494bf65290df52b89728835`
- Final status observed on 2026-10-10: completed, failure on both jobs.
- Windows: https://github.com/qmahmoudi74/danesh/actions/runs/38015174157/job/114103733269
- macOS: https://github.com/qmahmoudi74/danesh/actions/runs/38015174157/job/114103733368

## Actual artifact retrieval and provenance

The authenticated GitHub connector downloaded both complete ZIP archives and both job logs. This access works;
earlier unauthenticated CLI/REST 401 responses do not mean artifacts are inaccessible. ZIP archives remain in the
local temporary directory; their entry inventories and hashes are retained here. Signed temporary download URLs
and credentials are excluded from evidence.

| Artifact | ID | ZIP bytes | Verified ZIP SHA-256 |
| --- | --- | --- | --- |
| evidence-macos-latest | 11656045642 | 3423869 | c115a7e27d1038f17c44c5b4410aa1184173ef8139c9b7ebac4dd7ea923c8b6d |
| evidence-windows-latest | 11654634799 | 3418721 | 31bc6cd108f4123a6756c3d82a11b5ac38072076a0cac0aaa99b4628fd4134ee |

Both hashes match GitHub artifact metadata. `observed-metadata.json` records artifact metadata and final job/step
results. `macos/smoke-darwin-arm64.json` is the exact current-run report extracted from the macOS ZIP entry
`.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-a-local/smoke-darwin-arm64.json`, recorded
at 2026-10-10T02:00:56.389Z. Historical reports also uploaded from the repository are not current-run evidence.
The Windows artifact contains historical reports but no fresh smoke result: its unit gate failed first.

## Platform outcomes

macOS 26.6.2, build 25G83, arm64: static/security/license gates passed; unit tests passed (362 tests, one existing
platform-specific license test skipped); packaging passed. Packaged smoke failed only `ui-responsive`. Application
launch, database, all three engines, fuses and codesign passed. External smoke checks passed Persian path, manifest
(77 entries), ASAR contents, path length, production hook exclusion, fuse read-back and strict codesign. E2E and
packaged E2E were skipped after smoke. Signing is ad hoc; notarization was skipped, not claimed verified.

Windows Server 2025, build 26100, x64: static/security/license gates passed; unit gate failed with a native worker
exit while running `packages/engines/test/probes.test.ts`. The exit code was 3221226356 (`0xC0000374`); 357 tests
passed and the six tests in that file did not produce passing results. No faulting native module or native stack
was supplied. Packaging, installed smoke, E2E and packaged E2E were skipped. This is a new failure, not the earlier
logging/storage 5000 ms timeout. See `windows-unit-failure.txt`.

## Timer evidence

These are integer lateness samples from the unchanged consecutive-tick 50 ms timer. The separate two-second
pre-inference baseline is a startup observation with only 22 samples, not a 100-sample acceptance run or a
steady-state benchmark. The loaded heartbeat retains its minimum window and original policy.

| Window | Samples | p50 ms | p95 ms | max ms | Samples >50 ms |
| --- | --- | --- | --- | --- | --- |
| Pre-inference idle | 22 | 22 | 120 | 145 | 9 |
| Loaded | 261 | 78 | 143 | 155 | 165 |
| LLM + OCR + TTS overlap | 14 | 95 | 151 | 151 | 9 |
| LLM + TTS overlap | 12 | 106 | 145 | 145 | 11 |
| LLM only | 235 | 75 | 143 | 155 | 145 |

The overlap groups classify each entire tick interval against actual check start/end times. There is no
post-engine sample group in this run; the LLM check extends through essentially the whole heartbeat. Overlap
subsets are small and unequal, so their percentiles are not controlled per-engine comparisons.

| Lateness bucket | Idle count | Loaded count |
| --- | --- | --- |
| 0 ms | 6 | 42 |
| >0 to 10 ms | 2 | 21 |
| >10 to 25 ms | 3 | 18 |
| >25 to 50 ms | 2 | 15 |
| >50 to 100 ms | 5 | 77 |
| >100 to 250 ms | 4 | 88 |
| >250 ms | 0 | 0 |

Long-task observation was supported; zero renderer tasks of at least 50 ms were recorded. Shorter tasks,
unobserved work and OS starvation are not excluded. The visibility API reported `visible`; this is consistent
with `backgroundThrottling: false` even for a hidden window, as documented in
[Electron BrowserWindow](https://github.com/electron/website/blob/main/docs/latest/api/browser-window.md).
Source inspection confirms the existing smoke-only `disable-renderer-backgrounding` switch and disabled window
background throttling. No actual macOS process-priority or App Nap state was measured.

## Engine and runner evidence

| Engine | Start epoch ms | Finish epoch ms | Elapsed ms | User CPU ms | System CPU ms | RSS at finish bytes |
| --- | --- | --- | --- | --- | --- | --- |
| LLM | 1791597624362.2275 | 1791597654504.0847 | 30141.857 | 687.119 | 265.101 | 225509376 |
| OCR | 1791597624363.22 | 1791597626055.0344 | 1691.814 | 959.112 | 103.915 | 156336128 |
| TTS | 1791597624363.6414 | 1791597627858.8328 | 3495.191 | 1957.191 | 222.513 | 155320320 |

Check lifetimes include host startup/model loading; CPU fields measure whole utility-process CPU during the
probe handler, and RSS is an endpoint snapshot, not a peak. The LLM uses the macOS Metal binary despite the older
generic `(CPU)` report label. Its setup/load took 28691 ms, generation 815 ms. About 30 seconds of check time
versus 952 ms of measured host CPU does not support sustained LLM CPU saturation; it does not identify GPU work,
initialization waits or short contention spikes. CPU values from different processes cannot locate a delay.

Runner: available parallelism 3; total RAM 7516192768 bytes (7 GiB); free RAM before/after 947601408/919453696
bytes. Load averages (1/5/15 minute) before: 5.594/7.781/10.138; after: 9.067/8.654/10.376. This suggests pressure,
but load averages include prior work and are not synchronized CPU-utilization or host-oversubscription proof.
Free RAM alone does not establish swapping or macOS memory pressure. No GPU utilization was collected.

## Decision and confidence

High confidence: high timer lateness already occurs before any engine probe starts; simultaneous three-engine
inference is not necessary for this run's failing tail. Significant latency remains after OCR/TTS finish.
There is no recorded long renderer task explaining the delay, and the report/policy arithmetic recomputes exactly.

Moderate confidence: runner pressure or OS/Chromium timer scheduling contributes. The high pre-inference tail and
runner load support that direction. They do not distinguish App Nap, timer coalescing, renderer priority,
short main-thread work, shared-host pressure, startup transients or Metal initialization waits.

No evidence-supported runtime correction was selected. No scheduling flag, thread count, concurrency,
heartbeat arithmetic, threshold or verdict was changed. Windows's native exit also lacks evidence identifying
a defective native call. Changing native disposal or test isolation solely from an exit code would be speculative.

Missing evidence needed before choosing a fix:

- macOS renderer/utility process priority and App Nap state, synchronized system/per-process CPU and runnable
  pressure, and a scheduler/timer trace during delayed ticks;
- a longer settled idle observation and a post-engine observation to distinguish startup transients from
  persistent timer/scheduler behavior; the current baseline is only two seconds;
- GPU/Metal initialization timing if investigating the long LLM setup;
- a Windows native crash stack/dump or faulting-module record for the probe worker.

A diagnostic rerun should collect those observations while preserving policy and concurrent checks. A controlled
visible/hidden comparison could test visibility scheduling, but a single uncontrolled rerun cannot prove causality.

## Verification and GSD gate

The downloaded smoke passes schema and bounded diagnostic validation. Recomputing the full summary, buckets,
overlap groups and policy statistics matches the artifact exactly. The pass validator correctly exits 1 with
only overall failure and the required `ui-responsive` failure. Failed evidence is not relabeled successful.

Local Windows verification this session: format, lint, typecheck, dependency boundaries, CI/ADR/features checks
passed; all 363 unit tests passed, including the native probe file. The hosted native crash was not reproduced
and is not resolved by that local pass. No local package or E2E run was needed for this evidence/documentation
update. See `verification.txt` for actual command output and exits.

Plan 01-10 cannot close: both jobs failed, macOS responsiveness remains red, Windows has a new unit blocker,
and neither platform ran E2E. Plan 01-11 remains complete locally; 01-12 remains gated; 01-13 was not started.
Tier B consumer clean-machine verification remains outstanding separately. No push, release or downstream
implementation occurred. This session stops after evidence evaluation and state reconciliation.
