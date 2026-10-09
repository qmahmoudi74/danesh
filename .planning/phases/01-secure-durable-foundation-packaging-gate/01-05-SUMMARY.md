---
phase: 01-secure-durable-foundation-packaging-gate
plan: "05"
subsystem: validation
status: complete
completed: 2026-10-10
requires: [01-02, 01-03]
provides: [whole-lock license gate, ADR gate, features-first gate, evidence-report gate]
requirements-completed: [EVAL-06]
key-files:
  created:
    - tools/license-scan.ts
    - tools/license-policy.json
    - tools/license-scan.test.ts
    - third_party/binary-licenses.json
    - third_party/THIRD-PARTY-NOTICES.txt
    - third_party/package-license-metadata.json
    - tools/lib/git.ts
    - tools/lib/markdown.ts
    - tools/lib/test-repo.ts
    - tools/check-adr.ts
    - tools/check-adr.test.ts
    - tools/check-features-first.ts
    - tools/check-features-first.test.ts
    - tools/check-report.ts
    - tools/check-report.test.ts
    - types/spdx-expression-parse.d.ts
---

# Plan 01-05 completed

All three tasks and their acceptance checks pass on feat/danesh-phase-01. Dependencies 01-02 and 01-03 were complete before execution. No packages were installed, versions changed, binaries downloaded, or remote changes made. Automatic chaining remains disabled.

## Task commits

| Task | Commit | Actual verification before commit |
| --- | --- | --- |
| License tracer | 53662f3 | Required license unit command and real scan pass; 29 tests |
| ADR/features-first | 022f023 | Required command passes; 22 tests; both repository gates exit 0 |
| Evidence reports | af7f99f | Required command passes; 18 tests; missing phase report rejected |

A follow-up documentation commit describes the implemented policy and pending release review. Git ancestry preserves the three task boundaries. TDD for Task 2 observed 17 failing assertions and 5 passing tests against the temporary empty implementation before the real implementation; Task 3 observed 15 failing assertions and 3 passing tests. All 69 tools tests pass after implementation. No temporary implementation remains.

## Deliverables and safeguards

The SPDX parser handles OR, AND and WITH; unknown/missing declarations fail closed. Exact approved exceptions retain their evidence and obligations. All 737 locked identities, including other platforms, are checked against previously reviewed official-registry metadata bound to lockfile integrity; installed declarations are compared to that metadata. The scan also checks production reachability of build-only exceptions and 59 retained notice/license hashes. Generated notices preserve Apache notices, the complete Vazirmatn OFL text, and approved exception attribution/license texts. Extra metadata, local parser declarations and owned temporary-repository helpers are necessary offline coverage/testing support, without new dependencies.

ADR validation checks numbering, required sections, accepted license prerequisites, actual platform evidence and strict Git ancestry with unchanged pass-policy text. Features validation checks scenario kinds and feature-before-steps/implementation history. Git uses argument arrays and rejects shallow history. Missing future covered paths are honest INFO records; --allow-unbound only permits steps not yet implemented.

The report gate checks exact requirement coverage/order, statuses, existing UTF-8 evidence paths, recorded check failures, partial/blocked explanations and derived integer counts. It refuses installer claims supported only by configuration/unit source and requires Tier B evidence for REL-02. Persian paths, command-injection/order fixtures, disallowed licenses and unsupported evidence claims have negative tests.

## Actual final verification

Raw commands, output and exit codes are retained in .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-05-final-verification.txt.

| Command | Actual result |
| --- | --- |
| pnpm vitest run --project tools | Exit 0; 69 tests in 4 files pass |
| pnpm licenses:scan | Exit 0; license-scan: scanned=739 lockfile=737 failures=0 notices=ok |
| pnpm check:adr | Exit 0; failures=0 |
| node tools/check-features-first.ts --allow-unbound | Exit 0; failures=0 |
| node tools/check-report.ts --phase 01 | Expected exit 1: report not found; phase verification has not occurred |
| pnpm typecheck && pnpm lint && pnpm depcruise && pnpm vitest run --project contracts --project main | Exit 0; strict source checks and lint pass; 0 boundary violations, 54 modules/98 edges; 18 tests pass |
| pnpm build | Exit 0; production desktop build succeeds |
| env -u ELECTRON_RUN_AS_NODE DANESH_E2E_GREP=@plan-01-03 pnpm test:e2e | Exit 0; 4 real Electron scenarios pass, none skipped |
| git diff --check | Exit 0 |

## Pending reviews and scope

Every needs-review binary/asset entry remains flagged: Electron FFmpeg (LGPL terms, notices/source/relinking and actual contents); DirectML.dll (actual redistribution terms/notices); stories15M-q4_0.gguf (inherited grant); fa_IR-mana-medium.onnx and .onnx.json (model/data provenance); eng.traineddata (actual artifact license). Planned assets were not obtained. sherpa-onnx-node is excluded for embedded espeak-ng GPL code. These warnings are explicitly prescribed by this plan, not completed release reviews or authorization to distribute restricted components.

All Plan 01-05 acceptance criteria pass. Packaging contents, clean-machine Windows/macOS evidence, model/voice reviews and end-of-phase reports remain unverified future work. Although requirements.ready-ids permits REL-08, its full engine/model/voice compatibility claim stays pending while these binary reviews remain open. EVAL-05 and EVAL-07 also remain pending due to unfinished sibling plans. EVAL-06's features-first foundation is complete.

Next: user-authorized 01-06, depending only on completed 01-03. No later plan has been executed.

## Self-Check: PASSED

Recorded files and evidence exist. Task commits exist in strict ancestry order. Required commands actually ran and their expected outcomes are documented above.
