# Phase 1: Secure, Durable Foundation & Packaging Gate - Research

**Researched:** 2026-10-09
**Domain:** Electron 44 desktop shell hardening, utilityProcess process topology, SQLite durability, durable job kernel, native-engine packaging (Windows + macOS), default-deny egress, test and CI discipline
**Confidence:** HIGH for everything that was run on Windows 11 x64 in this session (see Spike Evidence). MEDIUM for macOS (nothing could be executed on macOS; macOS claims are CITED or ASSUMED and are gated by the CI/Tier B runs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Product-decision gates (D-LICENSE, D-PLATFORM)
- **D-01:** D-LICENSE (Danesh's own repository license) is **not decided by this discussion**. The plan must include a `checkpoint:decision` (human) that presents the candidates:
  - Apache-2.0: permissive, with a patent grant. Fits the research's default permissive path.
  - MIT: permissive.
  - AGPL-3.0-or-later: would make MuPDF and espeak-ng usable without a commercial license.

  REL-08 cannot close, no `LICENSE` file may be committed, and the license ADR cannot be written until the user decides. The prior LICENSE was removed in commit `b2016c7`; do not restore it without confirmation.
  — **Reversibility:** one-way — once code is published under a license on the public repo, that grant cannot be revoked for already-released code. Relicensing later needs consent from every contributor.
- **D-02:** Until D-LICENSE is decided, every dependency added in Phase 1 must be permissively licensed (MIT, Apache-2.0, BSD, ISC; OFL-1.1 for fonts). No GPL or AGPL package may enter the lockfile, directly or transitively. Check this with a license-scan script that runs in CI.
- **D-03:** Phase 1 work does not wait on D-LICENSE. Scaffold, kernel, tests and smoke test proceed in parallel. Only closing REL-08 and committing the LICENSE file wait, and the phase cannot be marked complete until both are done.
- **D-04:** The verified smoke-test targets are the D-PLATFORM default: **Windows 11 x64** and **macOS 13+ on Apple Silicon**. Intel Macs and Windows arm64 are not built or smoke-tested in Phase 1 and are reported as "untested".

#### Clean-machine verification standard (REL-02, PLAT-11)
- **D-05:** Evidence comes in two tiers.
  - **Tier A (automated):** GitHub Actions jobs on `windows-latest` and `macos-latest` (arm64) build the packaged app and run the packaged smoke test headlessly.
  - **Tier B (human-run):** someone follows a written runbook on a clean Windows 11 x64 machine, VM or new local user whose profile path contains Persian characters **and** spaces, and on a clean macOS 13+ Apple Silicon user account or VM. Evidence is recorded under the phase directory (smoke JSON, logs, screenshots).

  Only Tier B counts as **verified** for REL-02. Tier A alone is reported as **partially verified**.
- **D-06:** The development machine for this session is Windows (Node 24.21.0), so Tier B on Windows can be run locally in a fresh user profile with a Persian name. macOS Tier B needs the user's hardware or VM, so plan a `checkpoint:human-action` for it. macOS must never be reported as verified without that evidence.
- **D-07:** The smoke test writes a machine-readable JSON report. It records each check (pass/fail, duration, detail):
  - App launch.
  - Database open and migration.
  - CAS atomic write and read-back.
  - Each probe engine host loaded from `app.asar.unpacked` in its own `utilityProcess`, with its output hash.
  - UI responsive during engine work.
  - Zero outbound connections.
  - Production fuse state.
  - On macOS, `codesign --verify --deep --strict` result.

#### Code signing scope in Phase 1
- **D-08:** Phase 1 uses no paid signing.
  - **macOS:** ad-hoc signing (`codesign -s -`) with hardened-runtime entitlements configured. The smoke test runs `codesign --verify --deep --strict` to prove every nested `.node`, `.dylib` and helper is covered. Notarization is deferred to Phase 12 (REL-03, D-DISTRIB).
  - **Windows:** unsigned NSIS installer.

  Real signing identities are a Phase 12 concern.
- **D-09:** Packaging uses electron-builder 26.x with `asarUnpack` for every native module and probe asset. The production fuse set is applied and verified by the smoke test:
  - `RunAsNode` off
  - `EnableNodeOptionsEnvironmentVariable` off
  - `EnableNodeCliInspectArguments` off
  - `EnableEmbeddedAsarIntegrityValidation` on
  - `OnlyLoadAppFromAsar` on
  - `GrantFileProtocolExtraPrivileges` off

  A separate **test build** keeps `EnableNodeCliInspectArguments` on for Playwright E2E only. Never ship the test build.

#### What the Phase 1 app visibly does
- **D-10:** The production window opens as a Persian-first RTL shell: `<html lang="fa" dir="rtl">`, bundled Vazirmatn font, logical CSS properties only. It shows the app name and an honest status: this is a foundation build and study features are not available yet. There is **no mock** reader, curriculum, import button or placeholder that implies functionality (brief rule: no mock UI presented as real).
- **D-11:** A **System check** screen (Persian label «بررسی سامانه»), reachable from the app menu, runs the same checks as the packaged smoke test: database, storage, engine hosts and egress block. It shows pass/fail in plain Persian with an expandable technical-details section, and can export the same JSON report. It is genuine diagnostic functionality and is the tool for Tier B clean-machine evidence.
- **D-12:** From System check, the user can start a clearly labeled **sample durable job** that processes a bundled sample file in N idempotent chunks. Killing the app, or kill -9 on Core, mid-job and relaunching shows the job resuming without redoing completed chunks. This exercises JOB-03 end to end through real UI without pretending to be PDF import.

#### Library location and durability policy
- **D-13:** The library defaults to `app.getPath('userData')`. Under it:
  - `danesh.db` and `index.db`: SQLite, WAL mode.
  - `blobs/sha256/…`
  - `backups/`
  - `tmp/`
  - `logs/`
  - `models/`: kept separate so it can later be relocated independently.

  Paths are always handled as full Unicode. If a native engine fails on a non-ASCII path, record it as a finding and fix it at the adapter, for example by passing a buffer or file handle instead of a path. Never silently move the library to an ASCII-only location. A relocation UI is deferred to the Phase 11 settings page.
  — **Reversibility:** costly — changing the default location after release requires a migration that moves every existing user's library, plus support for both locations during the transition.
- **D-14:** SQLite policy:
  - WAL, `foreign_keys=ON`, `synchronous=FULL`, `busy_timeout` set.
  - A **single writer** in the Core `utilityProcess`. Main never opens the database.
  - Forward-only numbered SQL migrations, guarded by checksums, plus `PRAGMA user_version`.
  - Before any pending migration, take a backup via `VACUUM INTO` (or the backup API) and keep the **last 3** pre-migration backups.
  - Each migration is one transaction followed by `PRAGMA foreign_key_check`. On failure, roll back and start in a read-only recovery state that offers the backup.
  - A database with a newer `user_version` is refused with a clear Persian message and is never opened read-write.

  — **Reversibility:** one-way — the migration and backup format is what all future user data upgrades build on. Changing it after users have data needs a migration of the migration-history table.
- **D-15:** Database driver: **better-sqlite3 13 (N-API)** behind a `Db` interface by default. The S-PACKAGE spike also tests `node:sqlite` inside Electron 44's bundled Node and records the result in an ADR. Switching drivers later happens only behind the adapter.
- **D-16:** Logging: local rotating JSON-lines files under `userData/logs/`. Logs never contain document text or user content, only IDs, hashes, error classes and counts. There is no telemetry and no network log sink. PLAT-02's rejected IPC payloads are logged as schema name, sender and error, without the payload body.
- **D-17:** The egress broker exists in Phase 1 as a **skeleton** with an empty allowlist. It is the only module allowed to import network APIs (`http`, `https`, `net`, `tls`, `dns`, `undici`, global `fetch`), enforced by lint. In this phase, outbound paths (downloads, web research, update check) exist only as denied stubs. A network-blocked/monitored E2E test asserts zero outbound connection attempts from every process, including Chromium defaults such as the spellcheck dictionary download, component updates and Safe Browsing (Pitfall 19).

#### GitHub publishing and CI (REL-01)
- **D-18:** Phase 1 authors the CI workflows on GitHub Actions, as a matrix of `windows-latest` and `macos-latest` arm64. They cover lint, typecheck, unit tests, boundary lint, license scan, packaging and the packaged smoke test, and they are validated by running the equivalent package scripts locally. **Pushing to `origin` (`git@github.com:qmahmoudi74/danesh.git`), or changing the repository's visibility, needs explicit user authorization.** Plan a `checkpoint:human-action`: the user pushes, or authorizes a push, and confirms CI is green on both OSes. Until then REL-01 is reported "partially verified: workflows authored, not yet run on GitHub". Local `main` is already 6 planning commits ahead of `origin/main`; none have been pushed.

#### Engineering discipline formats (EVAL-05, EVAL-06, EVAL-07)
- **D-19:** ADRs live in `docs/adr/NNNN-kebab-title.md` as an MADR-style template with added sections:
  - **Spike evidence:** platforms actually run, fixtures, metrics, the pass policy written *before* the run, and the result.
  - **License.**
  - **Packaging.**
  - **Security.**

  Phase 1 ADRs:
  - 0001 process topology and IPC.
  - 0002 database driver (from S-PACKAGE).
  - 0003 packaging, fuses and signing approach.
  - 0004 project license, written only after D-LICENSE is decided.
- **D-20:** Acceptance scenarios are Gherkin `.feature` files, committed **before** the implementation they cover. Each scenario set covers the happy path, invalid input, edge cases, recovery, cancellation and persistence.
  - **UI-visible behavior:** `playwright-bdd` against the Electron test build.
  - **Non-UI behavior** (job kernel recovery, migrations, cancellation, IPC rejection, egress block): `@amiceli/vitest-cucumber`, or Vitest with explicit Given/When/Then structure.
- **D-21:** Write tests first (TDD) for this phase's deterministic cores:
  - Job/task state machine and boot-recovery pass.
  - Migration runner (checksum, backup, rollback, newer-schema refusal).
  - CAS atomic write.
  - IPC contract validation.
  - Egress policy.
  - Supervisor restart/backoff policy, using fake processes.
- **D-22:** The phase verification report lists every requirement as **verified**, **partially verified** or **blocked**, with evidence paths (test output, smoke JSON, screenshots, logs). Never invent pass rates. CI configuration or green unit tests alone are never presented as proof of a working installer.

#### Smoke-test engine probes (S-PACKAGE)
- **D-23:** The probe engines in the smoke test are **packaging probes, not product choices**. Each is chosen for license cleanliness and small size, not quality:
  - A tiny permissively licensed GGUF via `node-llama-cpp` in its own `utilityProcess`.
  - An OCR probe on one bundled image.
  - A TTS probe, also in its own `utilityProcess`. It must avoid espeak-ng (GPL) while D-LICENSE is open, for example sherpa-onnx pinned to 1.13.x with a voice or model that does not use the piper/espeak phonemizer, or `onnxruntime-node` running a tiny ONNX model.

  At most one ONNX Runtime may be loaded per process. Probe assets are bundled in Phase 1 builds under `resources/probes/` with license notices, within a size budget of **≤ 150 MB total**; removing them from production builds is revisited in Phase 12. Record the results in the S-PACKAGE ADR (0002/0003), including whether `node-llama-cpp` loads correctly inside `utilityProcess` from `app.asar.unpacked`. Its own docs only mention the main process.
  — **Reversibility:** reversible — probes sit behind engine-host adapters and are expected to be replaced by spike-chosen engines.
- **D-24:** If any probe cannot load in a packaged `utilityProcess` on either OS, stop and raise it as an architecture finding (`checkpoint:decision`) before continuing. Do not quietly move the engine into the main process. The research flags this as the failure that would force an architecture change.

### Claude's Discretion
These are follow-the-research defaults. The planner and executor may refine them, and must record any significant deviation in an ADR.
- **Monorepo tooling:** pnpm workspaces (pnpm 12.9.1 is installed locally) or npm workspaces, whichever packages more reliably with electron-builder and native modules. pnpm may need `node-linker=hoisted`.
- **Layout:** follow `.planning/research/ARCHITECTURE.md` §Recommended Project Structure: `apps/{main,preload,renderer,core}` and `packages/{contracts,domain,storage,engine-api,engines/*,...}`. Only create packages this phase needs.
- **Boundary lint:** dependency-cruiser or eslint-plugin-boundaries. Renderer must never import storage or engines; engines and domain must never import network APIs.
- **Versions:** follow the pins in `.planning/research/STACK.md`, re-checked at scaffold time. Electron 44.x, React 19, TypeScript 6.0.x (not 7), Vite 7.3.x with electron-vite 5 and `@vitejs/plugin-react` 5.2, electron-builder 26.x pinned explicitly, zod 4, Kysely, Vitest 5, Playwright, playwright-bdd. Verify `process.versions.node` inside Electron 44 at scaffold time; the research has a 24.18.1 vs 24.21.0 discrepancy.
- **Internals:** the RPC registry and contract design (a ~100-line typed channel map; no electron-trpc), supervisor/backoff parameters, the crash-injection mechanism, the fake-engine harness and log rotation sizes.
- **UI toolkit:** Tailwind 4 (logical properties only) and React Aria Components for the minimal shell and System check screen. i18n scaffolding (i18next) may be set up now, since full localization lands in Phase 3.

### Deferred Ideas (OUT OF SCOPE)
- **Library relocation UI** (choose and move the library or models folder): Phase 11 settings page (UX-06).
- **Opt-in update check:** Phase 12 (REL-05). In Phase 1 it exists only as a denied egress stub.
- **OS-level egress hardening** (macOS sandbox profile, Windows firewall rule for engine hosts): evaluate after S-PACKAGE, at the earliest Phase 11 or 12. Phase 1 relies on lint plus a network-blocked test.
- **Real code signing and notarization** (Developer ID, Windows Artifact Signing or OV/HSM): Phase 12 (REL-03, D-DISTRIB).
- **Verified support for Intel Macs and Windows arm64:** v2 (PLAT-V2-01).
- **Consent-gate UI** for web research and downloads: Phase 4 (downloads) and Phase 11 (web). Phase 1 only provides the default-deny policy and the broker skeleton.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Renderer sandboxed, context isolation, no Node, restrictive CSP, closed typed API | Sandboxed CJS preload + private MessagePort handoff, `app://` protocol with nonce CSP (R6, R7); fuse set forces `app://` instead of `file://` (R7) |
| PLAT-02 | Every IPC/RPC message schema-validated by the receiver, invalid rejected + logged locally | zod 4 contract registry in `packages/contracts`; validate in Core and in preload; log schema name + sender + error only (D-16); Port-level facts (R1, R6) |
| PLAT-03 | Heavy work in isolated processes; UI stays responsive | One utilityProcess per engine, Main-brokered ports (R1, R2, R3, R4); renderer heartbeat measurement under 3 concurrent engines p95 12.8 ms (R12) |
| PLAT-04 | Engine crash/OOM never takes down the app; task retriable; restart with backoff | Exit/OOM semantics measured (R8): V8 OOM = silent `exit 0`, no `error`/`child-process-gone`; supervisor treats any unrequested exit as crash |
| PLAT-05 | Default-deny egress, automated test with network blocked | Four-layer egress strategy verified (R9): webRequest cancel, proxy sink, Node guard in utility processes, process-tree endpoint sampling; sherpa-onnx rejected because its binary embeds espeak-ng (R13) |
| PLAT-06 | Versioned DB, forward-only migrations, refuse newer | In-house runner + `user_version`; readonly-probe refusal verified (R10) |
| PLAT-07 | Snapshot before migrate; failed migration leaves data intact and restorable | `VACUUM INTO ?` (bound param) semantics, WAL, restore (R10) |
| PLAT-08 | Content-addressed store with atomic writes | tmp + fsync + `link`/rename; Windows semantics measured (R10) |
| PLAT-11 | Works with Persian characters and spaces in profile/storage path | Packaged app run from a Persian+space install dir AND Persian+space userData: 4/4 engines pass (R5); NSIS MAX_PATH hazard (R5); Tier B real profile remains manual |
| JOB-03 | Jobs resume after restart/crash; no redo; no lost verified output | Claim/commit/boot-recovery kernel PoC with real SIGKILL injection (R10) |
| REL-01 | Public repo CI on Windows + macOS | Workflow skeleton with verified action majors; runner facts (Windows Server 2025, macOS 26 arm64, no macOS 13) |
| REL-02 | Packaged app passes smoke test on clean machines | Packaged probes verified on Windows (R5); smoke JSON design; macOS unverified |
| REL-08 | Own license chosen and recorded in an ADR before engine selection | Blocked on D-LICENSE checkpoint (D-01); ADR template ready |
| EVAL-05 | Each engine choice recorded in an ADR backed by a spike | ADR-with-spike template; S-PACKAGE seed evidence R1-R5 (must be re-run in-repo) |
| EVAL-06 | Acceptance scenarios defined before implementation | Gherkin organization + tags; vitest-cucumber fails on missing steps (R11); playwright-bdd verified (R11) |
| EVAL-07 | Verification report with evidence paths, no invented rates | Report schema + checker script (Node 24 runs `.ts` natively, R11) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Source: `D:/workspace/AI/danesh/.claude/CLAUDE.md` (read this session). Treated with the authority of locked decisions.

- **Stack:** Electron + React + TypeScript; all Danesh-owned code in TypeScript; no separately maintained backend.
- **Native engines:** only where they materially improve performance/accuracy, behind simple typed adapters (engines replaceable).
- **No Python** runtime or backend. No Docker, accounts, cloud services, or localhost AI servers.
- **Platforms:** Windows and macOS, each built and tested separately; untested platforms reported truthfully.
- **Local-first / Privacy:** no hidden external data transfers; offline after model download.
- **Performance:** heavy PDF/OCR/LLM/TTS work must not block Electron main or renderer; worker isolation, persistent checkpoints, bounded resources.
- **Security:** strict IPC validation, context isolation, no Node integration in the renderer, restrictive CSP.
- **Data integrity:** schemas/migrations versioned; model switches never destroy source data.
- **Engine selection:** no premature lock-in; research real platforms; ADRs. **Licensing:** accurate notices; public GitHub repo.
- **Agent conduct:** make reasonable technical choices and record trade-offs in ADRs; flag product-intent changes for review.
- **Authorization:** no pushing/publishing, connecting third-party accounts, deleting data, or destructive commands without explicit authorization (applies to D-18 push, and to any Tier B user-profile creation).
- **Phase discipline:** requirements, acceptance tests, implementation, actual verification, persistent status; phase completion is not v1 completion.
- **GSD workflow enforcement:** start file-changing work through a GSD command (`/gsd-execute-phase` for planned phase work).
- No project skills exist (`.claude/skills/` absent).

## Summary

The architecture in `.planning/research/ARCHITECTURE.md` is feasible exactly as designed on Windows 11 x64. In this session I built, packaged (electron-builder 26.17.0, unsigned NSIS), installed (silently, into a directory whose name contains Persian characters and spaces) and ran an Electron 44.7.0 app whose four isolated `utilityProcess` hosts all passed: a Core process (better-sqlite3 13.0.3, WAL, `synchronous=FULL`, `VACUUM INTO`), an LLM host (node-llama-cpp 3.22.1 + a 19 MB GGUF), an OCR host (tesseract.js 7.0.0, fully offline) and a TTS host (onnxruntime-node 1.30.0 running a Piper-format Persian voice, no espeak-ng). The same stack also works as a pnpm 12 hoisted workspace built by electron-vite 5.0.0 with extra main-process entries for Core and engine hosts. `process.versions.node` inside Electron 44.7.0 is **24.21.0** (the 24.18.1 in STACK.md is wrong). So D-24 (architecture finding) is **not triggered on Windows**; macOS is still unproven.

Several non-obvious findings change the plan and must be built in from day one: (1) `GrantFileProtocolExtraPrivileges` off (D-09) makes `loadFile()` of a renderer inside `app.asar` fail with `ERR_FILE_NOT_FOUND`, so the renderer must be served from a custom `app://` protocol handler, and React Aria Components injects a `<style>` that needs a per-response CSP nonce; (2) sandboxed preloads must be CommonJS, but electron-vite emits `.mjs` for `"type":"module"` packages unless told otherwise; (3) a V8 heap OOM inside a `utilityProcess` produces **no `error` event, no `child-process-gone` event and `exit` code 0**, so the supervisor must treat every exit it did not request as a crash; (4) `sherpa-onnx`'s native library statically embeds espeak-ng (GPL), so it cannot enter the Phase 1 lockfile under D-02 regardless of which voice is used, and the TTS probe must be onnxruntime-node; (5) NSIS silently drops files when the full install path exceeds 260 characters, which produced a runtime ENOENT in a long-path install, so the smoke test must verify the installed tree against a manifest and `asarUnpack` must be kept narrow; (6) default `userData` on Windows is `%APPDATA%` (Roaming), which conflicts with Pitfall 17.

**Primary recommendation:** Build Plan 01 as a walking skeleton on this verified stack (`apps/desktop` assembly package + electron-vite multi-entry + `app://` + CJS preload + Core utilityProcess + SQLite + one fake engine host), write its Gherkin first, and make every later plan extend that skeleton; keep the macOS risk (`.so` signing coverage, ad-hoc + hardened runtime) on an early CI feedback loop rather than a late surprise.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Window creation, CSP, permission/navigation lockdown, `app://` serving | Main (Frontend Server role) | Preload | Main owns `session`/`protocol`; nothing else may (verified: handler reads asar via `fs`, R7) |
| Typed RPC surface exposed to UI | Preload (private port) | Core (re-validates) | Port stays private in preload; Core is the authority for validation (PLAT-02) |
| Domain logic, SQLite single writer, migrations, job scheduler | Core utilityProcess | Database/Storage | D-14: Main never opens the DB (ARCHITECTURE Anti-Pattern 1) |
| Process supervision, restart/backoff, port brokering | Main | Core (consumer) | Only Main can call `utilityProcess.fork`; hosts cannot fork (utilityProcess is a Main API) |
| Engine compute (LLM/OCR/TTS probes) | Engine host utilityProcess (one per engine) | Core (client) | Crash/OOM blast radius = one host (R8) |
| Network egress policy | Egress broker module (skeleton) | Main (webRequest), Node guard per process | Single importer of network APIs; Chromium and Node enforcement are separate layers (R9) |
| CAS blob writes | Core | Database/Storage (filesystem) | Same process as the DB so blob write precedes the transaction (ARCHITECTURE Pattern 1) |
| Static assets (fonts, JS, CSS) | Main via `app://` | CDN/Static: none | No CDN at runtime (privacy); bundled Vazirmatn verified under CSP (R7) |
| Packaged smoke / fuse / codesign verification | Out-of-process runner script | In-app System check | Fuses are read from the binary with `@electron/fuses`; `codesign` is a CLI (R5) |

## Standard Stack

All versions checked against the npm registry on 2026-10-09 (`npm view`) and, where marked, exercised in the spike. Legitimacy verdict comes from `gsd-tools query package-legitimacy check`; every `SUS` below is the single reason `too-new` (the latest release was published within days of today) on a long-established package with millions of weekly downloads and an official source repo. Plan one consolidated `checkpoint:human-verify` (review pins + lockfile) rather than one per package.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron `[WARNING: flagged as suspicious (too-new) — verify before using.]` | 44.7.0 (exact) | Desktop shell | Chromium 152.0.7977.130, V8 15.2.124.28-electron.0, **Node 24.21.0**, N-API 10, ABI 149 `[VERIFIED: R1]`. Package has `scripts: {}` and downloads its binary lazily on first run `[VERIFIED: R1/R6]` |
| electron-vite | 5.0.0 | Build main/preload/renderer + extra entries | peers `vite ^5 \|\| ^6 \|\| ^7`, node `^20.19 \|\| >=22.12`; multi-entry via `build.rollupOptions.input` `[VERIFIED: R6]` |
| vite `[WARNING: too-new]` | 7.3.7 | Bundler | Latest is 8.3.4; electron-vite 5 peers stop at 7 `[VERIFIED: npm view electron-vite@5.0.0 peerDependencies]` |
| @vitejs/plugin-react `[WARNING: too-new]` | 5.2.0 | React transform | peers vite 4-8; 6.x needs vite 8 `[VERIFIED: npm view]` |
| react / react-dom `[WARNING: too-new]` | 19.3.0 | UI | Rendered under strict CSP `[VERIFIED: R7]` |
| typescript | 6.0.3 | Language | `typescript-eslint@8.71.1` peers `typescript >=4.8.4 <6.1.0`; 6.0.3 is the last 6.0.x. In TS 6.0 `@types/*` are **not** auto-included: set `"types": ["node"]` `[VERIFIED: R11 ran tsc]` |
| electron-builder | 26.17.0 (exact; dist-tag `v26`, `latest` still 26.15.3, `next` is 27 alpha) | Packaging | `electronFuses` option applies fuses right before signing `[VERIFIED: R5, app-builder-lib/out/platformPackager.js comment "the fuses MUST be flipped right before signing"]` |
| @electron/fuses | 2.1.3 | Read fuse wire in the smoke runner | `getCurrentFuseWire(path)` returns char codes (48 = disabled, 49 = enabled) indexed by `FuseV1Options` `[VERIFIED: R5]` |
| zod | 4.6.5 | IPC contracts | Bundles fine into preload (CJS) and Core `[VERIFIED: R6]` |
| better-sqlite3 | 13.0.3 | SQLite driver | N-API; **all platform prebuilds ship inside the npm package** (`prebuilds/{win32-x64,win32-arm64,darwin-arm64,darwin-x64,linux-*}.node`), so no download and no node-gyp; `exports` has per-platform subpaths `[VERIFIED: R10, tarball read]`; loads in plain Node 24 (Vitest) and in Electron utilityProcess `[VERIFIED: R1, R10]` |
| @types/better-sqlite3 | 9.6.0 | Types | better-sqlite3 13 ships no `.d.ts`; this version has `backup`/`serialize` `[ASSUMED: matches v13 API]` |
| kysely | 0.29.6 | Typed query builder (optional in Phase 1) | `SqliteDialect` + better-sqlite3 13 transactions/rollback verified `[VERIFIED: R10]`. Core keeps a synchronous `Db` interface for the job kernel; Kysely is a convenience layer |

### Probe engines (packaging probes only, D-23)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| node-llama-cpp `[WARNING: too-new]` | 3.22.1 | LLM probe | Works inside `utilityProcess` from `app.asar.unpacked`, ESM host `[VERIFIED: R2]`. Use `getLlama({ gpu: false, build: 'never', skipDownload: true })`. Its `postinstall` tries to build/download: block it |
| onnxruntime-node `[WARNING: too-new]` | 1.30.0 | TTS probe (own Piper-format VITS runner) | MIT. 288 MB unpacked for all platforms; package only `bin/napi-v6/<os>/<arch>`. `postinstall` downloads CUDA files on Linux only; set `ONNXRUNTIME_NODE_INSTALL=skip` `[VERIFIED: script read, R3]` |
| tesseract.js | 7.0.0 | OCR probe | Apache-2.0, WASM, runs in `worker_threads` inside the utilityProcess `[VERIFIED: R4]` |

### Supporting (test, lint, tooling)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 5.0.3 | Unit + non-UI Gherkin | peers vite `^6.4 \|\| ^7 \|\| ^8`, node `^22.12 \|\| ^24 \|\| >=26` `[VERIFIED: npm view]` |
| @amiceli/vitest-cucumber | 8.0.0 | Gherkin in Vitest | Fails on unmatched scenario/steps (good for "feature first") `[VERIFIED: R11]` |
| @playwright/test | 1.64.0 | Electron E2E (`_electron.launch`) | Test build only `[VERIFIED: R11]` |
| playwright-bdd | 9.2.1 | Gherkin → Playwright specs (`bddgen`) | `[VERIFIED: R11]` |
| eslint / typescript-eslint | 10.12.0 / 8.71.1 | Lint incl. `no-restricted-globals`, `no-floating-promises` | Flat config + `projectService` `[VERIFIED: R11]` |
| dependency-cruiser `[WARNING: too-new]` | 18.5.0 | Layer + network-import boundaries | Catches static and dynamic imports `[VERIFIED: R11]` |
| spdx-expression-parse / spdx-satisfies | 5.0.0 / 6.0.0 | Evaluate SPDX expressions in the license scan | Do not hand-parse `A OR B` `[VERIFIED: npm view; legitimacy OK]` |
| @types/node | 24.19.1 | Types matching Electron's Node 24 | Latest tag is 26.x; stay on 24 `[VERIFIED: npm view]` |
| tailwindcss + @tailwindcss/vite | 4.3.3 | Logical-property styling | Verified rendering (padding-inline-start) under CSP `[VERIFIED: R7]` |
| react-aria-components | 1.22.0 | Accessible primitives | **Needs CSP nonce** (injects a `<style>`) `[VERIFIED: R7]` |
| @fontsource-variable/vazirmatn | 5.3.0 | Bundled Persian font (OFL-1.1) | Persian + Latin woff2 subsets load offline `[VERIFIED: R7]` |
| i18next / react-i18next | 26.4.2 / 17.0.16 | i18n scaffold | Optional now |
| pnpm | 12.9.1 (12.10.1 is latest) | Workspaces | `nodeLinker: hoisted` + explicit `allowBuilds` `[VERIFIED: R6]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| onnxruntime-node TTS probe | sherpa-onnx-node 1.13.8 | **Rejected for Phase 1**: `sherpa-onnx-c-api.dll` contains espeak-ng strings (`Failed to initialize espeak-ng with data dir`, `ESPEAK_DATA_PATH`) so GPL code ships in the binary regardless of voice `[VERIFIED: R13]`. Revisit only after D-LICENSE allows GPL/AGPL or sherpa 2.0 removes espeak |
| better-sqlite3 | `node:sqlite` | Available flagless in Electron 44's Node 24.21.0 utilityProcess with `DatabaseSync`, `StatementSync`, `Session`, `constants`, `backup` `[VERIFIED: R1]`; Stability 1.2 (release candidate) `[CITED: nodejs.org/docs/latest-v24.x/api/sqlite.html]`; no transaction helper, no Kysely built-in dialect. Recommend better-sqlite3 for ADR 0002; keep `Db` adapter |
| dependency-cruiser + ESLint | eslint-plugin-boundaries 7.2.0 | Redundant once dep-cruiser enforces layers; ESLint covers `fetch`/`XMLHttpRequest` globals which no import graph tool sees |
| Kysely `Migrator` | In-house runner | Kysely's migrator has no checksum guard, no pre-migration backup hook, no newer-schema refusal; D-14 needs all three. Use an in-house ~120-line runner |
| `tsx` | Node 24 native type-stripping | `node tools/x.ts` runs erasable TypeScript directly `[VERIFIED: R11]`; skip an extra dependency for `tools/*.ts` |
| pnpm | npm workspaces | npm 12 blocks install scripts by default too (`allowScripts` warning) `[VERIFIED: R1]`; pnpm hoisted + electron-builder verified `[VERIFIED: R6]`. Either works; pnpm chosen (CONTEXT) |

**Installation (root `pnpm-workspace.yaml` + `apps/desktop/package.json`):**
```yaml
# pnpm-workspace.yaml  (verified shape, R6)
packages: [apps/*, packages/*]
nodeLinker: hoisted
allowBuilds:
  esbuild: true            # needed by vite/electron-vite
  node-llama-cpp: false    # its postinstall builds/downloads llama.cpp: never run it
  electron-winstaller: false
  onnxruntime-node: false  # (add if pnpm reports it) postinstall only downloads Linux CUDA files
```
```bash
# environment for every install and CI step
NODE_LLAMA_CPP_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip pnpm install --frozen-lockfile
```
Without explicit `allowBuilds` entries pnpm 12 aborts with `ERR_PNPM_IGNORED_BUILDS` `[VERIFIED: R6]`.

**Version verification:** `npm view <pkg> version` run 2026-10-09 for every package in the tables; the electron/vite/plugin-react/typescript/electron-builder pins are the newest versions inside the lines allowed by the peer ranges, confirmed with `npm view <pkg> versions`.

## Package Legitimacy Audit

Run: `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-10-09 (36 packages).

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|--------------|-------------|---------|-------------|
| electron-vite, typescript, electron-builder, @electron/fuses, playwright-bdd, @amiceli/vitest-cucumber, better-sqlite3, tesseract.js, eslint-plugin-boundaries (not adopted), tailwindcss, @tailwindcss/vite, @fontsource-variable/vazirmatn, i18next, spdx-expression-parse, spdx-satisfies | npm | long-established | 44K to 305M | official GitHub orgs | OK | Approved |
| electron, vite, @vitejs/plugin-react, react, react-dom, vitest, @playwright/test, zod, kysely, node-llama-cpp, onnxruntime-node, dependency-cruiser, eslint, typescript-eslint, @types/node, @types/react, @types/react-dom, react-aria-components, react-i18next, tsx (not adopted), @electron/asar (not adopted) | npm | long-established | 0.3M to 456M | official GitHub orgs | SUS (`too-new`: latest version published within days) | Flagged. One consolidated `checkpoint:human-verify` before first `pnpm install`; pin exact versions; review lockfile |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** the 21 listed above (all `too-new`). The planner inserts a single human-verify checkpoint covering the exact pins in this document.
**Not packages but supply-chain relevant:** `sherpa-onnx-node` (Apache-2.0 label, GPL code embedded in the binary) is **excluded**; `@node-llama-cpp/win-x64-cuda*` (169 MB + 351 MB), `-vulkan`, `-arm64` are excluded from the Phase 1 package by `files` filters. Install-script review: `better-sqlite3` (none needed), `node-llama-cpp` postinstall (blocked), `onnxruntime-node` postinstall (Linux CUDA download only; blocked), `tesseract.js` postinstall (`opencollective-postinstall`, message only), `electron-winstaller` (7z arch select; blocked) `[VERIFIED: script reads, R1/R6]`.

## Spike Evidence (research session, seed for ADRs 0001-0003)

Everything below was executed on **Windows 11 Pro 10.0.29683, x64, Node 24.21.0, pnpm 12.9.1, npm 12.2.0** on 2026-10-09 in scratch directories outside the repo. **macOS: nothing executed.** These runs are a seed: ADR spike evidence must be re-run from in-repo scripts with the pass policy written before the run (D-19). `[VERIFIED: Rn]` tags in this file refer to this table.

| ID | What was run | Result |
|----|--------------|--------|
| R1 | Electron 44.7.0 main + `utilityProcess.fork` Core; better-sqlite3 13.0.3 and `node:sqlite` required inside it; `MessageChannelMain` port to Core | `process.versions` = electron 44.7.0, node **24.21.0**, chrome 152.0.7977.130, v8 15.2.124.28-electron.0, napi 10, modules 149. better-sqlite3 OK (SQLite 3.53.4); `node:sqlite` OK flagless, exports `DatabaseSync, StatementSync, Session, constants, backup`. `ELECTRON_RUN_AS_NODE=1` was set in the agent shell and made `electron` run as plain Node until unset |
| R2 | node-llama-cpp 3.22.1 + `ggml-org/tiny-llamas` `stories15M-q4_0.gguf` (19,077,344 bytes, sha256 `6151b1929d7f5aa3385d9ddef3393e55587c0a55de661562322bc51dfda93a04`, repo commit `99dd1a73db5a37100bd4ae633f4cfce6560e1567`) in utilityProcess, dev and packaged | Loads and generates 24 tokens at temperature 0 (`", there was a little girl named Lily. She loved to play outside in the park. One day, she saw"`). First dev load took 19 s (Defender scan); packaged 0.6-4.5 s |
| R3 | onnxruntime-node 1.30.0 + `MahtaFetrat/Mana-Persian-Piper` `fa_IR-mana-medium.onnx` (63,531,379 bytes, sha256 `e390c0e74ba71fd97c49ba662ee0c6e1724b462ba2d4561698af4f564840f126`, commit `ad9dd8518bedf517bd7cbc9f63b8e5c844bf5bc0`), fed hand-picked phoneme IDs (inputs `input`, `input_lengths`, `scales`; output `output`), dev and packaged | 7,936 samples (0.36 s at 22.05 kHz) with `scales=[0,1,0]`, finite, peak 0.004, same-machine hash stable; no espeak-ng involved |
| R4 | tesseract.js 7.0.0 offline (`langPath`, `gzip:false`, `cacheMethod:'none'`) + `eng.traineddata` (tessdata_fast commit `87416418657359cb625c412a48b6e1d6d41c29bd`, 4,113,088 bytes, sha256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`) on a generated PNG | Recognized `Danesh OCR`; second word of the image was mis-read, so assert on a fuzzy first-word match, not the whole string. Zero network attempts under the Node guard |
| R5 | electron-builder 26.17.0 (npm layout): `asarUnpack`, `electronFuses`, NSIS; packaged run with Persian+space `userData`; second run from a Persian+space install directory (copy); silent NSIS install into `...\دانش نصب`; `--user-data-dir` switch | All four hosts pass in all cases. Fuse read-back via `@electron/fuses` matched config. Installer 223 MB, build 45 s, silent install 20-28 s. **A first install into a deep path lost 3 files (path > 260) and the LLM host failed with ENOENT**; second install into a short Persian path lost none. Silent install exits `2` when another install of the same app exists elsewhere. Standard Chromium `--user-data-dir=<Persian path>` relocates userData in a production-fuse build |
| R6 | pnpm 12.9.1 hoisted workspace (`apps/{main,preload,renderer,core,desktop}`, `packages/{contracts,engine-llm}`), electron-vite 5.0.0 + vite 7.3.7 + plugin-react 5.2.0 + TS 6.0.3, packaged with electron-builder | `main.build.rollupOptions.input` object emits `out/main/{index,core,engine-llm}.js` (ESM); preload emitted `index.mjs` until forced to CJS; workspace packages in `devDependencies` are bundled, `dependencies` are externalized; sandboxed renderer ↔ private MessagePort ↔ Core ↔ SQLite ping returned `{pong:42}`; `typeof require/process` in page = `undefined`; packaged build passed |
| R7 | `GrantFileProtocolExtraPrivileges` off + `win.loadFile` from asar; `protocol.handle('app')` + `fs.readFile`; React 19.3 + Tailwind 4.3.3 + Vazirmatn + React Aria 1.22 under `default-src 'none'; script-src 'self'; style-src 'self'...` | `loadFile` → `ERR_FILE_NOT_FOUND` with fuse off; works with fuse on. `app://danesh/` handler works with fuse off, CSP header applied, traversal and external fetch fail. React `style={}` props are fine; **React Aria's injected `<style>` is blocked** until a per-response nonce is supplied via `<meta property="csp-nonce">` + `style-src 'self' 'nonce-…'` (zero violations after) |
| R8 | utilityProcess crash modes: `exit(137)`, `throw`, `abort()`, `kill()`, `taskkill /F`, `process.kill(pid,'SIGKILL')`, busy loop + `kill()`, V8 heap OOM, kill of Main | `exit` codes: 137 / 1 / 134 / 0 (graceful kill) / 1 / 1 / 0. `child-process-gone` reasons seen: `crashed` for 137 and 134, `killed` for exit 1. **V8 heap OOM: `exit` code 0, no `error` event, no `child-process-gone`**. `execArgv:['--max-old-space-size=64']`, `NODE_OPTIONS` and `v8.setFlagsFromString` do not bound the heap (limit stayed 4192 MB; a runaway allocation took ~3 GB) but **`execArgv:['--js-flags=--max-old-space-size=64']` does** (OOM in 371 ms). `kill()` stops a spinning process in 6 ms. After SIGKILL of Main the Core child was gone within 3 s (no orphan) |
| R9 | Egress: `--proxy-server` recording sink + `<-loopback>` bypass; `webRequest.onBeforeRequest` cancel; Node guard in a utilityProcess; engine probes under the guard; PowerShell endpoint sampling | Idle packaged/dev window for 8-12 s: zero requests at the sink, zero TCP connections and zero UDP endpoints owned by the 4-process tree. Positive control (`net.fetch('https://example.com')`) produced `CONNECT example.com:443` at the sink. `webRequest` filter cancelled `net.fetch` and renderer `fetch` (hostname and IP literal) with `ERR_BLOCKED_BY_CLIENT`. Guard denied and recorded `fetch`, `https.get`, `net.connect`, `dns.lookup`; LLM, OCR and TTS probes made **zero** attempts |
| R10 | SQLite/FS semantics, Kysely, kernel PoC | `VACUUM INTO` captured WAL-committed rows, preserved `user_version`, output journal mode `delete`, refuses inside a transaction and onto an existing file, accepts a **bound parameter** (`VACUUM INTO ?`) with a Persian + `'` path; `db.backup()` output keeps WAL mode and `user_version`; raw header offset 60 shows stale `user_version` (0) until `wal_checkpoint(TRUNCATE)` (then 9); `new Database(p,{readonly:true,fileMustExist:true})` reads the correct `user_version` from a WAL-state crash copy and rejects writes (`SQLITE_READONLY`). Windows: directory `fsync` → `EPERM`; `rename` over an existing file works; `rename` over a file this process holds open → `EPERM`; `fs.link` works; 404-char paths work. Kernel PoC: 12 tasks, SIGKILL at `after-blob:5` and `after-claim:9`, recovery requeued 1 orphan each time, final 12 done, `exec_log` 12 rows / 12 distinct tasks, 0 tmp leftovers |
| R11 | Test/lint stack | playwright-bdd 9.2.1 + @playwright/test 1.64.0 `_electron.launch({executablePath})` against a packaged build with the inspect fuse on: 1 scenario passed (Playwright fixture deleted `ELECTRON_RUN_AS_NODE`). Vitest 5.0.3 + vitest-cucumber 8.0.0 + TS 6.0.3: scenario passed. dependency-cruiser 18.5.0 flagged `https`/`net` (static and `import()`), `undici`, and renderer→storage; ESLint 10.12.0 `no-restricted-globals` flagged `fetch`; dep-cruiser rejects "unsafe" regexes such as `(/.*)?$`. TS 6.0.3 needs explicit `types` |
| R12 | Renderer `setInterval(50)` heartbeat in a hidden window (`backgroundThrottling:false`) while LLM, OCR, TTS hosts ran concurrently | 168 samples over ~8 s: lateness p50 -2.9 ms, p95 12.8 ms, p99 13.5 ms, max 13.8 ms |
| R13 | Binary string scan of `sherpa-onnx-win-x64@1.13.8` | `sherpa-onnx-c-api.dll` contains `espeak-ng` init/error strings and `ESPEAK_DATA_PATH` (65 matches); `onnxruntime.dll` none |
| R-p2p | Main creates one `MessageChannelMain`, sends `port1` to a Core utilityProcess and `port2` to a host utilityProcess; host posts a 1 MiB `Uint8Array` | Message arrived (`bytes:1048576`). Passing `[buf.buffer]` as a transfer list threw `TypeError: Port at index 0 is not a valid port`: `MessagePortMain` transfer lists accept ports only |
| R-paths | `app.getPath()` in a dev Electron on Windows | `appData` = `C:\Users\<u>\AppData\Roaming`, `userData` = `...\Roaming\Electron`, `sessionData` = same, `logs` = `...\Roaming\Electron\logs`, `crashDumps` = `...\Roaming\Electron\Crashpad`, `temp` = `...\AppData\Local\Temp` |
| R14 | `pnpm licenses list --json` from a workspace member dir, on the R6 tree | Works (root dir returned `{}`); groups by SPDX: MIT 293, ISC 30, BSD-3 10, Apache-2.0 8, BlueOak-1.0.0 7, BSD-2 6, plus `CC-BY-4.0` (caniuse-lite), `WTFPL` (truncate-utf8-bytes, sanitize-filename `WTFPL OR ISC`, utf8-byte-length `WTFPL OR MIT`), `0BSD`, `Python-2.0`, `(MIT OR CC0-1.0)`, `(BSD-2-Clause OR MIT OR Apache-2.0)` |

## Architecture Patterns

### System Architecture Diagram

```
 USER ──> Danesh window (Persian RTL, app://danesh/index.html, sandbox, CSP+nonce)
            │ preload (CJS, sandboxed): holds MessagePort PRIVATELY, exposes window.danesh.call()
            │ private MessagePort (brokered once by Main; transfer-list = ports only)
            ▼
 ┌──────────────────────────────── MAIN (thin; never opens DB) ─────────────────────────────┐
 │ app:// handler (fs.readFile in asar, traversal check, nonce) · session.webRequest cancel │
 │ will-navigate/open/permission lockdown · single-instance lock · supervisor (backoff)     │
 │ forks Core + each Engine Host; creates MessageChannelMain pairs and hands out ends       │
 └───────┬───────────────────────────────┬───────────────────────────────┬──────────────────┘
         │ fork + port                   │ fork + port (Core<->host)     │ fork + port
         ▼                               ▼                               ▼
 ┌─────────────── CORE utilityProcess ───────────┐   ┌── ENGINE HOSTS (1 process each) ──┐
 │ RPC server (zod strict) → services            │   │ llm-host  (node-llama-cpp, ESM)   │
 │ Db interface → better-sqlite3 (WAL, FULL)     │◄─►│ ocr-host  (tesseract.js, worker)  │
 │ migration runner (checksum, VACUUM INTO)      │   │ tts-host  (onnxruntime-node)      │
 │ job kernel: claim → compute → txn(out+done)   │   │ fake-host (tests / skeleton)      │
 │ CAS blobs (tmp → fsync → link/rename)         │   │ NO db handle, NO sockets          │
 │ egress broker skeleton (empty allowlist)      │   └───────────────────────────────────┘
 └───────────────────────┬───────────────────────┘
                         ▼
   userData/ danesh.db(+wal) index.db blobs/sha256/.. backups/ tmp/ logs/ models/
   (override userData to %LOCALAPPDATA% on Windows: see Open Question 1)

 Enforcement of "zero egress":  L1 session.webRequest cancel+log (Chromium)  ·  L2 --proxy-server sink (test)
                                L3 Node egress guard in Core/hosts           ·  L4 process-tree endpoint sampler (test)
 Build outputs: out/main/{index,core,engine-*}.js (ESM) · out/preload/index.cjs · out/renderer/*
 Verification: Tier A (CI packaged smoke JSON) → Tier B (human runbook on clean machines)
```

### Recommended Project Structure
```
danesh/
├── apps/
│   ├── main/            # source package: lifecycle, supervisor, app:// handler, port broker
│   ├── preload/         # source package: CJS preload (contextBridge + private port)
│   ├── renderer/        # source package: React shell + System check screen
│   ├── core/            # source package: utilityProcess entry, RPC server, kernel wiring
│   └── desktop/         # ASSEMBLY package: electron.vite.config.ts, electron-builder*.yml,
│                        #   playwright config, smoke runner. Lists native deps in `dependencies`
│                        #   and all workspace packages in `devDependencies` (bundled)
├── packages/
│   ├── contracts/       # zod schemas, RPC map, engine-host protocol, smoke-report schema
│   ├── domain/jobs/     # pure FSM, backoff policy, boot recovery decisions
│   ├── storage/         # Db interface + better-sqlite3 adapter, migrations/*.sql, CAS, backup
│   ├── egress/          # ONLY importer of network APIs (skeleton, empty allowlist)
│   ├── engine-api/      # EngineHost protocol + fake engine + conformance tests
│   └── engines/{llm-probe,ocr-probe,tts-probe}/src/host.ts   # one entry per host
├── features/            # Gherkin: ui/*.feature (playwright-bdd), core/*.feature (vitest-cucumber)
├── docs/adr/            # 0000-template.md, 0001..0004
├── tools/               # license-scan.ts, fetch-probes.ts, smoke runner, check-report.ts (run with `node x.ts`)
├── resources/probes/    # gitignored; fetched with pinned sha256; NOTICE committed
└── .github/workflows/ci.yml
```
Rationale: electron-vite accepts entries from outside its root (R6), so source packages stay boundary-lint friendly while one assembly package owns build and packaging. Only create packages Phase 1 needs.

### Pattern 1: Multi-entry electron-vite config (verified)
**What:** Core and every engine host are additional entries of the **main** build; preload is forced to CJS.
```ts
// apps/desktop/electron.vite.config.ts   [VERIFIED: R6]
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
const r = (p: string) => resolve(import.meta.dirname, p);
export default defineConfig(({ mode }) => ({
  main: {
    define: { __TEST_HOOKS__: JSON.stringify(mode === 'test') },     // tree-shaken from production
    build: { rollupOptions: { input: {
      index: r('../main/src/index.ts'), core: r('../core/src/index.ts'),
      'engine-llm': r('../../packages/engines/llm-probe/src/host.ts'),
      'engine-ocr': r('../../packages/engines/ocr-probe/src/host.ts'),
      'engine-tts': r('../../packages/engines/tts-probe/src/host.ts'),
    } } },
  },
  preload: { build: { rollupOptions: {                                  // sandbox => CJS only
    input: { index: r('../preload/src/index.ts') },
    output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { root: r('../renderer'), plugins: [react()],
    build: { rollupOptions: { input: { index: r('../renderer/index.html') } } } },
}));
```
`apps/desktop/package.json` must have `"type": "module"`, `"main": "out/main/index.js"`, native modules in `dependencies` (externalized), workspace packages in `devDependencies` (bundled). Fork paths use `join(import.meta.dirname, 'core.js')`. Silence the cosmetic zod `@__PURE__` Rollup warnings with an `onwarn` filter.

### Pattern 2: Port brokering (Main creates, Core/hosts/renderer receive) (verified)
```ts
// main: renderer <-> core and core <-> host. [VERIFIED: R1, R6, p2p run]
const { port1, port2 } = new MessageChannelMain();
core.postMessage({ type: 'renderer-port' }, [port2]);
win.webContents.postMessage('danesh:port', null, [port1]);   // only after senderFrame origin == app://danesh
// preload (sandboxed CJS): ipcRenderer.on('danesh:port', e => { port = e.ports[0]; ... })  keep it private
// core:  process.parentPort.on('message', e => { const [port] = e.ports; port.on('message', ...); port.start(); })
```
Facts: `MessagePortMain.postMessage` accepts only ports in the transfer list. Passing an `ArrayBuffer` throws `Port at index 0 is not a valid port` `[VERIFIED: R-p2p]`, so large payloads travel as blob/tmp references (matches ARCHITECTURE "large payloads never ride IPC"); structured clone of a 1 MiB `Uint8Array` works. `utilityProcess` is a Main-process API `[ASSUMED: A12]`, so Main forks all hosts and brokers every Core↔host port.

### Pattern 3: `app://` protocol with nonce CSP (verified; required by D-09)
```ts
// [VERIFIED: R7]  register before ready:
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
// after ready:
protocol.handle('app', async (req) => {
  const u = new URL(req.url); if (u.host !== 'danesh') return new Response('bad host', { status: 400 });
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const full = normalize(join(rendererRoot, p));
  if (!full.startsWith(rendererRoot + sep)) return new Response('forbidden', { status: 403 });
  let body = await readFile(full);                       // asar-aware fs; do NOT use net.fetch(file://)
  const nonce = randomBytes(16).toString('base64');
  if (extname(full) === '.html') body = Buffer.from(body.toString('utf8').replace('__CSP_NONCE__', nonce));
  return new Response(body, { headers: { 'content-type': mime(full),
    'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
});
// index.html:  <meta property="csp-nonce" content="__CSP_NONCE__">   (React Aria reads this)
```
In dev (`electron-vite dev`) the renderer comes from the Vite dev server; relax CSP and allow loopback only when `!app.isPackaged`, never in the packaged build.

### Pattern 4: Supervisor = pure policy + injectable spawner (D-21)
```ts
// packages/domain/jobs: pure, unit-testable with fake processes and a fake clock
export interface Spawner { spawn(kind: string): ChildHandle }              // wraps utilityProcess.fork
export interface ChildHandle { onExit(cb: (code: number | null) => void): void; kill(): void; postMessage(m: unknown, t?: unknown[]): void }
export const backoffMs = (restart: number, o = { base: 250, cap: 15_000 }) => Math.min(o.cap, o.base * 2 ** restart);
// RULE: any exit the supervisor did not request is a crash, whatever the code. [VERIFIED: R8 — V8 OOM exits 0]
// On crash: mark in-flight tasks retriable (state queued, attempt+1; over max_attempts -> quarantined),
// respawn after backoffMs(n), reset n after a stable period, open a circuit (degraded) after K crashes/window.
```
Do not rely on `child-process-gone.reason` (`killed` was reported for exit 1, `crashed` for 137/134, nothing for OOM).

### Pattern 5: Forward-only migration runner (in-house, ~120 lines)
- Files `packages/storage/migrations/0001_init.sql`...; table `schema_migration(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT`; checksum = sha256 of the file bytes with `\r\n` normalized to `\n` (git autocrlf on Windows).
- **Refuse-newer probe:** open with `new Database(p, { readonly: true, fileMustExist: true })`, read `PRAGMA user_version` and the max `schema_migration.id`; refuse (Persian message, no read-write open) if either exceeds what this build knows, or if any applied checksum differs. Works on a WAL-state crashed copy `[VERIFIED: R10]`. Do not parse the raw header (offset 60 is stale until a checkpoint).
- **Backup:** `db.prepare('VACUUM INTO ?').run(tmpPath)` into `tmp/`, then rename into `backups/danesh-v{N}-{ISO}.db`; must be outside a transaction and the target must not exist; keep last 3 `[VERIFIED: R10]`. `index.db` is rebuildable: mark for rebuild, do not back up.
- **Apply:** one `BEGIN IMMEDIATE` per migration: run SQL, insert `schema_migration`, `PRAGMA user_version = N` (inside the transaction), `PRAGMA foreign_key_check` must return zero rows, `COMMIT`; then `PRAGMA wal_checkpoint(TRUNCATE)`. On failure `ROLLBACK`, open read-only recovery state, surface the backup path.
- Pragmas at open: `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`; STRICT tables.

### Pattern 6: CAS atomic write (Windows-measured)
1. Stream to `tmp/<hash>.<pid>.<rand>`, hashing while writing; `fsync` the file; close.
2. Publish with `fs.link(tmp, final)` (fails `EEXIST` atomically; both NTFS and APFS support it), then `unlink(tmp)`. If `link` is unsupported, `rename`, treating `EEXIST`/`EPERM`/`EBUSY`/`EACCES` as "verify the existing file's hash, then success" or a bounded retry with backoff (antivirus locks).
3. **Skip directory `fsync` on `win32`** (`EPERM`); do it on POSIX.
4. Boot sweep clears `tmp/`; orphan blobs are GC-able (a blob written before the transaction is harmless).
`[VERIFIED: R10]`

### Pattern 7: Durable task claim/commit/recovery (PoC-verified SQL)
```sql
-- claim (single writer):  UPDATE task SET state='running', attempt=attempt+1, boot_id=:boot
--   WHERE task_id=(SELECT task_id FROM task WHERE job_id=:j AND state='queued' ORDER BY task_id LIMIT 1)
--   RETURNING task_id, unit_key, attempt;
-- commit (ONE transaction): INSERT INTO exec_log(task_id,attempt) ...; UPDATE task SET state='done', output_ref=:hash WHERE task_id=:id;
-- boot recovery:  UPDATE task SET state='queued' WHERE state='running' AND boot_id IS NOT NULL AND boot_id != :currentBoot;
--   then tasks with attempt >= max_attempts -> 'quarantined'; sweep tmp/.
-- idempotent fan-out: INSERT OR IGNORE INTO task(job_id, unit_key, state) ...  with UNIQUE(job_id, unit_key)
```
`[VERIFIED: R10]` (SIGKILL at after-claim and after-blob; every chunk's `exec_log` row exists exactly once). The deterministic "no redo" proof is `exec_log(task_id, attempt)` written in the same transaction as the `done` flip, asserted to have one row per completed task.

### Pattern 8: Egress, four layers
- **L1 (production, Chromium):** `session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*'] }, (d, cb) => { log(host only); cb({ cancel: true }); })`; also `session.setSpellCheckerEnabled(false)`, deny all permission requests. Cancelled `net.fetch` and renderer `fetch` incl. IP literals `[VERIFIED: R9]`.
- **L2 (test):** launch with `--proxy-server=http://127.0.0.1:<sink>` and `--proxy-bypass-list=<-loopback>`; assert the sink log is empty after the E2E scenario; include a positive control (`net.fetch` to example.com must appear) `[VERIFIED: R9]`.
- **L3 (production defense in depth + test):** `egress-guard` imported first in Core and every host; it denies and records `net.Socket.connect`, `dns.*`, `tls.connect`, `http(s).request`, global `fetch`; allow IPC pipes (`path`). Caught all four vectors; probes made zero attempts `[VERIFIED: R9]`. It cannot see sockets opened by native code, hence L4.
- **L4 (test):** sample TCP connections and UDP endpoints owned by the app's process tree every ~150 ms (Windows `Get-NetTCPConnection`/`Get-NetUDPEndpoint`; macOS `lsof -nP -iTCP -iUDP -a -p <pids>`) for the whole scenario; assert none to non-loopback addresses; include a positive control. Idle Windows run: 4 processes, no endpoints `[VERIFIED: R9]`; macOS command is `[ASSUMED]`.
- Optional hardening (Windows Firewall rule + "Filtering Platform Packet Drop" audit events, macOS pf) stays deferred per CONTEXT.

### Anti-Patterns to Avoid
- **`win.loadFile()` of asar content with the file-protocol fuse off:** fails (R7). Use `app://`.
- **ESM preload with `sandbox: true`:** Electron runs sandboxed preloads as plain JS without an ESM context `[CITED: electronjs.org/docs/latest/tutorial/esm]`.
- **Treating `exit` code 0 as success** (V8 OOM exits 0, graceful `kill()` exits 0, R8).
- **Real OOM tests with default heap limits:** a runaway allocation consumed ~3 GB; `windows-latest` has 16 GB and `macos-latest` only 7 GB. Use the `--js-flags` bound.
- **Unpacking whole packages** (`node-llama-cpp/**`): inflates the tree and exposes MAX_PATH loss (R5). Unpack native binary directories only.
- **Importing `@node-llama-cpp/win-x64-cuda*`, `-vulkan`, other-OS packages into the installer** (169/351/71 MB).
- **Giving engine hosts a DB handle or sockets** (ARCHITECTURE Anti-Patterns 2, 7).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IPC schema validation | Manual type guards | zod 4 schemas in `packages/contracts`, `.strict()` objects, max sizes | Types and validators from one source; PLAT-02 |
| Fuse flipping and reading | Binary patching | `electronFuses` in electron-builder + `@electron/fuses` `getCurrentFuseWire` | Must happen right before signing; read-back is trivial |
| SPDX expression evaluation | Regex over license strings | `spdx-expression-parse` + `spdx-satisfies` | `A OR B`, `(A AND B)`, `WITH` exceptions (R14 tree has `WTFPL OR ISC`) |
| Gherkin parsing/execution | Custom feature runner | playwright-bdd (UI) + @amiceli/vitest-cucumber (core) | Missing-step detection is the "feature first" gate |
| Import graph boundary checks | grep scripts | dependency-cruiser (+ ESLint for globals) | Catches dynamic imports; handles TS paths |
| Renderer script/style serving | Custom file server | `protocol.handle('app')` (one 20-line handler) | Needed anyway; do not add an HTTP server (no localhost servers) |
| SQLite backup | `fs.copyFile` of `.db` | `VACUUM INTO ?` or `db.backup()` | Raw copy while WAL is active is inconsistent (Pitfall 11) |
| Fake engine for crash tests | Real engines in unit tests | One `fake-engine` host with injectable faults (`exit0`, `abort`, `spin`, `slow`, `oom` via `--js-flags`) | Deterministic, CI-safe |

**Key insight:** the genuinely custom pieces are small and pure (state machine, backoff, migration ordering, CAS publish, nonce CSP). Everything with edge cases (fuses, signing, SPDX, Gherkin, import graph) has a tool that was exercised in this session.

## Runtime State Inventory

Not applicable. Phase 1 is greenfield (no rename/refactor/migration of existing state). Nothing found in any of the five categories: stored data (none), live service config (none), OS-registered state (none; the spike's NSIS test entries were uninstalled and the HKCU uninstall hive was checked clean), secrets/env vars (none; note the agent shell exports `ELECTRON_RUN_AS_NODE=1`, which must be unset for any Electron launch), build artifacts (none in repo).

## Common Pitfalls

### Pitfall 1: `ELECTRON_RUN_AS_NODE=1` in the shell
**What goes wrong:** `electron .`/`electron-vite dev`/Playwright launch Electron as plain Node; `require('electron').app` is `undefined`.
**Why:** the agent shell exports it `[VERIFIED: R1]`. The production `RunAsNode` fuse off also ignores it, hiding the issue in packaged runs.
**Avoid:** `env -u ELECTRON_RUN_AS_NODE` in scripts, `delete env.ELECTRON_RUN_AS_NODE` in the Playwright fixture and the smoke runner.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'whenReady')`.

### Pitfall 2: File-protocol fuse off breaks `file://` from asar
See Pattern 3 `[VERIFIED: R7]`. **Warning sign:** `ERR_FILE_NOT_FOUND` for a path that exists inside `app.asar`.

### Pitfall 3: Sandboxed preload emitted as `.mjs`
electron-vite 5 emits `out/preload/index.mjs` for `"type":"module"` `[VERIFIED: R6]`; sandboxed preloads need CJS. **Avoid:** `output: { format:'cjs', entryFileNames:'[name].cjs' }` and load `index.cjs`. **Warning sign:** `preload-error` event / `window.danesh` undefined.

### Pitfall 4: pnpm 12 / npm 12 build-script policy
`ERR_PNPM_IGNORED_BUILDS` aborts install until every script-bearing dependency has an explicit `allowBuilds` entry `[VERIFIED: R6]`; npm 12 prints `install-scripts blocked`. node-llama-cpp's postinstall would otherwise try to build llama.cpp from source `[VERIFIED: source read]`.

### Pitfall 5: NSIS silently drops files past MAX_PATH (260)
Installed tree lost 3 of 588 files at a long path; failure surfaced only at runtime (R5). **Avoid:** narrow `asarUnpack` to native binary dirs, keep `node-llama-cpp/llama/gitRelease.bundle` out, smoke test compares installed `resources/` file list + hashes against a build-time manifest and fails on any difference. Silent installs exit `2` when another install of the same appId exists elsewhere; uninstall the old one first in CI/Tier B scripts.

### Pitfall 6: tesseract.js in Node picks the WASM core at runtime
`getCore.js` chooses `relaxedsimd`, `simd` or plain by CPU feature detection and `require`s `tesseract.js-core/tesseract-core-<variant>`; excluding variants from `files` caused `Cannot find module` (R4/R5). It requested the non-LSTM cores. **Avoid:** ship `tesseract-core.*`, `-simd.*`, `-relaxedsimd.*` (`.js` + `.wasm`; `*.wasm.js` and `-lstm` variants were not needed: 11 MB unpacked), unpack the directory, and pass `langPath`, `gzip:false`, `cacheMethod:'none'` or it will try to download language data.

### Pitfall 7: node-llama-cpp needs more than the `.node`
`getLlama` reads `llama/binariesGithubRelease.json` from the asar; removing the whole `llama/` directory failed `[VERIFIED: R5]`. Only the 34 MB `llama/gitRelease.bundle` is safely excludable. Use `build:'never'`, `skipDownload:true`, `gpu:false` for the probe. CPU backend ships many `ggml-cpu-*.dll` variants (selected at runtime): ship all of the chosen package.

### Pitfall 8: V8 OOM is silent (`exit 0`)
See R8. Also `execArgv` heap flags are ignored except `--js-flags`. **Avoid:** treat every unrequested exit as a crash; add a result/heartbeat protocol so "exited without delivering a result" is the crash signal; run real-OOM tests only with `--js-flags=--max-old-space-size=64`.

### Pitfall 9: React Aria + strict CSP
`usePress` injects `<style id=...>@layer{[data-react-aria-pressable]{touch-action:...}}` and is blocked by `style-src 'self'` unless a nonce is present `[VERIFIED: R7]`. **Avoid:** nonce pattern (Pattern 3). **Warning sign:** console error `Applying inline style violates ... 'style-src 'self''`; add a Playwright assertion of zero CSP violations (`securitypolicyviolation` listener or console capture).

### Pitfall 10: SQLite details
`VACUUM INTO` fails inside a transaction and onto an existing file; header `user_version` is stale until checkpoint; WAL file present after a clean close if a reader exists; do not copy the `.db` alone `[VERIFIED: R10]`. Use `readonly:true,fileMustExist:true` for the refuse-newer probe. `better-sqlite3` loads from `../prebuilds/<platform>-<arch>.node` via `__dirname`, so it must stay external (never bundled) `[VERIFIED: tarball read]`.

### Pitfall 11: Windows file semantics
Directory `fsync` → `EPERM`; `rename` over a held-open target → `EPERM` (antivirus, Search indexer) `[VERIFIED: R10]`; add bounded retry with backoff for `EPERM/EBUSY/EACCES`. Default `userData` is Roaming `[VERIFIED: R-paths]` (see Open Question 1).

### Pitfall 12: macOS signing (unverified here; test early on CI)
- `identity: "-"` is an explicit opt-in; with the default hardened runtime, ad-hoc requires `com.apple.security.cs.disable-library-validation` or `hardenedRuntime:false` `[VERIFIED: app-builder-lib scheme.json + MacTargetHelper.js read]`. electron-builder's default entitlements template contains exactly `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, `com.apple.security.cs.disable-library-validation` (all `true`) `[VERIFIED: templates/entitlements.mac.plist read]`.
- `@node-llama-cpp/mac-arm64-metal` ships Mach-O libraries with a **`.so` extension** (`libggml-cpu-apple_m1.so`, `libggml-blas.so`, `libggml-metal.so`) plus `.dylib` and `llama-addon.node` `[VERIFIED: tarball listing]`; onnxruntime-node darwin/arm64 ships two 44 MB dylibs. Whether electron-builder signs `.so` files in `app.asar.unpacked` is **unknown**: the `codesign --verify --deep --strict` gate exists to find out. Fallback: `mac.binaries` ("Paths of any extra binaries that need to be signed"; relative paths resolve from the app `Contents`) `[VERIFIED: schema text + code read]`.
- Do not enable the `enableCookieEncryption` fuse in Phase 1 (needs Keychain access with a consistent signature; ad-hoc may prompt) `[CITED: electronjs.org/docs/latest/tutorial/code-signing]`. Do not call `spctl --assess` on ad-hoc builds.
- `macos-13` does not exist on GitHub-hosted runners; lowest listed is `macos-14` `[CITED: docs.github.com runner reference]`. macOS 13 is therefore reported "untested" unless a Tier B VM covers it.

### Pitfall 13: Hosted runners are not the target OS
`windows-latest` = Windows Server 2025 (x64, 4 vCPU, 16 GB), not Windows 11; `macos-latest` = macOS 26 arm64 M1 (3 vCPU, 7 GB) `[CITED: docs.github.com/en/actions/reference/runners/github-hosted-runners]`. Tier A is therefore "packaged smoke on the nearest hosted OS", never "clean Windows 11".

### Pitfall 14: First-run slowness
First dev load of the LLM host took 19 s (Defender scanning fresh DLLs); packaged runs 0.6-4.5 s. Use 60-90 s smoke timeouts but record durations; pass policy must be written before the run.

### Pitfall 15: Licenses the npm scan cannot see
Native binaries embed code (sherpa → espeak-ng GPL, R13); Electron ships `LICENSES.chromium.html` and a Chromium-bundled FFmpeg (LGPL family) `[ASSUMED]`; `DirectML.dll` ships inside onnxruntime-node win32. Keep a hand-reviewed `third_party/binary-licenses.json` for native prebuilds and probe assets, and ship Electron's license files (REL-04, Phase 12).

## Code Examples

### Electron-builder config (base; Windows verified, macOS fields per docs)
```yaml
# apps/desktop/electron-builder.yml
appId: dev.danesh.app
productName: Danesh
npmRebuild: false                      # all native deps are N-API prebuilds; never node-gyp   [VERIFIED: R5]
directories: { output: dist }
electronLanguages: [en-US, fa]         # option exists in schema; locales were 49 MB     [VERIFIED: scheme.json]
files:
  - out/**
  - package.json
  - "!node_modules/better-sqlite3/{deps,src}/**"
  - "!node_modules/better-sqlite3/prebuilds/linux*"
  - "!node_modules/better-sqlite3/prebuilds/{darwin-x64,win32-arm64}.node"   # per-OS: keep only this OS's prebuild (filter per platform)
  - "!node_modules/@node-llama-cpp/{win-x64-cuda*,win-x64-vulkan,win-arm64,linux-*,mac-x64}/**"
  - "!node_modules/node-llama-cpp/llama/gitRelease.bundle"
  - "!node_modules/onnxruntime-node/bin/napi-v6/{linux,darwin/x64,win32/arm64}/**"   # filter per platform
  - "!node_modules/tesseract.js-core/*.wasm.js"
  - "!node_modules/tesseract.js-core/*-lstm.*"
asarUnpack:                            # native binaries ONLY (keep install paths short)
  - node_modules/better-sqlite3/prebuilds/**
  - node_modules/@node-llama-cpp/*/bins/**
  - node_modules/onnxruntime-node/bin/**
  - node_modules/tesseract.js-core/**
extraResources: [{ from: ../../resources/probes, to: probes }]   # -> process.resourcesPath/probes
electronFuses:                         # applied right before signing  [VERIFIED: R5]
  runAsNode: false
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  grantFileProtocolExtraPrivileges: false
win:
  target: [{ target: nsis, arch: [x64] }]
  signAndEditExecutable: false         # unsigned in Phase 1 (D-08)
nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false }
mac:
  target: [{ target: dir, arch: [arm64] }, { target: dmg, arch: [arm64] }]
  identity: "-"                        # explicit ad-hoc opt-in; no automatic fallback   [VERIFIED: schema]
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist          # allow-jit, allow-unsigned-executable-memory, disable-library-validation
  entitlementsInherit: build/entitlements.mac.plist
  gatekeeperAssess: false
  minimumSystemVersion: "13.0"
  # binaries: [Contents/Resources/app.asar.unpacked/node_modules/@node-llama-cpp/mac-arm64-metal/bins/mac-arm64-metal/*.so]  # fallback if codesign --deep --strict flags .so
```
Verbatim `electronFuses` keys accepted by electron-builder 26.17.0 (`app-builder-lib/scheme.json` `FuseOptionsV1.properties`, read this session): `enableCookieEncryption, enableEmbeddedAsarIntegrityValidation, enableNodeCliInspectArguments, enableNodeOptionsEnvironmentVariable, grantFileProtocolExtraPrivileges, loadBrowserProcessSpecificV8Snapshot, onlyLoadAppFromAsar, resetAdHocDarwinSignature, runAsNode` `[VERIFIED: scheme.json]`. `FuseV1Options` in `@electron/fuses` 2.1.3 (`dist/config.d.ts`): `RunAsNode = 0, EnableCookieEncryption = 1, EnableNodeOptionsEnvironmentVariable = 2, EnableNodeCliInspectArguments = 3, EnableEmbeddedAsarIntegrityValidation = 4, OnlyLoadAppFromAsar = 5, LoadBrowserProcessSpecificV8Snapshot = 6, GrantFileProtocolExtraPrivileges = 7`; the fuse wire char codes are 48 (`'0'` = disabled) and 49 (`'1'` = enabled), plus a `WasmTrapHandlers` entry (index 8) that the type enum does not list `[VERIFIED: config.d.ts + getCurrentFuseWire run]`.

Test build = second file with `extends: electron-builder.yml`, `appId: dev.danesh.app.test`, `productName: DaneshTest`, `directories.output: dist-test`, `electronFuses.enableNodeCliInspectArguments: true`, built with `electron-vite build --mode test` (enables `__TEST_HOOKS__`). Never publish `dist-test`.

### Playwright + playwright-bdd fixture (verified)
```ts
// features/steps/fixtures.ts   [VERIFIED: R11]
export const test = base.extend<{ electronApp: ElectronApplication; page: Page }>({
  electronApp: async ({}, use) => {
    const env = { ...process.env } as Record<string, string>; delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ executablePath: process.env.DANESH_TEST_EXE!, args: ['--user-data-dir=' + userDataDir], env });
    await use(app); await app.close();
  },
  page: async ({ electronApp }, use) => { await use(await electronApp.firstWindow()); },
});
export const { Given, When, Then } = createBdd(test);
// playwright.config.ts: const testDir = defineBddConfig({ features: 'features/ui/**/*.feature', steps: ['features/steps/*.ts'] });
// run: pnpm exec bddgen && pnpm exec playwright test      (.features-gen/ is generated: gitignore it)
```
`--user-data-dir` (standard Chromium switch) relocates userData, including to a Persian path, in a production-fuse build `[VERIFIED: R5]`; production builds should not honor a custom env override, so use this switch for Tier A Persian-path runs.

### Crash-injection fault modes for the fake engine host (all verified individually)
```ts
// fault = message from the test; host executes AFTER acknowledging so the supervisor sees an unrequested exit
case 'exit0':  process.exit(0);                 // looks like success: must still be a crash
case 'exit1':  process.exit(1);
case 'abort':  process.abort();                 // exit 134, reason 'crashed'
case 'spin':   for (;;) {}                      // supervisor watchdog -> child.kill() (6 ms)
case 'oom':    for (const a = [];;) a.push(new Array(1e5).fill(1.5));  // ONLY when forked with execArgv ['--js-flags=--max-old-space-size=64']
// external kill -9 equivalent from Main/test hook: process.kill(pid, 'SIGKILL')  (Windows: TerminateProcess; exit code 1)
```

### GitHub Actions skeleton (action majors verified 2026-10-09)
```yaml
name: ci
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  build:
    strategy: { fail-fast: false, matrix: { os: [windows-latest, macos-latest] } }
    runs-on: ${{ matrix.os }}
    env: { NODE_LLAMA_CPP_SKIP_DOWNLOAD: 'true', ONNXRUNTIME_NODE_INSTALL: skip }
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6          # reads packageManager from package.json
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm depcruise && pnpm licenses:scan && pnpm test
      - uses: actions/cache@v6
        with: { path: resources/probes, key: probes-${{ hashFiles('tools/probes.lock.json') }} }
      - run: node tools/fetch-probes.ts      # pinned commit + sha256; no runtime downloads
      - run: pnpm package                    # electron-builder per-OS (production + test build)
      - run: node tools/smoke/run-packaged-smoke.ts --out evidence/smoke-${{ matrix.os }}.json
      - run: pnpm test:e2e                   # bddgen + playwright against the TEST build
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: evidence-${{ matrix.os }}, path: evidence/** }
```
Latest majors: checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.0, cache v6.1.0, upload-artifact v7.0.2 `[VERIFIED: GitHub releases API]`. The workflow is validated locally by running the same package scripts (D-18); pushing requires authorization.

### ADR template (MADR 4.0 structure + required extensions)
```markdown
---
status: proposed | accepted | superseded by ADR-NNNN
date: YYYY-MM-DD
decision-makers: ...
---
# NNNN: <short title>
## Context and Problem Statement
## Decision Drivers
## Considered Options
## Decision Outcome   (Chosen option, Consequences, Confirmation)
## Spike Evidence      <- platforms ACTUALLY run (OS+arch+version), fixtures (name+sha256), metrics, PASS POLICY (written before the run, with commit hash), result, raw evidence path
## License             <- engine/model/voice license, redistribution rights, binary-embedded licenses checked how
## Packaging           <- asarUnpack/signing/size/path-length findings
## Security            <- attack surface, egress, sandbox implications
## Pros and Cons of the Options
## More Information    <- revisit criteria
```
MADR 4.x headings per `[CITED: github.com/adr/madr template]`; the four extra sections are D-19.

### Gherkin organization and verification-report format
- `features/ui/*.feature` (playwright-bdd, test build) and `features/core/*.feature` (vitest-cucumber); one file per capability; tags `@req-PLAT-01`, `@tier-a`, `@tier-b-manual`, `@ui|@core`; every file has scenarios for happy path, invalid input, edge, recovery, cancellation, persistence (or an explicit `# n/a because` comment).
- Feature files land in a commit **before** their step definitions/implementation (commit order is the evidence; `vitest-cucumber` fails on unmatched steps, so the red phase is real `[VERIFIED: R11]`).
- `.planning/phases/01-.../01-VERIFICATION.md` rows: `Req | Status (verified|partially verified|blocked) | Evidence paths | What was NOT shown`. A `tools/check-report.ts` (run with `node`) fails on: missing requirement ID, status outside the three values, evidence path that does not exist, "verified" with only CI-config evidence.

## Walking Skeleton (Plan 01 tracer)

Thinnest slice that proves the architecture end to end (every hop individually verified in R1, R6, R7):
1. `pnpm install` → `electron-vite build --mode test` → `electron-builder --dir` (test build) → Playwright launches it.
2. Main registers `app://`, creates the sandboxed window (CJS preload), forks **Core** and **fake-engine host**, creates two `MessageChannelMain` pairs: renderer↔Core, Core↔host.
3. Renderer (React, RTL, Vazirmatn) calls `window.danesh.call('system.ping', { n })` → preload validates with zod → Core validates again → Core opens SQLite (migration `0001_init.sql` applied, backup skipped on first create), writes a row and reads it back → Core sends `echo` to the fake host over the brokered port → result returns to the UI, which renders three Persian status rows (database, engine host, round trip) with the honest "foundation build" text.
4. Acceptance first: `features/ui/walking-skeleton.feature` (window shows Persian RTL status; ping round trip shows database and engine rows passing; renderer has no `require`; invalid `n` is rejected and a log line with schema name but no payload exists) and `features/core/ipc-validation.feature`; both committed before code.
5. Everything later (supervisor, kernel, probes, packaging, egress) extends this skeleton; no later plan introduces a new process type.

Suggested plan decomposition (fine granularity; planner decides): 01 skeleton + Gherkin + ADR template + Wave-0 test infra → 02 contracts/IPC validation + logging → 03 storage kernel (Db, migrations, backup, refuse-newer, recovery) → 04 CAS → 05 job kernel + sample job + crash-injection → 06 supervisor + fake-engine faults (PLAT-04) → 07 egress layers + lint + licenses scan → 08 probe hosts + packaging config + smoke runner + fuse read → 09 CI workflows + Tier B runbook + System check export → 10 ADRs 0001-0003 with spike evidence + verification report; with the D-LICENSE `checkpoint:decision` early (so ADR 0004/REL-08 can close) and `checkpoint:human-action` plans for macOS Tier B and the GitHub push.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-rebuild`/`prebuild-install` for SQLite | better-sqlite3 13 N-API with prebuilds inside the npm tarball | v13 (2026-08) | No rebuild, no install download; set `npmRebuild:false` |
| afterPack hook calling `@electron/fuses` | `electronFuses` option in electron-builder 26 | v25+ | Declarative; verified applied before signing |
| `externalizeDepsPlugin()` | `build.externalizeDeps` (default true) | electron-vite 5 | Plugin is `@deprecated` `[VERIFIED: index.d.ts]` |
| `ts-node`/`tsx` for tooling scripts | `node file.ts` (type stripping) | Node 22.18/24 | No extra dependency `[VERIFIED: R11]` |
| install scripts run by default | pnpm 12 `allowBuilds`, npm 12 `allowScripts` blocked by default | 2026 | Must be explicit; supply-chain safer |
| Electron binary fetched in `postinstall` | Lazy download on first run (`scripts: {}`) | Electron 44 | CI caches should cover the Electron download; electron-builder downloads its own zip |
| TS auto-includes all `@types/*` | `types` must be listed (TS 6.0) | TS 6.0 | Add `"types": ["node"]` etc. |

**Deprecated/outdated:** `tesseract.js` v7 formats are off unless requested; `onnxruntime-genai` no Node package; `electron-trpc` unmaintained; TS 7.x for tooling (typescript-eslint peer `<6.1.0`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | electron-builder signs `.so`/`.dylib`/`.node` Mach-O files inside `app.asar.unpacked` for ad-hoc builds so `codesign --verify --deep --strict` passes on macOS | Pitfall 12, Config | macOS smoke fails at the signing gate; fallback `mac.binaries` list. First CI macOS run resolves it |
| A2 | An ad-hoc signed, hardened-runtime app with `disable-library-validation` loads node-llama-cpp/onnxruntime Mach-O libs from `app.asar.unpacked` inside a utilityProcess on macOS 14/26 arm64 | D-24, Pitfall 12 | Would trigger D-24 architecture finding on macOS; `allowLoadingUnsignedLibraries`/`hardenedRuntime:false` are fallbacks |
| A3 | macOS egress sampler command `lsof -nP -iTCP -iUDP -a -p <pids>` works on `macos-latest` without elevated rights | Pattern 8 L4 | Need `sudo nettop`/`tcpdump` alternative |
| A4 | `@types/better-sqlite3@9.6.0` matches better-sqlite3 13's API | Standard Stack | Type errors in the `Db` adapter only |
| A5 | `ggml-org/tiny-llamas` `stories15M-q4_0.gguf` inherits the MIT license of upstream `karpathy/tinyllamas` (the ggml-org card has no license field) | Probes | NOTICE wording wrong; swap to another tiny GGUF. Verified: upstream card says `license: mit`; ggml-org card empty |
| A6 | Electron's Chromium FFmpeg/other bundled code carries LGPL-family obligations needing notices | Pitfall 15 | REL-04 omission (Phase 12) |
| A7 | A real Persian-named local Windows user can be created with `net user` (spaces and Unicode allowed) for Tier B and optionally on CI runners | Validation | Tier B runbook needs a different method |
| A8 | Windows Defender first-load delay (19 s) is the cause of slow first LLM load | Pitfall 14 | Timeouts too tight on slow CI; harmless |
| A9 | Real OOM on macOS utilityProcess also exits silently with a code that is not a success signal | Pattern 4 | Supervisor rule (any unrequested exit = crash) still holds; only logging differs |
| A10 | Production-bundle tree-shaking removes `__TEST_HOOKS__` code via Vite `define` | Config | Test hooks could ship; add a build assertion grepping the production bundle |
| A12 | `utilityProcess` can only be called from the Main process (so Core cannot fork engine hosts itself); the fetched Electron page did not state this | Pattern 2 | If Core could fork hosts, the supervisor could be simpler, but the Main-brokered design is still valid |
| A11 | Persian `fas.traineddata` (tessdata_fast, 431,500 bytes, sha256 `db1c0a91...a505`) can be added to the OCR probe unchanged | Probes | Optional; only if a non-Latin probe is wanted |

## Open Questions

1. **Roaming vs Local `userData` on Windows**
   - Known: default `app.getPath('userData')` = `%APPDATA%\<name>` (Roaming) and `logs`/`crashDumps` live under it `[VERIFIED: R-paths]`; Pitfall 17 says never Roaming (enterprise roaming, sync). D-13 locks "defaults to `app.getPath('userData')`" and marks the location change as costly.
   - Unclear: whether the user accepts redefining `userData`.
   - Recommendation: keep D-13 literally but call `app.setPath('userData', join(process.env.LOCALAPPDATA!, 'Danesh'))` (and `sessionData`) before `ready` on Windows, and record it in ADR 0001/0003; flag in discuss/plan as a one-way default. Decide before any release.
2. **macOS native-library signing and loading (A1, A2).** Cannot be answered on this machine; schedule the first macOS CI run early in the phase and treat a failure as a D-24 architecture finding (`checkpoint:decision`).
3. **Probe license provenance for a public installer.** Mana voice chain verified (model MIT, dataset CC0-1.0, base checkpoint repo Apache-2.0, piper-voices MIT) `[VERIFIED: HF API]`, but the voice is a real speaker and the GGUF license is inherited (A5). Recommendation: bundle as probes with NOTICE, mark "probe only (D-23)", review again before Phase 12.
4. **Production-build smoke trigger.** The Tier A smoke must run the production-fuse build (no Playwright). Recommend an app argument `--smoke-test --smoke-out=<abs path>` handled in Main that runs the System check, writes the JSON and exits 0/1 (fuses and `codesign` are verified by the out-of-process runner and merged). Confirm that an argument-triggered diagnostic mode is acceptable surface.
5. **Hosted-runner coverage gaps.** macOS 13 is untestable on GitHub-hosted runners and `windows-latest` is Server 2025. Recommendation: report both as such; Tier B VMs decide.
6. **Real-OOM test policy.** Recommend: deterministic faults (`exit0`, `abort`, `spin`) in CI, plus one real OOM using `--js-flags=--max-old-space-size=64` (371 ms, safe) in CI; no unbounded allocation anywhere.
7. **D-LICENSE timing.** Plan the `checkpoint:decision` early; until then `package.json` `license` must be `UNLICENSED` (not a grant) and the license scan must exempt only Danesh's own workspace packages.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 24.21.0 (same as Electron 44.7.0's) | none needed |
| pnpm | workspaces | yes | 12.9.1 (12.10.1 latest) | npm 12.2.0 workspaces |
| git | repo, CI | yes | 2.56.0.windows.2 | none |
| Windows 11 x64 dev machine | Tier A local, Tier B Windows | yes | 10.0.29683 | none |
| macOS (Apple Silicon) | Tier B macOS, signing gate | **no** | none | GitHub `macos-latest` (macOS 26) for Tier A only; macOS never reported verified without Tier B (D-06) |
| npm registry / Hugging Face / GitHub raw | install, fetch probes | yes (200 OK) | - | offline cache |
| NSIS toolchain | Windows installer | yes (electron-builder downloaded `nsis-3.0.4.1` and resources) | - | `dir` target |
| MSVC / node-gyp | native rebuild | not needed (`npmRebuild:false`, prebuilds) | - | - |
| `codesign` / `hdiutil` | mac packaging and verification | no (macOS only) | - | CI mac runner |
| GitHub push access to `origin` | REL-01 run | **needs authorization** | - | D-18 `checkpoint:human-action` |
| Admin rights for a new Persian-named Windows user | Tier B Windows | probably (A7) | - | existing VM |

**Missing dependencies with no fallback:** a macOS machine/VM for Tier B (human-action checkpoint); user authorization to push.
**Missing dependencies with fallback:** macOS packaging runs on the GitHub macOS runner.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`. Greenfield: no test infrastructure exists.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 + @amiceli/vitest-cucumber 8.0.0 (unit, core Gherkin); @playwright/test 1.64.0 + playwright-bdd 9.2.1 (UI Gherkin, Electron test build) |
| Config file | none yet: Wave 0 creates `vitest.config.ts` (projects: `packages/*`, `apps/core`), `apps/desktop/playwright.config.ts` |
| Quick run command | `pnpm vitest run --project <pkg>` (single package, < 30 s) |
| Full suite command | `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm licenses:scan && pnpm vitest run && pnpm package:test && pnpm test:e2e && pnpm smoke:packaged` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | sandbox/isolation/no Node/CSP/navigation lockdown; zero CSP violations | unit (`secureWebPreferences()`, CSP string) + E2E | `pnpm vitest run --project main` ; `pnpm test:e2e -g @req-PLAT-01` | ❌ Wave 0 |
| PLAT-02 | malformed/unknown/oversize/wrong-sender IPC rejected + logged (schema name, sender, error, no payload) | core Gherkin + E2E invalid input | `pnpm vitest run --project contracts core` | ❌ Wave 0 |
| PLAT-03 | engines in distinct pids; UI heartbeat p95 under load within policy | packaged smoke + Tier B | `pnpm smoke:packaged` | ❌ Wave 0 |
| PLAT-04 | supervisor backoff (fake processes); real kill / abort / exit0 / spin / bounded OOM → task retriable, host restarts, app alive | unit + E2E crash-injection | `pnpm vitest run --project jobs` ; `pnpm test:e2e -g @req-PLAT-04` | ❌ Wave 0 |
| PLAT-05 | zero egress: L1-L4 layers, lint, positive controls | E2E + lint | `pnpm test:e2e -g @req-PLAT-05` ; `pnpm depcruise && pnpm lint` | ❌ Wave 0 |
| PLAT-06 | forward-only, checksum mismatch refuse, newer-schema refuse (readonly) | core Gherkin + golden DBs | `pnpm vitest run --project storage` | ❌ Wave 0 |
| PLAT-07 | backup before migrate, failed migration rolls back, recovery state offers backup, keep last 3 | core Gherkin | `pnpm vitest run --project storage` | ❌ Wave 0 |
| PLAT-08 | CAS atomic write, dedupe, crash mid-write, EPERM retry, tmp sweep | unit + crash injection | `pnpm vitest run --project storage` | ❌ Wave 0 |
| PLAT-11 | Persian + space userData and install dir; installed-tree manifest equals build manifest | unit (paths) + packaged smoke + scripted silent NSIS install into Persian dir (Windows) | `pnpm smoke:packaged --persian-paths` | ❌ Wave 0 |
| JOB-03 | SIGKILL at after-claim/after-blob/after-commit; resume without redo (`exec_log` one row per task); app-level kill of Core mid sample-job | unit with real child kill + E2E | `pnpm vitest run --project jobs` ; `pnpm test:e2e -g @req-JOB-03` | ❌ Wave 0 |
| REL-01 | workflows authored and equivalent scripts pass locally; green on GitHub only after push | static (workflow lint) + CI | `pnpm ci:local` ; GitHub run is `checkpoint:human-action` | ❌ Wave 0 |
| REL-02 | packaged smoke JSON (all D-07 checks) Tier A; Tier B human evidence | packaged smoke + manual | `pnpm smoke:packaged` ; Tier B runbook | ❌ Wave 0 |
| REL-08 | ADR 0004 + LICENSE after D-LICENSE decision | manual checkpoint | `node tools/check-report.ts` (ADR present, status accepted) | blocked on D-01 |
| EVAL-05 | ADR 0001-0003 contain Spike Evidence with platforms run + pass policy commit | doc check | `node tools/check-adr.ts` | ❌ Wave 0 |
| EVAL-06 | every `.feature` committed before its steps; every capability has the six scenario kinds | git-order script + vitest-cucumber missing-step failure | `node tools/check-features-first.ts` | ❌ Wave 0 |
| EVAL-07 | verification report schema/evidence-path check | script | `node tools/check-report.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick command for the touched package (< 30 s) plus `pnpm lint`.
- **Per wave merge:** full Vitest suite + `pnpm depcruise` + `pnpm licenses:scan` + `pnpm test:e2e` against the test build.
- **Phase gate:** full suite green locally on Windows, packaged smoke JSON captured, CI workflows present; Tier B evidence recorded or reported as blocked, before `/gsd-verify-work`.

### Manual-only (Tier B) with justification
- Real Persian-named Windows profile install + System check export (hosted runners cannot provide a clean Windows 11 profile).
- Clean macOS 13+ Apple Silicon account/VM install, `codesign --verify --deep --strict`, System check export.
- Egress evidence with an external firewall/packet capture on a clean machine (supplements L1-L4).
- GitHub Actions run on both OSes (needs push authorization).

### Wave 0 Gaps
- [ ] `vitest.config.ts` (projects) and `apps/desktop/playwright.config.ts`; `.features-gen/` gitignored
- [ ] `packages/engine-api` fake engine host with fault modes; `packages/domain/jobs` FSM + backoff (pure)
- [ ] `features/{ui,core}/*.feature` skeletons committed before implementation (EVAL-06)
- [ ] `tools/{license-scan,fetch-probes,check-report,check-features-first,check-adr}.ts`, `tools/probes.lock.json` (URLs pinned by commit + sha256), smoke runner + `smoke-report` zod schema
- [ ] `docs/adr/0000-template.md`; `third_party/binary-licenses.json`; `resources/probes/NOTICE`
- [ ] Framework install: `pnpm add -Dw vitest@5.0.3 @amiceli/vitest-cucumber@8.0.0 @playwright/test@1.64.0 playwright-bdd@9.2.1` (plus the other pins above)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` (config.json).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Process topology + trust boundaries (ADR 0001); Main never opens DB; hosts have no DB/sockets |
| V2 Authentication | no | No accounts or credentials in Phase 1 |
| V3 Session Management | no | No sessions; `enableCookieEncryption` left off |
| V4 Access Control | yes | Port handed only to the `app://danesh` frame; `senderFrame` origin check on every `ipcMain`/port setup; closed method map |
| V5 Input Validation | yes | zod `.strict()` schemas in preload and Core; size limits; CAS path derivation from hash only; `app://` traversal check; `VACUUM INTO ?` bound parameter |
| V6 Cryptography | partial | SHA-256 via Node `crypto` only (CAS ids, migration checksums); no custom crypto |
| V7 Error Handling and Logging | yes | JSONL logs with IDs/hashes/classes only; rejected IPC logged without payload (D-16); no stack traces in UI |
| V8 Data Protection | yes | Local-only data, no telemetry, userData under Local on Windows (Open Question 1) |
| V10 Malicious Code | yes | Install scripts blocked, pinned exact versions, lockfile review checkpoint, license scan, sherpa-onnx excluded, fuses |
| V12 Files and Resources | yes | Unicode-safe paths, tmp sweep, CAS hash verification on read-back, no renderer-supplied paths |
| V13 API and Web Service | yes | The typed RPC is the API: versioned contracts, rate/size caps |
| V14 Configuration | yes | Production fuse set verified by smoke; test build segregated; CSP nonce; permission/navigation handlers deny by default |

### Known Threat Patterns for Electron + utilityProcess + SQLite
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/oversized IPC payload | Tampering/DoS | zod strict + max sizes at preload and Core; reject + log (PLAT-02) |
| Renderer compromise reaching Node | Elevation | `sandbox`, `contextIsolation`, no Node integration, CJS preload with private port; E2E asserts `typeof require === 'undefined'` |
| Path traversal in custom protocol | Info disclosure | normalize + prefix check (Pattern 3), 403 |
| Navigation/`window.open`/permissions abuse | Spoofing/Elevation | `will-navigate` block, `setWindowOpenHandler` deny, permission handlers deny |
| Hidden egress (Chromium, Node, native) | Info disclosure | L1-L4 layers; single egress module; lint; CSP `connect-src 'none'` |
| Fuse downgrade / `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` abuse | Elevation | `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, inspect off, ASAR integrity + `OnlyLoadAppFromAsar` on |
| Supply-chain install scripts / binary-embedded GPL | Tampering/Legal | `allowBuilds`, `NODE_LLAMA_CPP_SKIP_DOWNLOAD`, pinned probes with sha256, binary license manifest |
| SQL injection via interpolated paths | Tampering | prepared statements; `VACUUM INTO ?` bound `[VERIFIED: R10]` |
| Newer-schema DB opened read-write by old build | Tampering/Integrity | readonly probe then refuse (D-14) |
| Orphaned engine process holding file locks | DoS | none observed after SIGKILL of Main (R8); single-instance lock; boot recovery |
| Test-only hooks shipping in production | Elevation | `__TEST_HOOKS__` build define + assertion script grepping `out/` and the packaged asar |

## Sources

### Primary (HIGH confidence)
- Executed in this session (Spike Evidence R1-R14): Electron 44.7.0, electron-builder 26.17.0, electron-vite 5.0.0, vite 7.3.7, pnpm 12.9.1, better-sqlite3 13.0.3, node-llama-cpp 3.22.1, onnxruntime-node 1.30.0, tesseract.js 7.0.0, Playwright 1.64.0, playwright-bdd 9.2.1, Vitest 5.0.3, vitest-cucumber 8.0.0, dependency-cruiser 18.5.0, ESLint 10.12.0, TypeScript 6.0.3 on Windows 11 x64.
- Installed package sources read this session: `app-builder-lib` 26.17.0 (`scheme.json`, `out/mac/MacTargetHelper.js`, `out/platformPackager.js`, `templates/entitlements.mac.plist`), `@electron/fuses` 2.1.3 (`dist/config.d.ts`, `index.js`), `electron-vite` 5.0.0 (`dist/index.d.ts`), `better-sqlite3` 13.0.3 tarball (`package.json`, `lib/binding.js`, `prebuilds/`), `node-llama-cpp` 3.22.1 (`OnPostInstallCommand.js`, `config.js`, `getLlama.js`), `onnxruntime-node` 1.30.0 (`script/install.js`), `tesseract.js` 7.0.0 (`worker-script/node/getCore.js`), `react-aria` (`usePress.mjs`, `getNonce.mjs`).
- Electron docs: https://www.electronjs.org/docs/latest/tutorial/fuses , https://www.electronjs.org/docs/latest/api/utility-process , https://www.electronjs.org/docs/latest/tutorial/esm , https://www.electronjs.org/docs/latest/tutorial/code-signing
- Node.js sqlite docs (v24): https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- GitHub-hosted runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Hugging Face API metadata (licenses, hashes): `MahtaFetrat/Mana-Persian-Piper` (mit), `datasets/MahtaFetrat/Mana-TTS` (cc0-1.0), `SadeghK/persian-text-to-speech` (apache-2.0), `rhasspy/piper-voices` (mit), `karpathy/tinyllamas` (mit), `ggml-org/tiny-llamas` (no license field); GitHub API `tesseract-ocr/tessdata_fast` (Apache-2.0)
- npm registry (`npm view`) for all versions, peers, licenses, scripts on 2026-10-09; GitHub releases API for Actions majors

### Secondary (MEDIUM confidence)
- MADR template structure https://github.com/adr/madr (fetched summary, structure only)
- Web search on electron-builder ad-hoc signing (consistent with the installed source I read)
- Project research: `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md` (several claims corrected here: Electron Node version, `sherpa-onnx` licensing implication, better-sqlite3 distribution, `userData`)

### Tertiary (LOW confidence)
- macOS behavior (signing of `.so`, library validation, lsof sampling): not run; see Assumptions A1-A3, A9

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH on Windows (every pin exercised); MEDIUM overall because macOS prebuild behavior and `@types/better-sqlite3` mapping are unverified.
- Architecture: HIGH for Windows (end-to-end skeleton hops, kill/recovery, egress); MEDIUM for macOS.
- Pitfalls: HIGH for the 15 listed (11 reproduced here); macOS ones are CITED/ASSUMED and flagged.

**Research date:** 2026-10-09
**Valid until:** 2026-11-08 for pins (Electron, Vite, electron-builder move fast; re-run `npm view` at scaffold time); the experimental findings stay valid until an Electron or electron-builder major/minor bump.
