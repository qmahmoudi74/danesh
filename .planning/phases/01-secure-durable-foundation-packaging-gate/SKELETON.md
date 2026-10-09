# Walking Skeleton — Danesh

**Phase:** 1
**Generated:** 2026-10-09
**Built by:** Plan 01-03 (tracer task), extended by Plans 01-05 to 01-14 without changing the decisions below. The Node egress guard (L3) and the zero-egress proof listed under Network belong to a follow-up plan (reserved id 01-15) that is not yet created.

## Capability Proven End-to-End

A learner opens Danesh on a clean Windows or macOS machine, sees a Persian-first RTL window with an honest "foundation build" status, opens «بررسی سامانه», presses «اجرای بررسی», and sees the «اجرای برنامه» and «پایگاه داده» rows pass: the request travelled renderer → sandboxed CommonJS preload → private MessagePort → Core utilityProcess → SQLite (WAL) in the library folder → back to the UI, while a separate engine-host utilityProcess is reachable from Core over a Main-brokered port.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Electron 44.7.0 (Chromium 152, Node 24.21.0) + React 19.3.0 + TypeScript 6.0.3 | Locked stack (CLAUDE.md). TS pinned to 6.0.x because typescript-eslint 8.71.1 peers `<6.1.0`. Electron's bundled Node is 24.21.0 (research R1), not 24.18.1. |
| Build | electron-vite 5.0.0 + Vite 7.3.7 + @vitejs/plugin-react 5.2.0; Core and every engine host are extra entries of the **main** build (`out/main/{index,core,engine-*}.js`, ESM); preload forced to CommonJS (`out/preload/index.cjs`) | Research Pattern 1 / R6. Sandboxed preloads cannot be ESM (Pitfall 3). |
| Process topology | Main (thin broker: windows, `app://`, supervisor, port brokering, Chromium egress block) · Renderer (sandboxed, no Node) · Core utilityProcess (single SQLite writer, RPC server, job kernel, CAS, System check) · one utilityProcess per engine host (`engine-sample`, `engine-llm`, `engine-ocr`, `engine-tts`) with no DB handle and no sockets | ADR 0001. Crash/OOM blast radius = one host (R8). Only Main can call `utilityProcess.fork`, so Main forks every host on Core's request and brokers each Core↔host port. |
| IPC | One closed zod contract map in `packages/contracts/src/rpc.ts` (`domain.verb` methods, strict objects, per-method UTF-8 byte limits). Renderer reaches Core only through `window.danesh.call(method, input)` / `window.danesh.on(topic, cb)` exposed by the preload, which holds the MessagePort privately. `shell.*` methods route to Main via a validated invoke channel. Receivers always re-validate. No electron-trpc. | PLAT-01, PLAT-02, research Pattern 2. |
| Renderer serving | Custom `app://danesh/` protocol (`protocol.handle`) reading from the asar with a traversal check and a per-response CSP nonce (`<meta property="csp-nonce">` for React Aria). Never `file://`, never a localhost server. | `GrantFileProtocolExtraPrivileges` off breaks `loadFile` from asar (R7). |
| Data layer | SQLite via better-sqlite3 13.0.3 (N-API prebuilds, externalized and unpacked from asar) behind a synchronous `Db` interface in `packages/storage`; WAL, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, STRICT tables; forward-only numbered SQL migrations embedded with Vite `?raw` and guarded by LF-normalized SHA-256 checksums + `PRAGMA user_version` | D-14, D-15, ADR 0002. `node:sqlite` availability is measured in the packaged Core and recorded, not adopted. |
| Large artifacts | Content-addressed store `blobs/sha256/<2 hex>/<64 hex>` written tmp → fsync → link/rename, hash-verified on read | PLAT-08, research Pattern 6. |
| Library location | `app.getPath('userData')`; on Windows relocated to `%LOCALAPPDATA%\Danesh` before `ready` unless `--user-data-dir` is given; layout `danesh.db`, `index.db` (reserved, rebuildable), `blobs/`, `backups/`, `tmp/`, `logs/`, `models/` | D-13 (costly to change after release), research Open Question 1. Paths are full Unicode; Persian + space paths are exercised by every E2E run. |
| Auth | None. Local single-user desktop app; no accounts, no network identity. | Brief: no accounts or cloud services. |
| Network | Default-deny in every process: Chromium `webRequest` cancel (L1), Node egress guard imported first in Core and every host (L3), `packages/egress` is the only module allowed to import network APIs (lint-enforced). Empty allowlist in Phase 1. | PLAT-05, D-17. |
| Deployment target | electron-builder 26.17.0 packaged builds: unsigned NSIS (Windows x64), ad-hoc signed `dir` + DMG (macOS arm64, hardened runtime). Production fuse set flipped by `electronFuses`. A separate test build (`DaneshTest`, inspect fuse on) is used only by Playwright. `--publish never` everywhere. | D-08, D-09, ADR 0003. No paid signing in Phase 1. |
| Local full-stack run | `pnpm build:test && pnpm test:e2e` (unpackaged test build under Playwright), `pnpm package && pnpm smoke:packaged` (packaged production build, headless `--smoke-test --smoke-out=<abs path>`). Every script that launches Electron removes `ELECTRON_RUN_AS_NODE` from the child environment. | The agent shell exports `ELECTRON_RUN_AS_NODE=1` (Pitfall 1). |
| Directory layout | `apps/{main,preload,renderer,core,desktop}`, `packages/{contracts,domain,storage,egress,engine-api,logging,engines/*}`, `features/{core,ui,steps}`, `tools/`, `docs/adr/`, `third_party/`, `resources/probes/`. Only `apps/desktop` is a pnpm workspace package (the assembly: build, packaging, native `dependencies`); source directories are imported through the path aliases `@danesh/<pkg>/<file>.ts` declared once in `aliases.ts` and `tsconfig.base.json`. Relative imports use explicit `.ts`/`.tsx` extensions so `node tools/x.ts` (type stripping) and Vite resolve the same files. | Deviation from research R6 (one workspace package per directory): same boundaries, enforced by dependency-cruiser on paths, without 13 extra manifests or lockfile churn. Recorded in ADR 0001. |
| Tests | Vitest 5.0.3 projects per directory + @amiceli/vitest-cucumber 8.0.0 for `features/core/*.feature`; Playwright 1.64.0 + playwright-bdd 9.2.1 for `features/ui/*.feature` against the Electron test build. Gherkin files are committed before any implementation (Plan 01-01). | D-20, D-21, EVAL-06. |

## Stack Touched in Phase 1

- [x] Project scaffold (framework, build, lint, test runner) — Plans 01-02, 01-03
- [x] Routing — hash routes `#/` (Home) and `#/system-check` — Plans 01-03, 01-06
- [x] Database — real write and read (`system_check_probe` row) in the tracer; migrations, backups, refusal and recovery in Plan 01-11
- [x] UI — «اجرای بررسی» wired through the closed preload API to Core — Plan 01-03
- [x] Deployment — packaged production build with headless smoke mode and a documented local full-stack run command — Plan 01-08

## Out of Scope (Deferred to Later Slices)

- PDF import, canonical document model, reader, outline, search (Phases 2-3).
- Model manager, downloads, consent UI, hardware probe (Phase 4); the probe engines here are packaging probes only (D-23).
- Job pause/cancel/retry for all job kinds and the job list (JOB-01/JOB-02, Phase 2).
- Library relocation UI and the settings page (Phase 11); opt-in update check (Phase 12).
- Real code signing, notarization, signed installers (Phase 12); Intel macOS and Windows arm64 (v2).
- i18next catalogs, themes, Persian-digit preference toggle and Jalali dates (Phase 3).
- Backup/restore UI and destructive-action patterns (Phase 12).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: import a PDF through a resumable job (new job kind on the Phase 1 kernel, new engine host on the same host runtime) into the canonical block model.
- Phase 3: read reconstructed content in the Persian-first reader (new renderer routes on the same `app://` shell and RPC map).
- Phase 4: manage evaluated local models (downloads through the egress broker's first allowlist entries).
- Phase 5: OCR, tables, equations and figures in the reader (spike-chosen engines replace the probes behind the engine-host adapter).
- Phase 6: study by concept through the curriculum.
- Phase 7: Persian translation and normalization.
- Phase 8: grounded lessons and scoped Q&A.
- Phase 9: retrieval practice and FSRS recall.
- Phase 10: local audio.
- Phase 11: opt-in web research and settings.
- Phase 12: data ownership, hardening and signed release.
