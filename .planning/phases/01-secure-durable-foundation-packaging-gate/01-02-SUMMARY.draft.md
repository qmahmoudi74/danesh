---
phase: 01-secure-durable-foundation-packaging-gate
plan: "02"
subsystem: build
tags: [dependencies, supply-chain, license, electron, native]
status: blocked
completed: null
requires: []
provides:
  - Committed exact-pinned desktop workspace and reviewed frozen lockfile
  - Installed and version-verified Windows dependency toolchain
  - Committed MIT LICENSE and accepted project-license ADR 0004
  - User-approved package-specific license exceptions and retained notices
requirements-completed: []
blockers:
  - truncate-utf8-bytes published-license-text condition remains unverified
  - Additional strict TypeScript probe reports upstream node-llama-cpp declaration errors
---

# Plan 01-02: Installation verified; close-out blocked

Plan 01-02 is **not fully complete**. Required task verification commands passed, and their deliverables were committed after user authorization. The user's additional conditional license requirement remains unverified; strict dependency declaration checking also found two upstream errors. No canonical `01-02-SUMMARY.md` was created, and GSD completion counts must remain unchanged.

## User approval

The user's exact approval statement was:

> I approve the reviewed exact dependency pins, pnpm 12.9.1, the existing lockfile, the frozen-lockfile installation, the reviewed esbuild install script, and the expected official Electron binary download.

The user separately approved named license exceptions and local task commits, with scope and conditions retained verbatim in [the complete approval record](evidence/01-02-user-approval.md). The reply was not fabricated as a literal one-word "approved" response. Installation occurred only after this explicit reply.

## Task deliverables and commits

| Task | Commit | Actual result |
| --- | --- | --- |
| 1: Exact manifests, workspace, Git controls and lockfile | `97454c7` | Pre-install verification passed; six specified files committed before full installation |
| 2: Human approval and scoped exceptions | `25c8be6` | Approval and policy recorded; truncate's published-text condition remains unverified |
| 3: Frozen installation and native/toolchain verification | `4625360` | Required installation checks passed; additional strict declaration failures retained as evidence |
| 4: MIT LICENSE and ADR 0004 | `5e5b2ae` | Required license verification passed; published notices and attribution retained, with the unverified condition explicitly recorded |

Branch: `feat/danesh-phase-01`. Base HEAD for this continuation: `c122095`. History was preserved. Task commit ordering is 1 → approval record → installation verification → project license/notices. No push, publication or pull request occurred.

## Installed set and script policy

All 31 installed direct versions match the reviewed manifests. pnpm 12.9.1 added 635 packages on this Windows x64 host. The reviewed two-document version-9.0 lockfile contains 737 unique package/version records: 15 package-manager records plus 722 application/tooling records, including optional platforms. Its bytes remain unchanged:

`SHA-256: 3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157`

`allowBuilds` permits only esbuild; the two installed versions are 0.25.12 and 0.28.2. Explicitly blocked names are node-llama-cpp, onnxruntime-node, electron-winstaller, tesseract.js, fsevents and pnpm. Only the two esbuild postinstall scripts appeared in the installation log, and pnpm reports no pending builds. No additional build permission is needed for the checked Windows native modules.

Every install used `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` and `ONNXRUNTIME_NODE_INSTALL=skip`. Browser downloads were also suppressed. Native prebuilts bundled in the approved npm tarballs were installed; no separate model, probe or engine-binary download or native compilation was performed. The expected Electron binary download was approved and performed through the package's default downloader and checksum data. `ELECTRON_RUN_AS_NODE` was confined to child-process queries/checks.

## Actual verification

| Command or check | Actual result |
| --- | --- |
| Task 1 exact automated command, before installation | Exit 0: `PINS-OK 31`, `LOCKFILE-ONLY-OK` |
| Task 3 exact automated command, first run | Exit 1: Electron's first-run download banner contaminated the captured version string; the native install itself succeeded |
| Task 3 unchanged automated command, cached-binary retry | Exit 0: `electron-node=24.21.0`, `INSTALL-OK`; lockfile byte-identical |
| `pnpm exec tsc -v` | `Version 6.0.3` |
| Installed `electron/package.json` | `44.7.0` |
| `pnpm --version` | `12.9.1` |
| Task 4 exact automated command | Exit 0: `LICENSE-ADR-OK` |
| All direct installed package.json versions | All 31 match the approved pins |
| Host Node SQLite read/write and transaction rollback | Passed using shipped Windows x64 prebuild; Node 24.21.0, ABI 137 |
| Electron-as-Node SQLite and ONNX native loading | Passed; Electron 44.7.0, Node 24.21.0, ABI 149; both `.node` files present in require cache |
| LLM CPU native binding | Loaded and disposed with `gpu: false`, `build: never`, `skipDownload: true`; no model loaded |
| OCR package import | Passed; no worker, language-data download or OCR execution requested |
| Temporary strict TypeScript compatibility probe | Failed with two upstream node-llama-cpp declaration errors; `skipLibCheck: false` |
| Same strict probe excluding only node-llama-cpp | Passed with zero diagnostics for SQLite, Electron, ONNX, React and Zod types |
| Production dependency graph | 163 distinct reachable package/version entries; none of the named exception packages |
| Retained published notice bytes | All 57 retained-file SHA-256 values match staged Git blobs: 56 published package files plus canonical CC-BY-3.0 text |
| Actual Danesh packaged artifacts | Not inspected: none exist; packaging belongs to Plan 01-08 |

The exact Task 1 pre-install command must not be rerun after installation to pretend node_modules is absent. Its recorded pass occurred before the authorized install. Project-wide typecheck, application build, test bindings, utilityProcess smoke, installer checks and macOS verification were not run; their configurations and implementation belong to later plans.

## License decisions and preservation

`docs/license-policy.md` and ADR 0004 record the approved package/version exceptions without expanding the global allowlist. MPL covers only lightningcss 1.32.0 and its eleven locked platform variants for build-time use. CC-BY-3.0 covers spdx-exceptions 2.5.0; MIT AND CC-BY-3.0 covers spdx-ranges 2.1.1. The truncate-utf8-bytes 1.0.2 WTFPL exception is conditional and unverified. GPL/AGPL/LGPL, unknown-license and non-commercial exclusions remain in force.

`third_party/PLAN-01-02-LICENSE-EVIDENCE.json` inventories verbatim installed license, notice and attribution copies with upstream sources and hashes. Applicable Apache-2.0 notices and Vazirmatn's OFL-1.1 text are retained. SPDX data attribution and the MIT code notice are preserved alongside the fixed-tag SPDX CC-BY-3.0 text. A directory-local Git attribute preserves upstream line endings/whitespace so the evidence hashes survive checkout; it does not alter application source formatting.

This is retained evidence, not the complete canonical notice inventory from Plan 01-05. No Plan 01-05 scanner, policy implementation or Plan 01-08 packaging configuration was created. The production dependency graph supports the declared build-time boundary; actual archive/resource exclusion remains a future release gate. Any restricted-license component found in a packaged application must return to separate review.

## Blockers and permitted next decision

1. **Published license text:** truncate-utf8-bytes 1.0.2 declares WTFPL but contains no LICENSE/COPYING/NOTICE text. Its npm `gitHead`, `c8fcebc8be093c8bd8db1e7d75c09b9fce7e4708`, likewise has none. The package's README, AUTHORS, metadata and immutable upstream tree are retained. No generic WTFPL text was substituted as publisher evidence. The user must explicitly disposition the missing-text condition, or verifiable publisher-supplied text must be obtained.
2. **Strict TypeScript declaration compatibility:** node-llama-cpp 3.22.1's `getLlamaForOptions` destructures `tempDir`, absent from `LlamaOptions`; `readGgufFileInfo.d.ts` imports async-retry without declarations. These are dependency declaration errors, not newly written application errors. No unapproved type package, package patch, version change or compiler configuration was introduced. A fix or acceptance of a scoped compiler approach needs an explicit disposition before close-out.

## Files and evidence

The planned manifests, workspace configuration, Git controls, frozen lockfile, LICENSE and ADR 0004 are committed. Additional user-requested policy/notice documentation and execution evidence are committed. No application source or later-plan configuration was created.

- [Dependency review](01-02-DEPENDENCY-REVIEW.md)
- [Installation transcript](evidence/01-02-install-verification.txt)
- [Native checks](evidence/01-02-native-verification.txt)
- [Version checks](evidence/01-02-toolchain-versions.txt)
- [Strict TypeScript diagnostics](evidence/01-02-typescript-verification.txt)
- [Production graph check](evidence/01-02-production-dependency-check.json)
- [Publisher license/source evidence](evidence/01-02-truncate-license-provenance.json)

This draft is deliberately noncanonical: the installed GSD query counts canonical SUMMARY filenames as completed plans regardless of blocked front matter. GSD must still report only Plan 01-01 completed and include Plan 01-02 among its 14 incomplete plans. Automatic chaining remains disabled. Stop here; do not execute Plan 01-03 or later.
