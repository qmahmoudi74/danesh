---
phase: 01-secure-durable-foundation-packaging-gate
plan: "03"
subsystem: desktop
status: complete
completed: 2026-10-09
tags: [electron, react, typescript, sqlite, isolation, walking-skeleton]
requires: [01-01, 01-02]
provides:
  - Persian RTL app-protocol shell with an offline bundled font and strict nonce CSP
  - Closed preload API and schema-validated private renderer-to-Core RPC
  - Core-owned durable SQLite database and actual System check results
  - Main-brokered isolated sample host and guarded test-only echo RPC
  - Electron BDD harness, strict TypeScript, lint, boundary and unit-test gates
requirements-completed: []
key-files:
  created:
    - aliases.ts
    - apps/desktop/electron.vite.config.ts
    - apps/desktop/playwright.config.ts
    - apps/main/src/index.ts
    - apps/main/src/protocol.ts
    - apps/main/src/policy/app-path.ts
    - apps/main/src/hosts.ts
    - apps/preload/src/index.ts
    - apps/renderer/index.html
    - apps/renderer/src/main.tsx
    - apps/renderer/src/style.css
    - apps/core/src/index.ts
    - apps/core/src/checks/registry.ts
    - apps/core/src/checks/app-launch.check.ts
    - apps/core/src/checks/database.check.ts
    - packages/contracts/src/rpc.ts
    - packages/contracts/src/control.ts
    - packages/contracts/src/host-protocol.ts
    - packages/contracts/src/test-rpc.ts
    - packages/contracts/src/smoke-report.ts
    - packages/contracts/src/utility-port.ts
    - packages/storage/src/db.ts
    - packages/storage/migrations/0001_init.sql
    - packages/engine-api/src/sample-host.ts
    - features/steps/fixtures.ts
    - features/steps/app-shell.steps.ts
    - tools/run-e2e.ts
    - tsconfig.base.json
    - tsconfig.json
    - apps/renderer/tsconfig.json
    - types/globals.d.ts
    - eslint.config.js
    - .dependency-cruiser.cjs
    - vitest.config.ts
    - packages/contracts/test/smoke-report.test.ts
    - apps/main/test/protocol.test.ts
---

# Plan 01-03 completed

The approved Walking Skeleton runs on Windows x64 with Electron 44.7.0. Both prerequisite plans were complete before execution; GSD reported exactly two canonical summaries at that point. No dependency, manifest, lockfile, license-policy or architectural decision was changed by this plan. No later plan was executed.

## Task commits and ordering

| Task | Commit | Verification before commit |
| --- | --- | --- |
| 1: Renderer → preload → Core → SQLite round trip | `b7e4fb9` | Exact E2E command: 3 passed, 1 sample-host scenario skipped as permitted at this task boundary |
| 2: Isolated sample-host hop | `0a7ea6d` | Exact E2E command: 4 passed, none skipped |
| 3: Strict source/static/test gates | `ab9475e` | Exact static command: exit 0; final E2E: 4 passed; production build/runtime also passed |

All commits remain on `feat/danesh-phase-01`, in dependency order, without history rewriting or pushing. Task 1 precedes Task 2; Task 3 fixes and verifies findings in their files as required by the plan. Duration was not measured.

## Actual behavior and verification

Home and System check use Persian RTL text and a locally bundled Vazirmatn variable font. Technical JSON details use LTR presentation. Built pages are served from `app://danesh/`, with fresh per-response CSP nonces, a matching HTML nonce meta tag, and `connect-src 'none'`. Filesystem paths are checked within the renderer root; no file-URL fetch is used.

The sandboxed CommonJS preload exposes only `call` and `on`. It keeps the MessagePort private, validates calls and responses, checks bounded payloads, and times out pending calls. Main validates the sending top frame before brokering ports and validates Core control messages. Core owns the database, revalidates RPC envelopes/inputs, rejects unknown methods, and reports actual application/database checks. Main forks the sample host on Core's request; its validated echo travels over a separate brokered port.

The first migration creates STRICT tables and records its LF-normalized SHA-256, application version and applied timestamp in the same transaction as user_version 1. SQLite uses WAL, FULL synchronous mode, foreign keys and a 5000 ms busy timeout. Relaunch verification reads both persisted probe rows and validates migration metadata.

| Command/check | Actual result |
| --- | --- |
| `env -u ELECTRON_RUN_AS_NODE DANESH_E2E_GREP=@plan-01-03 pnpm test:e2e` | Exit 0; 4 scenarios passed, 0 skipped, 0 failed |
| `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm vitest run --project contracts --project main` | Exit 0; both TS projects pass, ESLint passes, 0 boundary violations (40 modules/63 dependencies), 18 tests pass in 2 projects |
| `pnpm build` | Exit 0; production Main/Core/sample-host, CJS preload, renderer and bundled fonts built |
| Production `pnpm test:e2e` with skip-build and three non-test-hook scenario names selected | Exit 0; real startup, System check, no Node surface and persistence: 3 passed, none skipped |
| Runtime isolation | Actual Main/renderer/Core/sample-host process IDs are all distinct |
| CSP/runtime origin | Restrictive response header and fresh matching nonce verified; document fa/rtl; zero captured CSP violations during monitored loading and System check |
| Runtime SQLite | Probe IDs 1 and 2 survive relaunch; WAL, user_version 1, STRICT tables and migration checksum/version verified |
| Production Core/preload inspection | `test.engineEcho` literal absent from these built files; packaged sentinel gate remains later work |
| Manifest/lockfile preservation | `git diff --quiet b4e98d8 -- package.json apps/desktop/package.json pnpm-lock.yaml pnpm-workspace.yaml` exits 0 |
| Whitespace | `git diff --check` exits 0 |

Actual final command output is retained in `evidence/01-03-final-verification.txt`, including the recheck after the final test-only schema guard. E2E launches strip ELECTRON_RUN_AS_NODE and create owned temporary library paths containing Persian characters and spaces. The harness uses the already installed Electron binary; no browser, model, probe or extra engine binary was downloaded.

## Findings corrected during implementation

- electron-vite requires an explicit renderer HTML input with this project layout. playwright-bdd requires the external feature root to resolve to an existing absolute directory.
- A discriminated union cannot have two variants with the same `result` discriminator; the host response union now validates both success and failure shapes correctly.
- The initial runtime capture began after load. The final harness installs its CSP listener before a monitored reload and verifies response headers and nonce freshness; Main handles the new document's validated port handshake.
- That stronger capture exposed Zod's optional eval probe. Its supported `jitless` configuration is applied before constructing report schemas, preserving the approved CSP and schema validation.
- An exclusion initially hid external-package edges from dependency-cruiser. It now stops traversal into node_modules while retaining those edges, so Electron and better-sqlite3 prohibitions remain enforceable.
- Static imports could retain unused test-only schema literals. Schema-map construction now also has a build-time guard; production Core/preload inspection confirms the method literal is absent.

The plan-required skipLibCheck applies only to declaration files; all Danesh .ts/.tsx source remains strict with noUncheckedIndexedAccess. Its third-party compatibility trade-offs and positive/negative probes are documented by Plan 01-02. No `any`, suppression comment or source-check exception was added.

## Scope, requirements and next work

Extra files are the plan-permitted pure protocol-policy split, a small typed utility-port interface, and renderer CSS for the bundled font/basic readable shell. Task 2 also updates preload method validation so the guarded test method can reach Core. These do not change SKELETON.md decisions; its approved process topology and contracts are preserved.

GSD `requirements.ready-ids` returned no ready IDs for PLAT-01, PLAT-02, PLAT-03 or EVAL-06: unfinished sibling plans also declare them. This plan's contributions pass, but those phase-level requirements are deliberately not marked globally complete.

There are no remaining blockers for this plan's acceptance criteria. Packaged Windows/macOS builds, restricted-license inclusion in distributed artifacts, clean-machine installation, full engine smoke, general migration/recovery machinery and comprehensive shell/egress hardening remain later work and are not claimed verified here.

Next executable plan: **01-05**, whose dependencies 01-02 and 01-03 are now complete. It implements repository license/ADR/features/report gates. Execution stops here at the user's boundary; automatic chaining remains disabled.
