---
status: proposed
date: 2026-10-09
decision-makers:
  - Danesh project owner (approved Phase 1 specifications)
kind: architecture
spike: S-PACKAGE
---

# 0001: Process topology and IPC

## Context and Problem Statement

Danesh needs a local-first Electron, TypeScript and React foundation whose renderer cannot access Node, whose heavy engines cannot block Main, and whose committed data survives process crashes. PLAT-01, PLAT-02, PLAT-03 and PLAT-04 require explicit process and message boundaries rather than renderer access to storage or engine libraries.

The approved SKELETON fixes Main, renderer, Core and one utilityProcess per engine host. Main alone can fork utility processes and broker ports. Core is the single SQLite and CAS writer; hosts receive no database handle and open no sockets. A model or voice probe in this phase demonstrates packaging only and does not select a product engine.

## Decision Drivers

- Sandboxed, context-isolated renderer with no Node integration, a restrictive CSP and a closed typed API.
- Strict receiver-side validation before side effects, bounded serialized UTF-8 payload sizes and local metadata-only rejection logs.
- Main never opens storage; engine crashes affect one host and leave the window and other processes running.
- Windows 11 x64 and macOS 13+ Apple Silicon are the target platforms; hosted Tier A evidence remains separate from clean-machine Tier B evidence.
- Full Unicode paths, local-only data and no localhost server or network-dependent startup.
- Minimal configuration that preserves architectural boundaries without per-directory workspace manifests.

## Considered Options

1. Main as thin lifecycle/port broker, a sandboxed renderer and CommonJS preload, one Core utilityProcess and separate engine-host utility processes.
2. Run database or engine code in Main or the renderer.
3. Use a localhost HTTP service or an open raw IPC surface for backend access.
4. Use workspace packages for every source directory instead of one desktop assembly and path aliases.

## Decision Outcome

Propose the approved topology in option 1 with the alias layout, subject to the pass policy below. Main owns window creation, protocol serving, supervision, Chromium egress blocking and port brokering. Core owns the RPC server, SQLite migrations, CAS, jobs and System check; `engine-sample`, `engine-llm`, `engine-ocr` and `engine-tts` each run in their own utilityProcess. Heavy work never moves to Main or the renderer.

Renderer requests pass through the sandboxed CommonJS preload to a private MessagePort connected to Core. The preload exposes only `window.danesh.call(method, input)` and `window.danesh.on(topic, cb)`. One closed zod contract map in `packages/contracts/src/rpc.ts` supplies strict schemas, types and per-method serialized UTF-8 byte limits. Preload validates before sending and every receiving process validates independently before dispatch. Typed `shell.*` methods route to Main through a sender-origin-validated invoke channel. Neither ipcRenderer nor a MessagePort is exposed to the page.

Main serves the built renderer from `app://danesh/` with a traversal guard and a fresh response CSP nonce, including React Aria's nonce meta element. Built and packaged apps use neither `file://` nor a localhost server. Navigation, new windows and permissions are denied outside the approved surface.

Only `apps/desktop` is a pnpm workspace package. Source lives under `apps/{main,preload,renderer,core}` and `packages/{contracts,domain,storage,egress,engine-api,logging,engines/*}` and uses aliases declared in `aliases.ts` and `tsconfig.base.json`; relative source imports use explicit `.ts` or `.tsx` extensions. Path-based dependency-cruiser rules preserve the same boundaries without separate manifests in every directory.

The library defaults to `app.getPath('userData')`. Before ready on Windows, `userData` and `sessionData` are set to `%LOCALAPPDATA%\Danesh` unless `--user-data-dir` was supplied; that explicit path takes precedence. macOS keeps its platform userData default. The location is a costly D-13 decision after release: paths retain their Unicode spelling and no failure path silently relocates the library to an ASCII-only directory.

### Consequences

Main must supervise Core and the hosts, and re-broker ports after a crash; pending calls settle as UNAVAILABLE while the connection is lost. Native loading must be proven inside packaged utility processes. Aliases remove manifest overhead but require path-based boundary lint and shared alias configuration. Data location changes after release require an explicit migration.

### Confirmation

Acceptance requires every pass-policy condition on both target platforms. The IPC and engine-crash features are specifications now, with bindings provided in later plans. This ADR stays proposed until recorded evidence establishes the outcomes; scratch research is supporting context, not a run under this policy.

## Spike Evidence

Pass policy commit: filled at ADR finalization from git history

Commit this policy before governed runs. A subsequent change after results exist must be a new separately committed policy revision recorded alongside the original; never rewrite this policy to fit results.

### Pass policy

Accept only when all conditions below pass on a packaged production build on **Windows 11 x64** and **macOS 13+ arm64**. Record hosted `windows-latest` and `macos-latest` runs separately as **Tier A**; only clean-machine **Tier B** establishes verified target support (D-05).

| ID | Required outcome on each target |
| --- | --- |
| P1 | The smoke report records distinct integer process ids for Main, renderer, Core and every active engine host, with 0 duplicate ids across those processes. |
| P2 | In the page, `typeof require` equals `"undefined"`; the renderer has 0 accessible Node require functions. |
| P3 | dependency-cruiser reports 0 violations of Main-never-opens-storage and network-only-in-egress rules over the application source used by the packaged build. |
| P4 | Every engine-crash feature case passes: 0 window terminations or reloads on host failure, host restart after backoff, and an unrequested Core kill produces a Core respawn and renderer reconnection. Test-only fault injection is exercised in the test build of the same source; process isolation and continued responsiveness are also observed on the packaged production build using external process termination. |
| P5 | Every ipc-validation feature case passes with 0 failed examples, including exact method lookup, strict fields, UTF-8 limits, side-effect exclusion, recovery and metadata-only logs. Boundary injection is tested on the same-source test harness; the production build exposes only the closed preload API. |

### Platforms actually run

No governed in-repository run has occurred. Windows 11 x64 and macOS 13+ arm64 are both **not run** under this policy; hosted Tier A runs have not been performed either. Record OS name, version, architecture, date, tier and existing evidence path for each later actual run.

### Fixtures

Use `features/core/ipc-validation.feature`, `features/ui/app-shell.feature` and `features/ui/engine-crash.feature`. The later fake-host harness exercises kill, exit0, exit1, abort, watchdog spin and bounded OOM; record fixture hashes and the build commit when it exists. Each UI launch uses a library folder with Persian letters and a space.

### Results

### Raw evidence

None collected for this policy. Later packaged smoke reports, feature-run output, process ids and boundary-lint output must be linked by their actual paths and run commit.

## License

The approved D-LICENSE decision is MIT for Danesh's original source only; ADR 0004 records it in Plan 01-02. Third-party dependencies and assets keep their licenses. D-02 excludes GPL, AGPL and LGPL components from distributed builds; node-llama-cpp, SQLite, OCR and voice probes still require notices and binary review. An engine ADR cannot be accepted before ADR 0004 is accepted.

## Packaging

electron-vite builds Main, Core and hosts as separate ESM entries under `out/main/`, with preload forced to `out/preload/index.cjs`. Native runtime dependencies remain external and their needed binaries unpacked from asar. ADR 0003 governs production fuses and signing; the separate Playwright test build retains only its required inspect fuse and never ships.

## Security

The page is untrusted; types never substitute for validation. Core is the storage authority, Main validates shell sender origins, and every host protocol is validated. Default-deny Chromium and Node egress layers complement path-based network lint. Logs exclude payloads, file contents and user-supplied strings. Test-only RPC and fault hooks are absent from production bundles and asar.

## Pros and Cons of the Options

- Isolated utility processes contain native crashes and allow a single storage writer; they require supervised lifecycle and explicit port reconnection.
- Main or renderer compute avoids port plumbing but violates the approved isolation and storage boundaries, so it is excluded.
- A localhost server introduces ports and an extra service lifecycle contrary to the local-first architecture, so it is excluded.
- Per-directory workspaces provide package boundaries but add unnecessary manifests; aliases preserve the approved source layout with lint-enforced boundaries.

## More Information

- [Approved walking skeleton](../../.planning/phases/01-secure-durable-foundation-packaging-gate/SKELETON.md).
- [Phase context, D-04 through D-24](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-CONTEXT.md).
- [Existing research, Patterns 1-4 and R1/R6/R7/R8](../../.planning/phases/01-secure-durable-foundation-packaging-gate/01-RESEARCH.md).

A probe that cannot load in a packaged utilityProcess on either target triggers the D-24 architecture decision checkpoint; it never silently moves to Main.
