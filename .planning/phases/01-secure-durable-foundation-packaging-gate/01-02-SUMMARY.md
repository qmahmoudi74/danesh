---
phase: 01-secure-durable-foundation-packaging-gate
plan: "02"
subsystem: build
status: complete
completed: 2026-10-09
tags: [electron, dependencies, licenses, supply-chain]
requires: []
provides:
  - Reviewed exact-pinned workspace and byte-identical frozen lockfile
  - Installed Windows native toolchain with approved lifecycle restrictions
  - MIT project LICENSE and accepted ADR 0004
  - Verified upstream license grants and documented declaration compatibility
requirements-completed: []
---

# Plan 01-02 completed

All plan acceptance criteria pass. The prior blocked draft remains historical; both blockers are now resolved without adding packages, changing versions, modifying installed dependencies or weakening the global license policy. REL-01's dependency/reproducibility contribution is delivered; full CI/platform verification belongs to later plans and is not claimed here.

## Approval and commits

The user explicitly approved:

> I approve the reviewed exact dependency pins, pnpm 12.9.1, the existing lockfile, the frozen-lockfile installation, the reviewed esbuild install script, and the expected official Electron binary download.

The full reply and named exceptions are preserved in `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-02-user-approval.md`. Local task commits were separately authorized. No installation preceded the human checkpoint.

| Task | Commit | Result |
| --- | --- | --- |
| Manifests/workspace/lockfile | `97454c7` | Exact pins, pre-install checks and commit |
| Human checkpoint/policy | `25c8be6` | Explicit approval and narrow exceptions recorded |
| Frozen install/native checks | `4625360` | Required command and native verification passed |
| MIT/ADR/notices | `5e5b2ae` | Required license checks passed; published notices retained |
| Blocker-resolution follow-up | `fb28aad` | Upstream license provenance and planned declaration compatibility verified |

The earlier blocked execution record `2361e8c` is preserved. All work remains on `feat/danesh-phase-01`; history was not rewritten and nothing was pushed.

## License resolution

The published npm package and tag v1.0.2 identify commit `c8fcebc8be093c8bd8db1e7d75c09b9fce7e4708`. Maintainer parshap merged PR #4 as its immediate child `4212839ea184e74fb81f1e4e633e1db794ebe4f4`. That commit adds LICENSE.MIT.txt and LICENSE.WTFPL.txt and changes only the license expression in package.json; version remains 1.0.2. All three installed runtime source files match that licensed revision byte for byte. Both immutable official texts are retained with hashes. Select MIT for this identical component; the npm WTFPL declaration and original tarball omission remain recorded rather than rewritten.

This satisfies the user's conditional published-text requirement through verified repository provenance. MPL applies only to the named Lightning CSS build-time packages; the SPDX data exceptions remain package/version-specific. No global allowlist expansion occurred. Fifty-nine license/notice/attribution files are retained with verified hashes; release notice generation remains Plan 01-05 work.

## TypeScript resolution

The published node-llama-cpp declaration destructures an undeclared `tempDir` member. Its GGUF declaration also references async-retry types supplied only in upstream devDependencies. These are upstream declaration defects, not Danesh source errors.

Use the `skipLibCheck` setting already specified by approved Plan 01-03, with strict source checking and `noUncheckedIndexedAccess`. Its declaration-file scope and trade-offs were explained before use and documented in `docs/typescript-compatibility.md`. A valid source probe passes; an invalid numeric LlamaOptions.gpu still fails TS2322. No `any`, suppression comments, version change, vendor patch or new installation was used. Original unsuppressed diagnostics remain evidence; this does not claim the upstream declarations themselves were repaired.

## Actual verification

| Check | Actual result |
| --- | --- |
| Task 1 exact pre-install command | Exit 0: PINS-OK 31, LOCKFILE-ONLY-OK, before installation |
| Task 3 exact command, final rerun | Exit 0: electron-node=24.21.0, INSTALL-OK |
| Task 4 exact command, final rerun | Exit 0: LICENSE-ADR-OK |
| Installed direct versions | All 31 match reviewed pins |
| Toolchain | pnpm 12.9.1, Electron 44.7.0, bundled/host Node 24.21.0, TypeScript 6.0.3 |
| Frozen lockfile | Byte-identical; SHA-256 3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157 |
| Native modules | SQLite operations/rollback and ONNX loading pass on host Node and Electron-as-Node; LLM CPU binding loads with build never/skipDownload; OCR import passes without language data |
| Lifecycle policy | Only esbuild permitted; both esbuild postinstall scripts ran, no pending builds; other reviewed lifecycle names remain false |
| License provenance | Maintainer merge, direct ancestry, unchanged runtime source and both license hashes verified |
| Strict source compatibility | Positive probe passes; negative control fails TS2322 |
| Production dependency graph | 163 reachable package/version records; no named exception package reachable |

The first installation check historically failed because Electron's download banner contaminated the captured version. The unchanged cached-binary retry passed; neither dependency pins nor verification command was altered.

## Limits and next plan

The two-document pnpm lockfile has 737 package/version records (15 manager, 722 application/tooling); pnpm installed 635 packages on Windows. Only approved npm package prebuilts and the approved Electron binary were obtained. No model/probe, browser, extra engine binary or native source build was requested.

Actual Danesh packaging, macOS verification, utilityProcess engine smoke and the full release notice inventory remain unverified and belong to later plans. A production dependency graph is not packaged-artifact evidence. Restricted-license inclusion in future distributed artifacts still requires separate review.

Plan 01-03 may now execute; no later plan is authorized. Automatic chaining remains disabled. Evidence is linked from the dependency review and includes `01-02-final-verification.txt`, `01-02-license-applicability-check.json` and `01-02-type-compatibility-followup.json`.

REL-01 and REL-08 contributions in this plan pass. Their global completion remains gated by unfinished sibling plans declaring the same IDs, following GSD's shared-requirement rule; those checkboxes are not marked complete here.

## Self-Check: PASSED

The five recorded task/checkpoint/follow-up commits exist and their ancestry order was verified. Actual required installation and license checks passed. Approval, native/type compatibility and license-provenance evidence exists at the recorded repository paths.
