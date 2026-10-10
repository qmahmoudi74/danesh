# GitHub CI run 38011901925

Observed on 2026-10-10 through public GitHub run annotations and REST job/artifact metadata.

- Run: https://github.com/qmahmoudi74/danesh/actions/runs/38011901925
- Head: `34e0ed7eb2c74d24de226140a04f074b46fbfdbe`
- Conclusion: failure on both platform jobs.
- Windows job: https://github.com/qmahmoudi74/danesh/actions/runs/38011901925/job/114093550090
- macOS job: https://github.com/qmahmoudi74/danesh/actions/runs/38011901925/job/114093549957

## Public failure evidence

Windows unit tests: 27 files, 351 passed and 2 failed, total duration 44.32 seconds. Both failures
were the unchanged 5000 ms test timeout:

1. `packages/logging/test/jsonl.test.ts`: `rotates within the size threshold and file-count limit`.
2. `packages/storage/test/storage-migrations.feature.test.ts`: fresh-library scenario,
   `When the migration runner opens the library`.

The annotation shows subsequent tests completing. It does not report a SQLite lock error,
logging rotation assertion failure, or failed migration. Windows packaging/smoke did not run
after the failed unit gate.

macOS packaged smoke: app exit code 1, duration 25798 ms; `ui-responsive` reported:

```json
{"sampleCount":220,"p50":56,"p95":139,"max":156,"intervalMs":50,"method":"nearest-rank","policy":"samples>=100, p95<=50ms, max<=250ms"}
```

The previous run's maximum improved from 324 ms to 156 ms after CPU thread caps; p95 remains
essentially unchanged (141 ms to 139 ms). Aggregate percentiles cannot establish the cause.
The annotation names no engine-loading failure. The complete engine results were unavailable.

## Download limits

REST metadata lists `evidence-windows-latest` (artifact 11654196309, 3362726 bytes) and
`evidence-macos-latest` (artifact 11654166412, 3365754 bytes). Their archive endpoints returned
HTTP 401 without authenticated GitHub access. The run-log archive returned HTTP 403. A public
per-step log request stalled and was interrupted. No complete log archive or artifact was
downloaded or validated; this file records annotations and metadata, not raw artifacts.

## Focused diagnosis and local follow-up

The heartbeat subtracts its 50 ms interval from consecutive monotonic-clock readings. It
neither accumulates drift against application startup nor substitutes generated samples.
Core launches LLM/OCR/TTS concurrently in separate utility processes. LLM and ORT thread caps
are retained. No heavy engine execution or synchronous filesystem I/O runs in the renderer.

The smoke renderer is invisible. `backgroundThrottling: false` disables timer/animation
throttling, but the code did not explicitly prevent Chromium from reducing the process
priority of invisible pages. The documented `disable-renderer-backgrounding` switch now
applies only to valid smoke startup, before Electron readiness. See
[Electron's supported switches](https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-renderer-backgrounding).
The new real Electron regression failed before this fix with foreground scheduling false.
Hidden process priority under engine contention is a plausible contributor to macOS's sustained
timer lateness, not a proven macOS root cause. A green macOS run is still required. Actual
renderer blocking, host resource contention and macOS power scheduling cannot be separated
conclusively without the missing platform artifacts/profiling.

Both Windows callbacks are synchronous, bounded real-file operations. The logger test wrote
200 records and repeatedly opened/closed/rotated files; fresh-library startup performs WAL/FULL
durable writes against a unique database with no pre-migration backup or competing connection.
There is no retry loop or shared database in either failing callback. All 353 tests passed
locally before changes in 9.50 seconds versus CI's 44.32 seconds. These observations support
runner CPU/disk contention and first-use costs, not a demonstrated deadlock. They do not
identify antivirus activity or an individual slow filesystem call.

Vitest now permits two concurrent workers rather than CPU-count default concurrency. The
logging fixture writes 40 records (still exceeding retention repeatedly), verifies every
retained record is ordered/contiguous, and retains byte/file bounds. Production logging,
SQLite FULL synchronization, migration transactions, backup verification, and 5000 ms test
timeouts are unchanged. Targeted logging/storage: 100 passed; rotation 48 ms, fresh open 18 ms.
Full unit suite alongside Electron E2E/static checks: 353 passed in 22.55 seconds; the same two
operations took 49 ms and 27 ms. Hosted Windows reliability remains subject to the next CI run.

Final independent Electron E2E: 37 passed, 31 intentional skips. The production Windows package,
Persian-path unpacked smoke and evidence validation passed; heartbeat 120 samples, p95 13 ms,
maximum 14 ms. NSIS was built but not installed. Format/lint/typecheck/dependency/license gates
passed. See `../../01-10-ci-fixes-verification.txt` for retained local command output.

Plan 01-10 stays partially verified. Plan 01-11 remains complete locally, with macOS
verification pending. Plan 01-12 was not started; Plan 01-13 was not started. No push occurred.
