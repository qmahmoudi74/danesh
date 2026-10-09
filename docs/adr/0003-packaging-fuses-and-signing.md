---
status: proposed
date: 2026-10-09
decision-makers:
  - Danesh project owner (approved Phase 1 specifications)
kind: packaging
spike: S-PACKAGE
---

# 0003: Packaging, fuses and signing

## Context and Problem Statement

REL-02 requires actual packaged operation on clean Windows and macOS machines, including Unicode installation and library paths. Native SQLite, LLM, OCR and TTS packaging can fail at runtime even when development tests pass. S-PACKAGE must establish that each native probe loads in its own utilityProcess, production fuses remain hardened and nested macOS binaries are signed.

D-08 limits Phase 1 to an unsigned Windows NSIS installer and ad-hoc macOS signing with hardened runtime. Paid signing and notarization belong to Phase 12. D-09 specifies six production fuses, D-23 limits bundled probe assets to 150 MB and D-24 requires an architecture decision if any probe cannot load in a packaged utilityProcess.

## Decision Drivers

- Verified Tier B operation on Windows 11 x64 and macOS 13+ Apple Silicon; hosted CI provides separate Tier A evidence.
- Small, architecture-specific unpacking with full Unicode paths and no silent missing files in NSIS installs.
- Hardened production fuses and complete exclusion of test hooks and the test inspect configuration from distributed builds.
- Engine isolation, responsiveness, bounded check duration and zero outbound connections.
- License-clean probes with notices, integrity-pinned assets and no runtime downloads.

## Considered Options

1. electron-builder 26.17.0 with narrow asarUnpack, unsigned NSIS on Windows and ad-hoc signed hardened-runtime `dir` and DMG builds on macOS.
2. Defer packaging proof until the final release.
3. Use paid signing and notarization during Phase 1.
4. Move a failing native probe into Main to simplify loading.

## Decision Outcome

Propose option 1, subject to the written pass policy. electron-builder 26.17.0 applies production fuses before signing. Windows targets x64 with unsigned NSIS; macOS targets arm64, minimum system version 13.0, `identity: "-"`, hardened runtime and configured entitlements. Only the needed native binary directories are unpacked from asar. Preserve loader-adjacent libraries while excluding other platforms and unused accelerator binaries.

Bundle integrity-pinned probe assets under `resources/probes/` with their notices, within the D-23 total budget. The LLM probe uses node-llama-cpp, OCR uses offline tesseract.js and TTS uses onnxruntime-node with hand-fed phoneme ids. sherpa-onnx is excluded because the existing research found embedded espeak-ng GPL code; these probes do not select product engines or establish Persian quality. At most one ONNX Runtime is loaded per process.

Main serves the renderer from `app://danesh/`. On Windows set userData and sessionData to `%LOCALAPPDATA%\Danesh` before ready unless an explicit `--user-data-dir` was supplied; do not silently move Unicode libraries. Build a resource manifest before installation, then compare the installed tree against it and measure full paths in UTF-16 code units.

The production app's `--smoke-test --smoke-out=<absolute path>` mode runs the same System check path headlessly and exits with its actual result. An out-of-process runner reads the fuse wire, verifies the installed manifest and path lengths, monitors egress and verifies macOS codesign; the in-app report alone cannot substitute for these observers. Every launch removes `ELECTRON_RUN_AS_NODE` from its child environment.

Use a separate DaneshTest build with `EnableNodeCliInspectArguments` enabled solely for Playwright. Production disables it and contains neither test RPC nor fault-injection hooks. Packaging uses `--publish never`; this plan performs no build, download, publishing or spike run.

### Consequences

Windows unsigned installers and macOS ad-hoc signatures are foundation verification artifacts, not signed/notarized release claims. Native layout and macOS signing need real target evidence. A clean-machine failure remains visible rather than being masked by CI success. Asset size, responsive heartbeats and timeout budgets become measurable acceptance gates.

### Confirmation

Every policy row needs evidence for both target platforms. Tier A and Tier B are reported separately, and only Tier B proves REL-02 verified. A probe load failure on either OS is raised at D-24 before any architecture change. This ADR remains proposed with empty results until later plans produce actual evidence.

## Spike Evidence

Pass policy commit: filled at ADR finalization from git history

Commit this policy before governed runs. Never alter it after results exist; any changed policy is a new separately committed revision recorded alongside the original.

### Pass policy

Accept only if **every applicable row** passes for the packaged **production** build on **Windows 11 x64** and **macOS 13+ arm64**. Record actual OS versions and architectures. Hosted Windows/macOS runs are Tier A and do not replace clean-machine Tier B evidence. Windows-only installer rows and macOS-only signature rows must be recorded as not applicable on the other OS, never fabricated passes.

| ID | Required outcome |
| --- | --- |
| PK1 | Fuse wire read using `@electron/fuses` matches all 6 states exactly: `RunAsNode=disabled`, `EnableNodeOptionsEnvironmentVariable=disabled`, `EnableNodeCliInspectArguments=disabled`, `EnableEmbeddedAsarIntegrityValidation=enabled`, `OnlyLoadAppFromAsar=enabled`, `GrantFileProtocolExtraPrivileges=disabled`; 0 mismatches. |
| PK2 | Each LLM, OCR and TTS host loads its packaged native/WASM runtime from `app.asar.unpacked` in its own utilityProcess and uses assets under `resources/probes/`; all 3 report a full lowercase 64-hex output SHA-256 and distinct process ids, with 0 loader failures. |
| PK3 | Windows: silent NSIS installation into a directory containing Persian letters and at least 1 space has an empty installed-resource manifest diff (0 missing, extra or hash-mismatched entries). The longest installed path at the default per-user location for a 40-character Persian user name is strictly under 260 UTF-16 code units. |
| PK4 | macOS: `codesign --verify --deep --strict` exits 0 for the installed app, including nested native binaries and helpers, with ad-hoc identity, hardened runtime and entitlements configured. |
| PK5 | While all 3 probes run concurrently, `ui-responsive` records at least 100 samples, heartbeat p95 lateness ≤ 50 ms and maximum lateness ≤ 250 ms; record the percentile method and integer-millisecond samples. Fewer samples or missing metrics fail. |
| PK6 | The complete smoke run observes 0 outbound connections or attempts across Main, renderer, Core and every active host; default-deny counters, recording proxy and process-tree monitoring provide independent evidence with separate positive controls. Missing observer evidence cannot be treated as a pass. |
| PK7 | Both the production bundle and packaged asar contain 0 occurrences of the test-hook sentinel or test-only RPC/fault hooks; the same-source test build is the positive control for the scan and is never distributed. |
| PK8 | Engine checks time out at 90 000 ms and other checks at 15 000 ms, marking overruns failed; the whole smoke run completes within 300 000 ms. No check is passed without running it. |
| PK9 | Bundled assets under `resources/probes/` total ≤ 150 MB, counting all fixture assets rather than just model weights; record actual byte totals and license notices. |

**D-24 escalation:** any probe unable to load in a packaged utilityProcess on either target OS is an architecture finding raised as `checkpoint:decision`. Stop dependent work and record the failure; never move the probe into Main or relax the pass policy to claim success.

### Platforms actually run

No governed packaged build or clean-machine run has occurred in this repository. Windows 11 x64 and macOS 13+ arm64 are both **not run** under this policy; no hosted Tier A results have been collected either. Later rows require OS name, version, architecture, date, tier and existing raw evidence paths.

### Fixtures

Later runs use the tiny `stories15M-q4_0.gguf` LLM fixture, a bundled OCR image and eng.traineddata, and the `fa_IR-mana-medium.onnx` TTS probe with hand-fed phoneme ids. Pin each asset's source revision, full SHA-256, byte count and license in the later probe lockfile; no assets are fetched in Plan 01-01. Use Persian-plus-space library and install folders, the 40-character Persian username path case and the feature specifications under `features/ui/` and `features/core/`.

### Results

### Raw evidence

None collected for this policy. Later evidence must link production smoke JSON, installed-tree and path-length output, fuse read-back, codesign output, egress observers and their positive controls, heartbeat samples, asset byte totals and test-hook scans with the actual build commit.

## License

Danesh's original code has the user-approved MIT decision, recorded in ADR 0004 by Plan 01-02. Dependencies, model weights, voices and OCR data retain their own licenses and notices; MIT does not relicense them. D-02 excludes GPL, AGPL and LGPL components, including embedded espeak-ng; non-commercial voices and models remain excluded while D-COMMERCIAL is open. Distribute the original-code LICENSE and generated third-party notices under `resources/licenses/` when the packaging plan runs, including Apache-2.0 NOTICE and OFL-1.1 obligations where applicable.

## Packaging

Keep asarUnpack narrow and architecture-specific, preserving required `.node`, WASM, `.dll`, `.so` and `.dylib` loader layout. Signing covers nested binaries and helpers; do not claim notarization or trusted distribution from ad-hoc signing. The Windows installed-tree comparison catches NSIS truncation; the path bound counts UTF-16 rather than bytes or graphemes. Probe assets ship locally and are never downloaded by the app.

## Security

Production keeps the six D-09 fuses and a sandboxed renderer, nonce CSP and validated private ports. Hosts receive neither database handles nor sockets. Chromium and Node egress remain default-deny with an empty allowlist. Test hooks and an inspect-enabled binary are test-only artifacts. Reports expose technical paths locally for evidence while rejection logs exclude user content; no telemetry or automatic upload exists.

## Pros and Cons of the Options

- Early electron-builder packaging proves the approved architecture but requires two OS runs, native layout review and separate test/production builds.
- Deferring packaging would leave the foundation's principal risk unresolved and fails the Phase 1 gate.
- Paid signing adds accounts and costs outside the approved Phase 1 scope; Phase 12 owns trusted release signing and notarization.
- Moving a probe into Main violates PLAT-03, crash isolation and D-24, and is excluded even if it would load there.

## More Information

- [Context D-04 through D-09 and D-23/D-24](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-CONTEXT.md).
- [Approved walking skeleton](../../.planning/phases/01-secure-durable-foundation-packaging-gate/SKELETON.md).
- [Existing research R2-R9/R12/R13 and packaging pitfalls](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-RESEARCH.md).
- [Process policy](0001-process-topology-and-ipc.md) and [database policy](0002-database-driver.md).

Re-run packaged smoke verification whenever a native engine or packaging layout changes. Final engine quality decisions, paid signing, notarization and distribution remain in their approved later phases.
