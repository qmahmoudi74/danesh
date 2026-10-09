---
phase: 01-secure-durable-foundation-packaging-gate
plan: "09"
subsystem: engine-hosts
status: complete
completed: 2026-10-10
requires: [01-08]
provides:
  - Commit-pinned, hash-verified packaging-probe assets (build time only)
  - Shared engine-host runtime and LLM / OCR / TTS probe hosts, each in its own utilityProcess
  - Core engine client with crash containment (HostExited fails only its task)
  - Concurrent engine checks, renderer heartbeat and the ui-responsive check (ADR 0003 PK5)
requirements-completed: []
key-files:
  created:
    - tools/probes.lock.json
    - tools/fetch-probes.ts
    - resources/probes/NOTICE
    - packages/engine-api/src/host-runtime.ts
    - packages/engines/llm-probe/src/probe.ts, host.ts
    - packages/engines/ocr-probe/src/probe.ts, host.ts
    - packages/engines/tts-probe/src/probe.ts, host.ts
    - packages/engines/test/probes.test.ts
    - apps/core/src/engine-client.ts
    - apps/core/src/checks/engine-probe.ts, engine-llm.check.ts, engine-ocr.check.ts, engine-tts.check.ts, ui-responsive.check.ts
    - apps/core/test/engines.test.ts
    - apps/renderer/src/lib/heartbeat.ts
  modified:
    - packages/contracts/src/host-protocol.ts, control.ts, rpc.ts, test-rpc.ts
    - packages/engine-api/src/sample-host.ts
    - apps/main/src/hosts.ts, control.ts, index.ts
    - apps/core/src/index.ts, system-check.ts, checks/registry.ts
    - apps/renderer/src/router.tsx
    - apps/desktop/electron.vite.config.ts, electron-builder.yml, playwright.config.ts
    - .dependency-cruiser.cjs, eslint.config.js, third_party/binary-licenses.json
    - features/steps/system-check.steps.ts
---

# Plan 01-09 completed

The S-PACKAGE architecture risk is retired on Windows: llama.cpp, Tesseract and ONNX Runtime all load from
`app.asar.unpacked` in their own packaged utility processes. They work concurrently without hurting UI
responsiveness, a crashing probe fails only its own row, and everything works from Persian paths. No D-24 architecture
finding was needed. Nothing was published. Assets came from commit-pinned URLs, verified by size and SHA-256.

## Commits

| Commit | Content |
| --- | --- |
| d02da81 | All three tasks (itemized in the message; they share contracts, Core and the check runner) |
| (this docs commit) | Evidence, summary, state |

## What works (Windows 11 x64)

- **Assets (D-23).** `pnpm probes:fetch` downloads 86.8 MB (budget 150 MB). It refuses non-commercial licenses and
  unpinned URLs before any download, verifies size and hash while streaming, and renames atomically. The `.gguf` and
  other assets are gitignored; only `resources/probes/NOTICE` is committed. The app never downloads anything.
- **Hosts.** `startHost` gives every engine the same handshake (pid plus entry path), heartbeat and strict command
  validation, with rejections reported as metadata only. Main forks one utilityProcess per kind on Core's request and
  tells Core about every exit, with a `requested` flag. Core's `withHost` runs one task and stops the host. An
  unrequested exit fails only the pending task with `HostExited` and its exit code. A new dependency-cruiser rule
  forbids Main and the renderer from importing any engine module.
- **Probes.**
  - LLM: node-llama-cpp 3.22.1, CPU, `build: 'never'`, 24 tokens at temperature 0.
  - OCR: tesseract.js 7 fully offline, with the image passed as bytes; it reads "This" at 95% confidence.
  - TTS: onnxruntime-node 1.30 on the MIT Mana voice. Phoneme ids are hand-fed from the voice's own map (no espeak-ng,
    no sherpa-onnx) with noise set to 0 for determinism; 6,400 finite samples.

  Each check records its host pid, entry path, the native library actually loaded (read from Node's diagnostic report)
  and a full output SHA-256. Engine rows keep the «(نمونهٔ آزمایشی)» suffix; model names and versions stay inside
  technical details (tested).
- **Concurrency and responsiveness.** Engine checks start together and report in canonical order, each with its own
  90 s limit. A global renderer heartbeat (50 ms ticks, integer lateness) runs from the first engine start until all
  engines finish and at least 6 s have passed; it also runs in headless smoke mode. `ui-responsive` judges the samples
  with nearest-rank percentiles against PK5 (at least 100 samples, p95 ≤ 50 ms, max ≤ 250 ms), and zero samples fail.

## Actual verification

| Check | Result |
| --- | --- |
| typecheck / lint / depcruise (131 modules) / licenses:scan / check-adr / features-first | all exit 0 / failures=0 |
| pnpm test | 247 tests (engine client containment, percentiles, phoneme ids, edit distance, fuse wire, …) |
| engines project | 3 probes pass from `…\دانش آزمون\مدل‌ها` (Persian, space, ZWNJ) in plain Node |
| @plan-01-09 E2E | 3/3: distinct pids + 64-hex hashes + nothing outside technical details; Tab latency < 250 ms while all three run, ui-responsive pass; forced OCR crash fails only its row (HostExited, exit 1) with «۱ بررسی ناموفق بود…» |
| Full E2E | 31 passed, 0 failed, 35 skipped (later plans); packaged DaneshTest @plan-01-08 still passes |
| Packaged smoke `--persian-paths --install-nsis` | verdict pass, every item; engines in `win-unpacked` (LLM 2.3 s, OCR 0.4 s, TTS 2.2 s) and in the NSIS-installed copy in a Persian folder (first run 9.0 s); ui-responsive 119 samples, p95 13 ms, max 13 ms; longest installed path 185/260 |
| Sizes | installer 208.6 MB; unpacked 528 MB (app.asar 13 MB, probes 86.8 MB) |

Raw output: `evidence/01-09-final-verification.txt`, `evidence/tier-a-local/smoke-win32-x64.json`.

## Findings, deviations and limits

- **License gate worked.** onnxruntime-node ships `dxcompiler.dll`/`dxil.dll` (DirectX Shader Compiler for DirectML),
  which are not on the approved license list. They are now excluded from packaging (the CPU path does not need them)
  and recorded under `excluded`. `@reflink`'s native addon (transitive) is recorded as **needs-review**.
- **Transient NSIS failure.** One `makensis` run failed (ERR_ELECTRON_BUILDER_CANNOT_EXECUTE) and passed unchanged on
  the next run. Recorded for the CI plan.
- **E2E timing.** A real System check now takes about 7–8 s (engines plus the 6 s responsiveness window). Playwright's
  default expect timeout is now 20 s. Two 01-06 steps were adjusted: the report-order step no longer hardcodes the
  check list, and the slow-run settle wait is 30 s.
- **TTS input.** The plan named no phoneme string. "salam" produced 3,584 samples, below the 4,000 bar, so the fixed
  string is "salam donja". This is a probe-input choice, not a quality claim.
- **Fixtures.** The fault scenario needed canned rows plus one live check, so `test.checkRun` gained a test-only `live`
  list.
- **Not verified here.** macOS (first CI run in 01-10), Windows arm64, and the plan's human check (typing and scrolling
  in the freshly installed app while the engines run). The human check is deferred to the end-of-phase UAT. Probe
  license A5 for the tiny LLM stays needs-review.

Next executable plan: 01-10 (CI on Windows and macOS). Its final step requires the user to push to GitHub, which is an
approval gate.

## Self-Check: PASSED
