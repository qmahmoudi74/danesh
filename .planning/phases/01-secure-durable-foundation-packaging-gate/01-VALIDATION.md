---
phase: "1"
slug: "secure-durable-foundation-packaging-gate"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `01-RESEARCH.md` §Validation Architecture. The task-level map is filled in once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Unit tests and non-UI Gherkin: Vitest 5.0.3 plus @amiceli/vitest-cucumber 8.0.0. UI Gherkin: @playwright/test 1.64.0 plus playwright-bdd 9.2.1, run against the Electron **test build**. |
| **Config file** | None yet. Wave 0 creates `vitest.config.ts` (projects: `packages/*`, `apps/core`) and the Playwright config for the desktop app. |
| **Quick run command** | `pnpm vitest run --project <pkg>` (single package) |
| **Full suite command** | `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm licenses:scan && pnpm vitest run && pnpm package:test && pnpm test:e2e && pnpm smoke:packaged` |
| **Estimated runtime** | Quick under 30 seconds per package. Full suite several minutes, because packaging plus the packaged smoke test dominate. |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched package, plus `pnpm lint`.
- **After every plan wave:** Run the full Vitest suite plus `pnpm depcruise`, `pnpm licenses:scan` and `pnpm test:e2e` against the test build.
- **Before `/gsd-verify-work`:** The full suite must be green locally on Windows, the packaged smoke JSON must be captured, and the CI workflows must be present. Tier B evidence is either recorded or reported as blocked.
- **Max feedback latency:** 30 seconds for the per-task quick command.

---

## Per-Task Verification Map

Requirement-level map from research. Task IDs are bound once the plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PLAT-01 | Renderer compromise reaching Node | Sandbox, context isolation, no Node integration, CSP nonce; zero CSP violations; navigation lockdown | unit + E2E | `pnpm vitest run --project main` ; `pnpm test:e2e -g @req-PLAT-01` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-02 | Malformed or oversized IPC | Malformed, unknown, oversize and wrong-sender IPC is rejected and logged with schema name, sender and error, never the payload | core Gherkin + E2E | `pnpm vitest run --project contracts --project core` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-03 | — | Each engine runs under its own pid. The UI heartbeat stays within policy under load. | packaged smoke + Tier B | `pnpm smoke:packaged` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-04 | Orphaned engine process | Kill, abort, exit0, spin and bounded OOM all leave the task retriable; the host restarts with backoff and the app stays alive | unit + E2E crash injection | `pnpm vitest run --project jobs` ; `pnpm test:e2e -g @req-PLAT-04` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-05 | Hidden egress | Zero outbound connections across L1–L4; lint enforces a single egress module; positive controls prove the monitor works | E2E + lint | `pnpm test:e2e -g @req-PLAT-05` ; `pnpm depcruise && pnpm lint` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-06 | Newer-schema database opened read-write | Forward-only migrations; a checksum mismatch is refused; a newer schema is refused via a read-only probe | core Gherkin + golden DBs | `pnpm vitest run --project storage` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-07 | — | Backup before migrating; a failed migration rolls back; the recovery state offers the backup; the last 3 backups are kept | core Gherkin | `pnpm vitest run --project storage` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-08 | Path traversal | CAS writes are atomic and deduplicated; a crash mid-write is safe; EPERM is retried; tmp is swept; paths are derived only from the hash | unit + crash injection | `pnpm vitest run --project storage` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-11 | — | Works with Persian and space characters in the userData and install paths; the installed tree matches the build manifest | unit + packaged smoke + scripted NSIS install | `pnpm smoke:packaged --persian-paths` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | JOB-03 | — | SIGKILL after claim, after blob write and after commit all resume without redoing work (`exec_log` has one row per task); Core is killed mid sample-job | unit with real child kill + E2E | `pnpm vitest run --project jobs` ; `pnpm test:e2e -g @req-JOB-03` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REL-01 | Supply-chain install scripts | Workflows are authored and the equivalent scripts pass locally. GitHub green only after an authorized push. | static + CI | `pnpm ci:local` (GitHub run = `checkpoint:human-action`) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REL-02 | Fuse downgrade | The packaged smoke JSON covers every D-07 check: production fuses, egress = 0, every engine loaded from `app.asar.unpacked` | packaged smoke + Tier B | `pnpm smoke:packaged` ; Tier B runbook | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REL-08 | — | ADR 0004 and the LICENSE file exist only after the D-LICENSE decision | manual checkpoint + doc check | `node tools/check-report.ts` | blocked on D-01 | ⬜ pending |
| TBD | TBD | TBD | EVAL-05 | — | ADRs 0001–0003 carry Spike Evidence (platforms actually run, pass policy commit) | doc check | `node tools/check-adr.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EVAL-06 | — | Every `.feature` is committed before its steps and covers the six scenario kinds | git-order script + missing-step failure | `node tools/check-features-first.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EVAL-07 | — | The verification report follows its schema and every evidence path resolves | script | `node tools/check-report.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` (projects) and the desktop Playwright config. Gitignore `.features-gen/`.
- [ ] `packages/engine-api` fake engine host with fault modes (`exit0`, `abort`, `spin`, bounded OOM). `packages/domain` jobs state machine and backoff policy (pure).
- [ ] Skeleton `features/{ui,core}/*.feature` files committed before implementation (EVAL-06).
- [ ] `tools/{license-scan,fetch-probes,check-report,check-features-first,check-adr}.ts`.
- [ ] `tools/probes.lock.json`, with URLs pinned by commit plus sha256.
- [ ] Packaged smoke runner plus the `smoke-report` zod schema.
- [ ] `docs/adr/0000-template.md`, `third_party/binary-licenses.json` and `resources/probes/NOTICE`.
- [ ] Framework install: `vitest@5.0.3`, `@amiceli/vitest-cucumber@8.0.0`, `@playwright/test@1.64.0` and `playwright-bdd@9.2.1`, plus the other pins in `01-RESEARCH.md` §Standard Stack.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install and run in a real Windows 11 x64 profile whose path contains Persian characters and spaces, then export System check | REL-02, PLAT-11 | Hosted runners are Windows Server 2025 and cannot provide a clean Windows 11 user profile | Tier B runbook: create a local user, for example with `net user` and a Persian name containing spaces. Silently install the NSIS build, launch it, run System check, export the JSON, and store the evidence under the phase directory. |
| Install on a clean macOS 13+ Apple Silicon account or VM, run `codesign --verify --deep --strict`, then export System check | REL-02, PLAT-03 | No macOS hardware in this session. The `macos-latest` runner is macOS 26, and there is no macOS 13 runner. | `checkpoint:human-action`: the user runs the Tier B macOS runbook and returns the evidence files. |
| Capture egress with an external firewall or packets on a clean machine | PLAT-05 | Supplements the in-app L1–L4 layers with an observer outside the app | Run the System check sample flow with an OS firewall log or packet capture active, and record a zero-connection log. |
| GitHub Actions green on both OSes | REL-01 | Needs the user to authorize pushing to `origin` | `checkpoint:human-action`: push or authorize a push, then link the run URLs in the verification report. |
| Danesh project license decision | REL-08 | Product decision (D-LICENSE); must not be auto-decided | `checkpoint:decision`: the user picks Apache-2.0, MIT or AGPL-3.0-or-later. ADR 0004 and the LICENSE file follow. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
