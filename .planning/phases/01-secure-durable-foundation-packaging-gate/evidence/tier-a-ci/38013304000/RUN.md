# GitHub CI run 38013304000

Observed on 2026-10-10 through public GitHub annotations and REST metadata. The final observation at
01:52 UTC found no newer run on `feat/danesh-phase-01`. See `observed-metadata.json` and
`public-annotations.txt`; neither is an artifact archive.

- Run: https://github.com/qmahmoudi74/danesh/actions/runs/38013304000
- Head: `a3d87f2619cb2d184ea1430fd95bd22cd2b30152`
- Overall: completed, failure.
- Windows job 114097978275: completed, success, including unit, package, installed NSIS smoke,
  E2E and packaged E2E.
- macOS job 114097978322: completed, failure. Unit and packaging passed; packaged smoke failed;
  E2E and packaged E2E were skipped.

## Evidence and limits

macOS's annotation reports 342 samples, p50 28 ms, p95 67 ms, maximum 97 ms; app exit 1 after
28739 ms. Its acceptance policy is unchanged: at least 100 samples, p95 <= 50 ms, max <= 250 ms.
Compared with run 38011901925 (p50 56, p95 139, max 156), the distribution improved after the
foreground scheduling change, but an uncontrolled cross-run comparison does not establish causality.
The annotation names no engine failure; full per-engine results cannot be reconstructed from it.

Artifact metadata lists Windows artifact 11655707550 (3396178 bytes) and macOS artifact 11654587275
(3398667 bytes). The macOS archive request returned HTTP 401 without authentication. Full artifacts
were not downloaded or validated. Earlier run log/archive requests returned 403/401; public metadata
and annotation reads succeed. Windows step success is verified, but its smoke distribution is unavailable.

## Diagnosis: confirmed findings versus hypotheses

- Confirmed: the heartbeat measures integer lateness between consecutive 50 ms `setInterval` ticks,
  using the monotonic renderer clock. It does not accumulate drift from startup. Missing reports fail.
- Confirmed: Core runs all three engine checks concurrently in separate utility processes; ordered
  progress completion is emitted after the whole engine group finishes. Those progress events cannot
  identify each engine's actual completion time. New timestamps are captured inside each check instead.
- Confirmed configuration: valid smoke startup disables renderer backgrounding before Electron readiness,
  and the hidden window disables background throttling. Windows E2E verifies the window remains hidden
  and the scheduling switch is present. This is configuration evidence, not macOS OS-priority profiling.
- Confirmed: renderer unsubscribe previously left an active interval and deferred report timer running.
  Restoring the old cleanup reproduced two remaining timers instead of zero. Cleanup now cancels both
  and disconnects its observer. No evidence links this lifecycle defect to macOS's steady smoke p95.
- Hypotheses, unresolved: native resource contention, Chromium/macOS scheduling or timer coalescing,
  hosted-runner pressure, and renderer blocking. Aggregate percentiles cannot distinguish them.
  The macOS LLM uses the platform's auto/Metal build; it is not safe to infer CPU-only execution from
  the existing generic report label. CPU and RSS instrumentation will describe actual utility-process use.

## Bounded diagnostics delivered

The production smoke path now measures a separate two-second idle baseline before starting the real
check. Its samples do not enter the acceptance heartbeat. The loaded heartbeat retains its interval,
minimum window, sample cap, lateness arithmetic and nearest-rank policy. Timestamp observation does
not change its samples. Strict optional RPC diagnostics cap idle samples at 100, loaded timestamps at
4000, and renderer long-task durations at 100. Private paths, task attribution and document content are
excluded. The heartbeat RPC has a bounded 64 KiB limit to accommodate its largest valid payload.

Core records each engine check's actual start/end time, including host startup and model loading.
Utility hosts record whole-process user/system CPU time for the probe and RSS at completion, not peak
RSS or system-wide utilization. The external runner records CPU capacity, total/free memory and load
average where supported; Windows load-average zeros are explicitly unavailable. No OS priority or
GPU-utilization measurement is claimed. No native thread/concurrency change was made this session.

The smoke evidence retains original samples, elapsed timestamps and histograms. Its summary groups
whole timer intervals by engine-check overlap, including transition intervals and the post-engine
minimum-window tail. These small subsets are observations of one concurrent run, not independent
per-engine benchmarks. Long tasks only detect renderer tasks at least 50 ms; absence cannot exclude
shorter tasks or starvation. Cross-process epoch alignment depends on their clock origins.
Detailed stdout and a compact final comparison reach the existing failure annotation; complete metadata
and distributions remain in the actual CI smoke artifact. Diagnostics never change report verdicts.

## Local Windows verification

Final unpacked production smoke: all seven checks passed; 119 loaded samples, p50 0 ms, p95 13 ms,
max 14 ms; independent idle 40 samples, p50 0 ms, p95 13 ms, max 13 ms. Long-task observation was
supported with zero recorded tasks. Loaded overlap counts: all engines 8, LLM+TTS 4, TTS 26, after
engines 81. Their p95 values were 13, 0, 13, 13 ms respectively. The raw report is
`../../01-10-diagnostics-smoke-win32-x64.json`; CPU, RSS and runner resources are retained there.
The visibility API reported visible with background throttling disabled; hidden-window state is
separately verified by E2E. This is Windows evidence, not reproduction of the macOS failure.

Final required static checks passed; 363 unit tests and 21 targeted tests passed. E2E passed 38 scenarios
with 31 intentional skips (30 later-plan cases and one packaged-only fuse case). Windows NSIS was built
but not installed locally this session. Persian-path smoke and evidence validation passed. Packaging
completed before the E2E build started. See `../../01-10-diagnostics-verification.txt`.

## Next gate

User push is required to run these diagnostics on macOS. Inspect idle versus loaded/overlap distributions,
long tasks and engine CPU/RSS before proposing a scheduling or thread correction. Equal sustained idle
and loaded lateness supports investigating scheduling/timer behavior; load-specific lateness supports
investigating engine/resource pressure; correlated long tasks support renderer profiling. None alone
proves a cause. Validate downloaded artifacts after a green run on both platforms.

Plan 01-10 stays partially verified, 01-11 remains complete locally, 01-12 remains gated, and 01-13
was not started. No push, release or automatic downstream execution occurred.
