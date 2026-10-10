# CI run 38010302448

Run: https://github.com/qmahmoudi74/danesh/actions/runs/38010302448
Commit: 9746e61ad1aa6b93b07da26fad668efb2491aafc
Conclusion observed on the public run page on 2026-10-10: failure.

The GitHub REST API was rate-limited and `gh` is unavailable. The public run and job pages exposed the smoke
failure annotation below. Artifacts were listed but were not downloaded or validated. The Windows job's conclusion
was not collected for this run; the preceding run 38008995205 recorded Windows success.

macOS job: https://github.com/qmahmoudi74/danesh/actions/runs/38010302448/job/114088509910

The smoke report identifies `ui-responsive` as the failed check. The annotation does not report an engine-loading
failure. It reports 407 renderer heartbeat samples, p50 55 ms, p95 141 ms, maximum 324 ms. PK5 requires at least
100 samples, p95 <= 50 ms and maximum <= 250 ms. The limits remain unchanged.

## Exact annotation excerpt

```text
$ node tools/smoke/run-packaged-smoke.ts --persian-paths
packaged-smoke: verdict=fail failing=appRun out=/Users/runner/work/danesh/danesh/.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-a-local/smoke-darwin-arm64.json
packaged-smoke: appRun: {"verdict":"fail","exitCode":1,"durationMs":49798}
packaged-smoke: check ui-responsive: heartbeat outside policy {"sampleCount":407,"p50":55,"p95":141,"max":324,"intervalMs":50,"method":"nearest-rank","policy":"samples>=100, p95<=50ms, max<=250ms"}
[ELIFECYCLE] Command failed with exit code 1.
```

## Follow-up

The concurrent LLM and TTS probes previously used automatic CPU thread pools. The local follow-up caps LLM
evaluation at two threads and ONNX Runtime at one intra-op and one inter-op thread, including its Unicode-path
buffer fallback. CPU contention is a hypothesis; this change has not been run on macOS. A new user-triggered CI run
and validation of its artifacts are still required. No push was performed in this session.
