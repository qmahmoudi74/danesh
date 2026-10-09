---
phase: 01-secure-durable-foundation-packaging-gate
plan: "08"
subsystem: packaging
status: complete
completed: 2026-10-10
requires: [01-02, 01-05, 01-07]
provides:
  - Production packaging (unsigned NSIS + unpacked dir on Windows; ad-hoc dir + dmg config for macOS arm64) with the D-09 fuse set
  - Headless --smoke-test mode on the normal System check and export path
  - Packaged smoke runner with out-of-process evidence and first Tier A Windows evidence
  - Packaged DaneshTest build for Playwright; smoke-report edge rules and per-check timeouts
requirements-completed: []
key-files:
  created:
    - apps/desktop/electron-builder.yml
    - apps/desktop/electron-builder.test.yml
    - apps/desktop/build/entitlements.mac.plist
    - apps/main/src/smoke-mode.ts
    - apps/main/test/smoke-mode.test.ts
    - apps/core/src/checks/fuse-wire.ts
    - apps/core/src/checks/fuses.check.ts
    - apps/core/src/checks/codesign.check.ts
    - apps/core/test/fuse-wire.test.ts
    - apps/renderer/src/lib/smoke.ts
    - tools/smoke/smoke-lib.ts
    - tools/smoke/smoke-lib.test.ts
    - tools/smoke/build-manifest.ts
    - tools/smoke/run-packaged-smoke.ts
    - tools/assert-no-test-hooks.ts
    - .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-a-local/smoke-win32-x64.json
  modified:
    - apps/desktop/package.json
    - apps/main/src/index.ts, apps/main/src/window.ts, apps/main/src/shell-ipc.ts
    - apps/core/src/system-check.ts, apps/core/src/checks/registry.ts, apps/core/src/checks/database.check.ts, apps/core/src/index.ts
    - packages/contracts/src/smoke-report.ts, packages/contracts/src/shell.ts, packages/contracts/src/control.ts, packages/contracts/src/test-rpc.ts
    - apps/preload/src/index.ts, apps/renderer/src/router.tsx, apps/renderer/src/components/CheckRow.tsx, apps/renderer/src/lib/copy.ts
    - tools/run-e2e.ts, features/steps/system-check.steps.ts
---

# Plan 01-08 completed

Danesh now packages as a real production app on Windows and proves itself with a headless packaged smoke test. No
dependencies or lockfile changes; electron-builder used its cached Electron and NSIS archives. Nothing was published.

## Commits

| Commit | Content |
| --- | --- |
| 20e2840 | All three tasks (tracer smoke mode + config, runner completeness, test build + report rules); itemized in the message |
| 1424e04 | Fix: the production package swallowed the app directory (found during verification), plus two new runner gates |

The tasks touched overlapping files (for example `system-check.ts` carries both the async/applicability change and the
timeouts), so they were committed together rather than as three separate task commits.

## What works

- **Packaging.** `pnpm package` runs the bundle, the test-hook scan (expect absent), electron-builder (`--publish
  never`, `publish: null`) and then the build manifest. It produces `Danesh Setup 0.1.0.exe` (146 MB, unsigned per
  D-08) and `win-unpacked`. Platform-specific native files are filtered per OS, licenses ship in
  `resources/licenses/` (MIT LICENSE and THIRD-PARTY-NOTICES.txt), and English and Persian are the only locales.
- **Fuses.** The D-09 set is applied. Core's `fuses` check streams the binary for Electron's fuse wire (129 ms on the
  200 MB exe). It agrees exactly with `@electron/fuses`, which the runner uses independently. The check applies only to
  packaged builds: an unpackaged dev run uses the stock Electron binary and shows no fuses row instead of a fake result.
- **Smoke mode.** `--smoke-test --smoke-out=<absolute .json>` uses a hidden, unthrottled window, runs the same Core
  System check, exports through a Main-issued token (its lifetime raised to the 300 s smoke limit) and exits 0/1. It
  exits 2 on timeout and 3 on refused arguments (relative, non-.json, missing parent, symlink, or inside the app)
  before any window or Core exists.
- **Runner.** `tools/smoke/run-packaged-smoke.ts` checks:
  - the app's own report;
  - a Persian library path with a leading space and ZWNJ;
  - the out-of-process fuse read-back and the build-manifest diff;
  - asar contents (allowlist) and test-hook markers in the packaged asar;
  - the UTF-16 install-path bound for a 40-character Persian user name;
  - on Windows, a real silent NSIS install into a Persian folder: identical installed tree, the installed app
    smoke-passes, then uninstall;
  - on macOS, `codesign --verify --deep --strict`.

  The home directory is redacted to `~` in committed evidence.
- **Safety deviation.** The plan said to "uninstall any previous dev.danesh.app install first". The runner never
  uninstalls something it did not install: if a per-user Danesh install is registered, the NSIS item is **blocked**
  with instructions. It only removes the temporary copy it installed itself.
- **Report rules.** `overall` must equal "every check passed". Duplicate or out-of-order IDs, fractional or negative
  durations and malformed hashes are rejected. Checks over their limit (engine 90 s, others 15 s) fail as `timeout`
  with «بررسی در زمان مقرر تمام نشد. دوباره اجرا کنید.», and the run continues. Checks declare `applies()`, so a
  non-applicable row is never listed. That fixed a real UI glitch the E2E suite caught: a pending fuses row appeared
  and then vanished.
- **Test build.** `electron-builder.test.yml` builds DaneshTest (inspect fuse on, `dist-test`). With
  `DANESH_E2E_PACKAGED=1`, Playwright packages it, the scanner's positive control runs (it finds the sentinel), and the
  suite runs against it.
- **ADR 0002 evidence.** The database check records that `node:sqlite` is available in Core (SQLite 3.53.4).

## Defect found and fixed during verification

The final hook scan on the production `app.asar` failed. The cause was the platform-level `files` lists in
electron-builder, which held only negations and therefore replaced the root whitelist. The 892 MB production asar
contained `dist-test/` (including the test build's hooks), generated specs and config files. Earlier passes had missed
it because the manifest diff compares the package against itself.

Each platform list now repeats the whole whitelist (production asar 23.7 MB). The runner gained `asarContents` and
`testHooks` gates. The failing order (test package first, then production package) was reproduced and is clean. Full
detail is in `evidence/01-08-final-verification.txt`.

## Actual verification (Windows 11 x64, 150% scaling)

| Check | Result |
| --- | --- |
| typecheck / lint / depcruise / licenses:scan / check-adr / features-first | all exit 0 / failures=0 |
| pnpm test | 236 tests pass (fuse wire incl. a sentinel across the 4 MiB read boundary, smoke args, smoke-lib, report rules, timeouts) |
| `run-packaged-smoke --persian-paths --install-nsis` | verdict pass: appRun (3.4 s), persianLibraryPath, fuses, manifest (72 files), asarContents, installPathBound 185/260, testHooks, nsis (install → identical tree → installed smoke pass → uninstalled, no registry entry left) |
| Refused arguments | `--smoke-out=relative.json` → exit 3, one stderr line, no library content |
| Packaged DaneshTest E2E (@plan-01-08) | 1/1 pass: fuses row «ناموفق» with the test-build sentence, differing fuse EnableNodeCliInspectArguments |
| Full unpackaged E2E | 28 pass, 0 fail, 38 skipped (later plans) |

## Not verified / honest notes

- **macOS:** the dmg/ad-hoc config, the entitlements, the codesign check and the macOS fuse path are implemented but
  **not run on macOS**. The first macOS evidence is due from CI in Plan 01-10.
- **Empty folder from Chromium.** When `--user-data-dir` is given explicitly, Chromium creates that (empty) directory
  before any Danesh code runs, even for refused smoke arguments. Danesh itself writes nothing, and without the switch
  nothing is created.
- **Test-first.** The Task 3 behaviors were written as tests first and observed failing (3 failing before
  implementation). Task 1 and 2 tests were written alongside or after the implementation.
- **Installer size** (146 MB) is dominated by the native engine binaries that Plan 01-09 needs (llama.cpp CPU builds,
  ONNX Runtime). Trimming is a 01-09 concern.

Next executable plan: 01-09 (packaging probes: LLM, OCR, TTS hosts).

## Self-Check: PASSED
