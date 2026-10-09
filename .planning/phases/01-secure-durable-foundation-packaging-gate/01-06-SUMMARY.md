---
phase: 01-secure-durable-foundation-packaging-gate
plan: "06"
subsystem: desktop-ui
status: complete
completed: 2026-10-10
requires: [01-03]
provides:
  - Accessible Persian-first Home and System check screens with typed isolated IPC
  - Main-owned native save dialog and single-use Core export capabilities
  - Honest per-check progress, summaries and export/error/retry states
  - Persian native menus, two hash routes and heading focus management
  - Actual environment facts and isolated Persian library paths
requirements-completed: []
key-files:
  created:
    - apps/core/src/system-check.ts
    - apps/core/test/system-check.test.ts
    - apps/main/src/menu.ts
    - apps/main/src/policy/shell-origin.ts
    - apps/main/src/shell-ipc.ts
    - apps/main/test/shell-origin.test.ts
    - apps/renderer/src/app.css
    - apps/renderer/src/components/CheckRow.tsx
    - apps/renderer/src/components/Icons.tsx
    - apps/renderer/src/components/Layout.tsx
    - apps/renderer/src/components/Status.tsx
    - apps/renderer/src/lib/copy.ts
    - apps/renderer/src/router.tsx
    - apps/renderer/src/screens/Home.tsx
    - apps/renderer/src/screens/SystemCheck.tsx
    - apps/renderer/test/logical-properties.test.ts
    - apps/renderer/test/tsconfig.json
    - features/steps/system-check.steps.ts
    - packages/contracts/src/schema.ts
    - packages/contracts/src/shell.ts
    - packages/contracts/test/shell.test.ts
  modified:
    - apps/main/src/index.ts
    - apps/preload/src/index.ts
    - apps/core/src/index.ts
    - apps/core/src/checks/registry.ts
    - apps/renderer/src/main.tsx
    - packages/contracts/src/rpc.ts
    - packages/contracts/src/control.ts
    - packages/contracts/src/smoke-report.ts
    - packages/contracts/src/test-rpc.ts
    - packages/contracts/src/host-protocol.ts
    - packages/contracts/test/smoke-report.test.ts
    - features/steps/fixtures.ts
    - features/steps/app-shell.steps.ts
    - tsconfig.json
---

# Plan 01-06 completed

The approved implementation and automated acceptance checks are complete on feat/danesh-phase-01. Its prerequisite 01-03 was complete, and user-mandated 01-05 was formally completed with four summaries before execution. No dependency or lockfile changes, installs, remote actions or engine/model downloads occurred. End-of-phase human UAT remains pending as configured; no later plan was executed.

## Task commits and actual checks

| Task | Commit | Verification before commit |
| --- | --- | --- |
| 1: Secure export tracer | 209c7ec | Required E2E command: 3 export scenarios pass, 9 unbound scenarios skipped as permitted; typecheck/lint and 11 Main tests pass |
| 2: Component system and screen states | 7777a00 | Required renderer/E2E command: 2 renderer tests and 7 scenarios pass; 5 remaining scenarios skipped; static checks and 23 relevant unit tests pass |
| 3: Home/menu/routes/environment/Core timeout | 62ab261 | Required static/E2E checks pass: all 12 tagged scenarios, none skipped; full regression: 100 unit tests; 4 Plan 01-03 scenarios pass |

The three commits exist in strict ancestry order. Task 2 includes the contract/orchestration support needed to expose actual progress and test the approved slow/partial states. Task 3 includes origin/token/export negative tests and fixes revealed by runtime and visual checks.

## Working functionality

Main checks the sending WebContents, top frame, trusted app/development origin, method, size and strict input before opening its native save dialog. Default JSON filenames are ASCII. Cancel returns no token. Main registers a UUID capability with Core and waits for a typed acknowledgement before returning it, avoiding cross-channel ordering races. Renderer sends only runId and token. Core bounds outstanding targets, expires them after 60 seconds and consumes each once, including unsuccessful attempts. It validates its stored report, writes exclusively to a random adjacent temporary file, syncs/closes it, then renames over the chosen target. Typed reasons cover unknown/expired tokens, missing reports and write errors. Tests cover actual disk writes, replacement, expiry, reuse, invalid paths and genuine filesystem errors.

Home contains the Display heading, honest foundation banner, one enabled diagnostics action and the real app version inside Ltr. Before readiness it shows the spinner/preparation copy, with the extra hint after five seconds. Native menu labels, roles and navigation accelerators match UI-SPEC. Two hash routes update the title and focus the new h1; unknown hashes render Home. Main/Core/preload isolation and the closed call/on surface remain intact.

System check begins empty and runs only on request. Actual normal configuration still runs only the implemented app-launch and database checks; future engine and other rows are never fabricated. Each selected row has independent pending/running/final states. A persistent polite status region carries summaries and export feedback, with Persian digits and honest mixed/not-run results. Run and Export prevent duplicate actions, preserve focus, and show busy labels. Cancellation is silent. The real ten-second Core timeout shows a named retry alert; a subsequent reachable Core run clears it.

The renderer uses the exact semantic color/font/radius tokens, React Aria primitives, logical properties, visible focus, reduced-motion and forced-color handling. Status words accompany icons and tints. Technical disclosures are isolated LTR, wrap arbitrary strings, and have named focusable scroll regions capped at 320px. English abbreviations, versions, unknown IDs and the exact Persian path containing space/apostrophe use bdi isolates. Environment facts come from Core/Main, with explicit loading and retry states.

## Actual final checks and evidence

| Check | Actual result |
| --- | --- |
| pnpm vitest run --project renderer | Exit 0; 2 tests; zero banned direction/typography/arbitrary-spacing tokens; negative fixtures detected |
| pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test | Exit 0; strict source checks and lint pass; 0 boundary violations, 72 modules/165 edges; 100 tests in 10 files pass |
| env -u ELECTRON_RUN_AS_NODE DANESH_E2E_GREP=@plan-01-06 pnpm test:e2e | Exit 0; all 12 scenarios pass, none skipped, including the startup-states feature's tagged scenario |
| Plan 01-03 E2E against the same test build | Exit 0; 4 pass, none skipped, including persistence and separate host process |
| pnpm licenses:scan | Exit 0; scanned=739 lockfile=737 failures=0 notices=ok; prescribed pending binary reviews remain warnings |
| pnpm check:adr and node tools/check-features-first.ts --allow-unbound | Exit 0 after Task 3 commit; both failures=0 |
| pnpm build | Exit 0; production desktop build succeeds |
| Production E2E with skip-build and ten applicable scenario names selected | Exit 0; 10 pass, none skipped: startup/isolation/persistence, Home, menu, empty state, environment and all three export scenarios |
| Production Main/Core/preload source inspection | 7 built JS/CJS files inspected; test.engineEcho, test.coreStall, test.checkRun and readiness-delay flag absent |
| Manifest/lockfile comparison against e672dc2 | Exit 0; package manifests, lockfile and lifecycle policy unchanged; lockfile SHA-256 remains 3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157 |
| git diff --check | Exit 0 |

Raw output is retained in .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-06-final-verification.txt and 01-06-postcommit-verification.txt. The former also honestly records the features-first gate rejecting the not-yet-committed Home source before Task 3. The latter records its successful post-commit recheck. No validation result was suppressed.

The evidence/01-06-visual-check.mjs runner and 01-06-visual-results.json retain five viewport captures: Home at minimum width and 200 percent zoom; partial System check at both sizes; and the expanded failing row at 200 percent. Agent inspection corrected a cramped name column and the expanded-chevron selector. Runtime metrics show no horizontal overflow, zero captured CSP violations, a 320px focusable technical region, RTL arrow rotation of 180 degrees, and the expanded chevron's vertical rotation. Forced-colors focus and the reduced-motion preference were exercised. The 300+ character environment display path is explicitly a layout stress fixture, not proof of a native long-path library launch. The native Persian/apostrophe library path is separately verified by the real E2E scenario. Captures use unclipped Chromium viewport screenshots to account for Electron zoom.

## Contract reconciliations and scope

No intended visual/copy/layout deviations from the Plan 01-06 UI contract remain. The closed checkId enum from 01-03 contradicted this plan's mandatory unknown-ID behavior; it now accepts bounded lowercase identifiers while retaining duplicate rejection and canonical ordering of known IDs. The run result gains optional checkIds and progress gains pending without changing existing envelope shapes. Tests retain the original order/duplicate checks and add unknown/markup cases.

An import-order CSP violation revealed that Zod configuration in smoke-report.ts alone was insufficient for new shell schemas. A small shared schema entry point applies jitless before every contract is constructed; the CSP was preserved. Guarded test.checkRun and a bounded readiness-delay flag provide the fixture control required by the already-approved slow/partial/startup scenarios. They are absent from production entry artifacts, and do not create product functionality or download assets. Core test helpers, renderer test tsconfig and the pure shell-origin split are scoped verification support.

The sample durable job slot and full engine check set belong to Plans 01-13 and 01-09/15. Migration/recovery startup behavior belongs to 01-11/14. No placeholders or later-plan functionality were added to imply they are complete. REL-02 and PLAT-11 remain globally pending: requirements.ready-ids reports unfinished sibling contributors, and clean-machine/native-platform proof is not provided by this plan.

## End-of-phase UAT still to perform

- Human visual review at minimum width and 200 percent zoom: Persian shaping, natural reading order, summary prominence, control wrapping, grayscale status distinctions, keyboard focus and technical-region scrolling.
- Actual native-library long-path rendering and native save/cancel dialogs; native menu zoom and accelerators with Persian keyboard input.
- All blocking startup banners once the deferred migration/recovery/supervision plans supply their actual states.
- macOS menu, VoiceOver, accessibility and packaged/native behavior; Windows screen-reader review.
- Clean-machine installers, packaged binary/license/notices inspection and all pending binary/probe reviews. These are future release gates, not completed tests.

Next executable plan is 01-07 (depends on completed 01-06). Execution stops here at the user's boundary. Automatic chaining and auto_advance remain disabled.

## Self-Check: PASSED

All recorded source and evidence paths exist. Task commits exist in order. Required automated acceptance and actual regression checks pass. Deferred human and platform work is explicitly documented above.
