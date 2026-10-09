# Phase 1: Secure, Durable Foundation & Packaging Gate - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning
**Mode:** `--auto`. Every decision below is the recommended option, auto-selected (see `01-DISCUSSION-LOG.md`). The product decision D-LICENSE and the GitHub push are deliberately **not** decided here. They are captured as human checkpoints.

<domain>
## Phase Boundary

This phase delivers an installable Danesh desktop shell for Windows and macOS. The shell is:
- **Hardened:** sandboxed renderer, typed and validated IPC, default-deny network egress, production Electron fuses.
- **Crash-isolated:** each native engine runs in its own `utilityProcess` under a supervisor.
- **Durable:** a versioned SQLite store with forward-only, backed-up migrations, a content-addressed blob store with atomic writes, and a durable job/task kernel that resumes after a restart or kill -9 without redoing work.

A packaged smoke test proves the shell launches on clean machines. It opens the database and loads a probe LLM, OCR and TTS engine from the unpacked asar, and that includes a Windows profile whose path contains Persian characters and spaces. This phase also establishes the project's engineering discipline: ADRs backed by spikes, acceptance scenarios written before implementation, and verification reports with evidence paths. It records Danesh's own license once product review decides it.

**Requirements in scope:** PLAT-01..08, PLAT-11, JOB-03, REL-01, REL-02, REL-08, EVAL-05, EVAL-06, EVAL-07.

**Not in this phase:**
- PDF import and the canonical document model (Phase 2).
- Reader and localization UI (Phase 3).
- Model manager and downloads (Phase 4).
- Any real engine choice (made by the spike track and ADRs).
- Web research and the consent UI (Phase 11).
- Signed or notarized installers (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Product-decision gates (D-LICENSE, D-PLATFORM)
- **D-01:** D-LICENSE (Danesh's own repository license) is **not decided by this discussion**. The plan must include a `checkpoint:decision` (human) that presents the candidates:
  - Apache-2.0: permissive, with a patent grant. Fits the research's default permissive path.
  - MIT: permissive.
  - AGPL-3.0-or-later: would make MuPDF and espeak-ng usable without a commercial license.

  REL-08 cannot close, no `LICENSE` file may be committed, and the license ADR cannot be written until the user decides. The prior LICENSE was removed in commit `b2016c7`; do not restore it without confirmation.
  — **Reversibility:** one-way — once code is published under a license on the public repo, that grant cannot be revoked for already-released code. Relicensing later needs consent from every contributor.
- **D-02:** Until D-LICENSE is decided, every dependency added in Phase 1 must be permissively licensed (MIT, Apache-2.0, BSD, ISC; OFL-1.1 for fonts). No GPL or AGPL package may enter the lockfile, directly or transitively. Check this with a license-scan script that runs in CI.
- **D-03:** Phase 1 work does not wait on D-LICENSE. Scaffold, kernel, tests and smoke test proceed in parallel. Only closing REL-08 and committing the LICENSE file wait, and the phase cannot be marked complete until both are done.
- **D-04:** The verified smoke-test targets are the D-PLATFORM default: **Windows 11 x64** and **macOS 13+ on Apple Silicon**. Intel Macs and Windows arm64 are not built or smoke-tested in Phase 1 and are reported as "untested".

### Clean-machine verification standard (REL-02, PLAT-11)
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

### Code signing scope in Phase 1
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

### What the Phase 1 app visibly does
- **D-10:** The production window opens as a Persian-first RTL shell: `<html lang="fa" dir="rtl">`, bundled Vazirmatn font, logical CSS properties only. It shows the app name and an honest status: this is a foundation build and study features are not available yet. There is **no mock** reader, curriculum, import button or placeholder that implies functionality (brief rule: no mock UI presented as real).
- **D-11:** A **System check** screen (Persian label «بررسی سامانه»), reachable from the app menu, runs the same checks as the packaged smoke test: database, storage, engine hosts and egress block. It shows pass/fail in plain Persian with an expandable technical-details section, and can export the same JSON report. It is genuine diagnostic functionality and is the tool for Tier B clean-machine evidence.
- **D-12:** From System check, the user can start a clearly labeled **sample durable job** that processes a bundled sample file in N idempotent chunks. Killing the app, or kill -9 on Core, mid-job and relaunching shows the job resuming without redoing completed chunks. This exercises JOB-03 end to end through real UI without pretending to be PDF import.

### Library location and durability policy
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

### GitHub publishing and CI (REL-01)
- **D-18:** Phase 1 authors the CI workflows on GitHub Actions, as a matrix of `windows-latest` and `macos-latest` arm64. They cover lint, typecheck, unit tests, boundary lint, license scan, packaging and the packaged smoke test, and they are validated by running the equivalent package scripts locally. **Pushing to `origin` (`git@github.com:qmahmoudi74/danesh.git`), or changing the repository's visibility, needs explicit user authorization.** Plan a `checkpoint:human-action`: the user pushes, or authorizes a push, and confirms CI is green on both OSes. Until then REL-01 is reported "partially verified: workflows authored, not yet run on GitHub". Local `main` is already 6 planning commits ahead of `origin/main`; none have been pushed.

### Engineering discipline formats (EVAL-05, EVAL-06, EVAL-07)
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

### Smoke-test engine probes (S-PACKAGE)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product intent and scope
- `PRODUCT_BRIEF_DANESH.md`: confirmed product intent and firm technical constraints. It sits at the repo root and is **currently untracked in git**, so read it from the working tree.
- `.planning/PROJECT.md`: Core Value, Constraints, Out of Scope, Key Decisions.
- `.planning/REQUIREMENTS.md`: PLAT-01..08, PLAT-11, JOB-03, REL-01, REL-02, REL-08, EVAL-05..07, and the **Open Product Decisions** table (D-LICENSE, D-PLATFORM, D-DISTRIB).
- `.planning/ROADMAP.md`: §Phase 1 (goal, success criteria, gates), §Engine Spike Track (S-PACKAGE), §Open Product Decision Gates, §Cross-Cutting Requirement Anchoring.

### Architecture and stack
- `.planning/research/ARCHITECTURE.md` §Standard Architecture, §Recommended Project Structure, §Process Model (IPC design, crash/OOM isolation matrix), §Durable Job System (job/task schema, state machine, boot recovery, scheduler), §Privacy Architecture (default-deny egress, egress broker), §Schema Versioning and Migrations, §Architectural Patterns 1/4/5, §Suggested Build Order.
- `.planning/research/STACK.md` §Core Technologies, §Process and worker architecture, §Database and search, §Testing and evaluation, §IPC validation and security (CSP, fuses, origin rules), §Native dependency support matrix, §Development Tools, §Installation, §What NOT to Use, §Version Compatibility.
- `.planning/research/SUMMARY.md` §Implications for Roadmap (Phase 1 and the spike track), §Gaps to Address.

### Pitfalls this phase must prevent
- `.planning/research/PITFALLS.md` Pitfall 8: native engines packaged wrongly (ABI, arch, asar, signing).
- `.planning/research/PITFALLS.md` Pitfall 9: blocking the main process; native crash taking down the app.
- `.planning/research/PITFALLS.md` Pitfall 10: memory/VRAM mismanagement and OOM, for supervisor and OOM containment.
- `.planning/research/PITFALLS.md` Pitfall 11: durable jobs that lose verified output or corrupt on restart.
- `.planning/research/PITFALLS.md` Pitfall 17: Windows/macOS path, profile and storage assumptions.
- `.planning/research/PITFALLS.md` Pitfall 19: hidden network egress and telemetry, including Electron defaults.
- `.planning/research/PITFALLS.md` Pitfall 21: engine and model licensing traps with a public repository.
- `.planning/research/PITFALLS.md` Pitfall 23: Electron security shortcuts with untrusted content.
- `.planning/research/PITFALLS.md` Pitfalls 33 and 35: locale, calendar, window title and filename encoding.

No ADRs exist yet. This phase creates `docs/adr/` (see D-19).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. This is a greenfield repository. Tracked files are only `.planning/` and `.claude/CLAUDE.md`. The `.claude/` GSD tooling and `PRODUCT_BRIEF_DANESH.md` are untracked.

### Established Patterns
- None in code yet. The patterns this phase establishes become the baseline for every later phase:
  - typed and validated RPC contracts
  - a pure-domain / impure-shell split
  - durable tasks with transactional output
  - supervisor with brokered ports
  - forward-only migrations with backup
  - default-deny egress through a single broker
  - ADR, Gherkin and evidence-report discipline

### Integration Points
- Git remote `origin` is `git@github.com:qmahmoudi74/danesh.git`, and the `main` branch is 6 commits ahead of `origin/main`. Pushing requires user authorization (D-18).
- Local toolchain on this machine: Windows 11, Node 24.21.0, npm 12.2.0, pnpm 12.9.1.

</code_context>

<specifics>
## Specific Ideas

- The System check screen doubles as the human-run clean-machine evidence tool, and as the first real Persian RTL surface for checking font and direction basics before Phase 3.
- The sample durable job exists to make crash/resume behavior visible and testable through real UI in the first phase, without faking any study feature.
- Brief rule for agents: make reasonable technical choices and record trade-offs in ADRs without asking the user to pick packages. Flag anything that would change product intent, such as the license or platform tier.

</specifics>

<deferred>
## Deferred Ideas

- **Library relocation UI** (choose and move the library or models folder): Phase 11 settings page (UX-06).
- **Opt-in update check:** Phase 12 (REL-05). In Phase 1 it exists only as a denied egress stub.
- **OS-level egress hardening** (macOS sandbox profile, Windows firewall rule for engine hosts): evaluate after S-PACKAGE, at the earliest Phase 11 or 12. Phase 1 relies on lint plus a network-blocked test.
- **Real code signing and notarization** (Developer ID, Windows Artifact Signing or OV/HSM): Phase 12 (REL-03, D-DISTRIB).
- **Verified support for Intel Macs and Windows arm64:** v2 (PLAT-V2-01).
- **Consent-gate UI** for web research and downloads: Phase 4 (downloads) and Phase 11 (web). Phase 1 only provides the default-deny policy and the broker skeleton.

</deferred>

---

*Phase: 01-secure-durable-foundation-packaging-gate*
*Context gathered: 2026-10-09*
