---
phase: 01-secure-durable-foundation-packaging-gate
plan: "07"
subsystem: security-boundary
status: complete
completed: 2026-10-10
requires: [01-06, 01-17]
provides:
  - Payload-free rotating JSON-lines logging (logs/main.jsonl, logs/core.jsonl)
  - One request validator shared by preload, Core and Main's shell channel
  - Core RPC server with validate-then-dispatch and rejection logging
  - Receiver-side validation of every channel (renderer, preload, Main control, host)
  - Locked-down window, single-instance library, Windows LOCALAPPDATA library default, Chromium egress block
requirements-completed: []
key-files:
  created:
    - packages/logging/src/jsonl.ts
    - packages/logging/test/jsonl.test.ts
    - packages/contracts/src/envelope.ts
    - packages/contracts/src/client.ts
    - packages/contracts/test/ipc-validation.feature.test.ts
    - apps/core/src/rpc-server.ts
    - apps/core/test/rpc-server.test.ts
    - apps/main/src/control.ts
    - apps/main/src/window.ts
    - apps/main/src/user-data.ts
    - apps/main/src/egress-l1.ts
    - apps/main/src/policy/web-preferences.ts
    - apps/main/test/window-policy.test.ts
    - features/steps/startup-states.steps.ts
  modified:
    - packages/contracts/src/rpc.ts
    - packages/contracts/src/host-protocol.ts
    - packages/contracts/src/test-rpc.ts
    - packages/engine-api/src/sample-host.ts
    - apps/preload/src/index.ts
    - apps/core/src/index.ts
    - apps/main/src/index.ts
    - apps/main/src/shell-ipc.ts
    - apps/main/src/policy/shell-dispatch.ts
    - features/steps/app-shell.steps.ts
    - docs/adr/0001-process-topology-and-ipc.md
---

# Plan 01-07 completed

The shell's security boundary is hardened on feat/danesh-phase-01. No dependencies, lockfile changes, installs or
remote actions occurred.

## Commits

| Task | Commit | Content |
| --- | --- | --- |
| 1 (tracer) | 41778fa | Logger, shared envelope, request tracker, Core RPC server, preload on the shared client, diag/host rejection reports, per-method limits |
| 2 | aa404fb | Main control validation, shell rejections logged to main.jsonl, ipc-validation.feature bound in vitest-cucumber, logger/server unit tests |
| 3 | 5522d39 | window.ts, user-data.ts, single-instance lock, egress-l1.ts, CSP/navigation and second-instance E2E, ADR 0001 pointer |

## What works

- **Validation everywhere.** `validateRequest` (envelope.ts) is the single implementation: exact method lookup with
  no trimming or case folding, UTF-8 byte limit of the serialized input, then strict zod parse. The preload (through
  `createRpcClient`), Core's `createRpcServer` and Main's shell dispatcher all use it. Main validates Core control
  messages, Core validates host messages, and the sample host validates Core commands. Handlers run only after
  validation; output is validated as well.
- **Logging without payloads (D-16).** `createJsonlLogger` writes allowlisted scalar fields only, caps strings at 200
  characters, counts dropped fields, and rotates within `maxBytes`/`maxFiles`. Rejections record schema (a contract
  name or a fixed label, never the caller's method string), sender, error class, byte length and code. Persian text,
  ZWNJ, bidi controls and lone surrogates never reach a log, escaped or not. Main writes `logs/main.jsonl`; Core writes
  `logs/core.jsonl` for itself, the renderer, the preload (`diag.rejected`) and hosts.
- **Connection behavior.** One deadline covers both waiting for the Core port and waiting for the reply. A rejection
  leaves the port usable, and closing it settles every pending call with UNAVAILABLE.
- **Window.** `secureWebPreferences` adds `nodeIntegrationInWorker:false`, `allowRunningInsecureContent:false`,
  `webviewTag:false` and `spellcheck:false` to the existing sandbox/isolation settings. `will-navigate` and
  `will-redirect` stay on app://danesh (or the dev server when unpackaged), popups and webview attachment are denied,
  and the CSP comes with every protocol response, including a reload while Core is still starting.
- **Library and instances.** On Windows `userData`/`sessionData` are `%LOCALAPPDATA%\Danesh` unless `--user-data-dir`
  is given, with Unicode paths kept exactly. They are applied before `requestSingleInstanceLock`; a second launch exits
  (0) and focuses the first window, and exactly one Core runs.
- **Chromium egress (L1).** Every http/https/ws/wss/ftp request from any session is cancelled and counted; only the
  host is logged. The spellchecker is off and all permission requests and checks are denied. The only exception is the
  local dev server origin when unpackaged. Main contains no crashReporter or upload configuration (tested).

## Actual verification (Windows 11 x64)

| Check | Result |
| --- | --- |
| typecheck / lint / depcruise | Exit 0; 0 violations (99 modules, 277 deps) |
| pnpm test | 220 tests in 18 files pass; contracts+core+logging+main projects 144 tests |
| ipc-validation.feature (vitest-cucumber) | Every scenario and outline example runs and passes, with no unmatched steps |
| @plan-01-07 E2E (fresh test build) | 4/4 pass: malformed Persian ping logged without payload, connection reusable, CSP + navigation lockdown with delayed-Core reload, real second instance |
| Full E2E | 28 pass, 0 fail, 38 skipped (bound to later plans) |
| Production bundle | 13 hook-free scenarios pass; no test hooks in main/preload output |
| check-features-first / check-adr / licenses:scan | failures=0 each |

Evidence: `evidence/01-07-final-verification.txt`.

## Deviations and honest notes

- **Test-first ordering.** The Gherkin features were committed in 01-01, before this plan. The Task 2 unit tests,
  however, were written after the Task 1 tracer implementation, so they were not observed failing first.
- **Core-delay hook.** For the reload-while-starting check the plan names `DANESH_TEST_CORE_DELAY_MS`. The existing
  test-only `--test-core-ready-delay` switch (01-06, test builds only) already provides it and was reused; no second
  mechanism was added.
- **Bypass hook.** The "directly at Core" E2E needs a request that skips preload validation. A test-build-only
  `test.raw` method in the preload forwards one request unchecked; it is absent from production output.
- **Byte limits.** `system.info` is 1 KiB (not the 64 KiB "default"); ping 256 B and systemCheck.* 1 KiB as planned.
- **Playwright artifacts, not product defects.** Locators wait forever on a navigation Main cancelled, so that step
  reads the DOM directly. `URL.origin` is "null" for app:, so protocol and host are compared instead.
- **Not verified.** `pnpm dev` with the egress block (dev-server exception unit-tested only); macOS; the Chromium
  egress block's positive control (a real blocked request) is part of the zero-egress proof in 01-15.

Next executable plan: 01-08 (packaging, fuses, headless smoke mode).

## Self-Check: PASSED
