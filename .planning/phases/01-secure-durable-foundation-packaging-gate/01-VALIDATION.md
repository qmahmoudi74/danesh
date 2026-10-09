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

Bound to plans 01-01..01-16 on 2026-10-09 (Plan 01-04 was merged into 01-02; Plans 01-15 and 01-16 were added after the first plan-checker pass). Task IDs are `<plan>-T<n>`. E2E commands select scenarios by plan tag (`DANESH_E2E_GREP=@plan-01-NN`) instead of `-g`, and Electron-launching commands run under `env -u ELECTRON_RUN_AS_NODE`. The Vitest project for supervision and jobs is `domain` (not `jobs`).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-03-T1, 01-03-T3, 01-07-T3 | 01-03, 01-07 | 2, 4 | PLAT-01 | T-01-06, T-01-07, T-01-17 | Sandbox, context isolation, no Node integration, CSP nonce; zero CSP violations; navigation lockdown | unit + E2E | `pnpm vitest run --project main` ; `DANESH_E2E_GREP=@plan-01-07 pnpm test:e2e` | ❌ W0 | ⬜ pending |
| 01-07-T1, 01-07-T2 | 01-07 | 4 | PLAT-02 | T-01-15, T-01-16 | Malformed, unknown, oversize and wrong-sender IPC is rejected and logged with schema name, sender and error, never the payload | core Gherkin + E2E | `pnpm vitest run --project contracts --project core --project logging` | ❌ W0 | ⬜ pending |
| 01-03-T2, 01-09-T1..T3 | 01-03, 01-09 | 2, 6 | PLAT-03 | T-01-25, T-01-47 | Each engine runs under its own pid. The UI heartbeat stays within policy under load. | packaged smoke + E2E + Tier B | `pnpm smoke:packaged --persian-paths` ; `DANESH_E2E_GREP=@plan-01-09 pnpm test:e2e` | ❌ W0 | ⬜ pending |
| 01-14-T1..T3 | 01-14 | 11 | PLAT-04 | T-01-35, T-01-36, T-01-37, T-01-50 | Kill, abort, exit0, spin and bounded OOM all leave the task retriable; the host restarts with backoff and the app stays alive | unit + core Gherkin + E2E crash injection | `pnpm vitest run --project domain` ; `DANESH_E2E_GREP=@plan-01-14 pnpm test:e2e` | ❌ W0 | ⬜ pending |
| 01-07-T3, 01-15-T1..T3 | 01-07, 01-15 | 4, 12 | PLAT-05 | T-01-46, T-01-51, T-01-52, T-01-53, T-01-54, T-01-55 | Zero outbound attempts: Chromium cancel (L1), recording proxy (L2), Node guard first in Core and every host (L3), process-tree endpoint sampler (L4), each with a positive control; empty frozen production allowlist; exact normalized-host policy; lint forbids network modules outside packages/egress | unit + core Gherkin + E2E with monitors + packaged smoke | `pnpm vitest run --project egress` ; `DANESH_E2E_GREP=@plan-01-15 pnpm test:e2e` ; `pnpm depcruise && pnpm lint` | ❌ W0 | ⬜ pending |
| 01-11-T2, 01-07-T3 | 01-11, 01-07 | 8, 4 | PLAT-06 | T-01-28, T-01-48, T-01-18 | Forward-only migrations; a checksum mismatch is refused; a newer schema is refused via a read-only probe; single instance | core Gherkin + golden DBs + E2E | `pnpm vitest run --project storage` ; `DANESH_E2E_GREP=@plan-01-11 pnpm test:e2e` | ❌ W0 | ⬜ pending |
| 01-11-T3 | 01-11 | 8 | PLAT-07 | T-01-29, T-01-30 | Backup before migrating; a failed migration rolls back; the recovery state offers the backup; the last 3 backups are kept; a backup restores at the previous version | core Gherkin + kill test | `pnpm vitest run --project storage` | ❌ W0 | ⬜ pending |
| 01-12-T1, 01-12-T2 | 01-12 | 9 | PLAT-08 | T-01-31, T-01-32 | CAS writes are atomic and deduplicated; a crash mid-write is safe; EPERM is retried; tmp is swept; paths are derived only from the hash | unit + core Gherkin + crash injection | `pnpm vitest run --project storage` | ❌ W0 | ⬜ pending |
| 01-06-T3, 01-07-T3, 01-08-T2, 01-09-T2 | 01-06..01-09 | 3-6 | PLAT-11 | T-01-21 | Works with Persian and space characters in the userData and install paths; the installed tree matches the build manifest; UTF-16 path bound | unit + packaged smoke + scripted NSIS install | `pnpm smoke:packaged --persian-paths --install-nsis` | ❌ W0 | ⬜ pending |
| 01-13-T1..T3 | 01-13 | 10 | JOB-03 | T-01-33, T-01-34, T-01-49 | SIGKILL after claim, after blob write and after commit all resume without redoing work (`exec_log` has one row per task); the app is killed mid sample-job | unit with real child kill + core Gherkin + E2E | `pnpm vitest run --project domain --project storage` ; `DANESH_E2E_GREP=@plan-01-13 pnpm test:e2e` | ❌ W0 | ⬜ pending |
| 01-02-T3, 01-10-T1..T3 | 01-02, 01-10 | 1, 7 | REL-01 | T-01-26, T-01-27, T-01-42 | Workflows are authored and the equivalent scripts pass locally. GitHub green only after an authorized push. | static + CI | `pnpm check:ci` ; `pnpm ci:local` (GitHub run = `checkpoint:human-action` in 01-10) | ❌ W0 | ⬜ pending |
| 01-06-T1, 01-08-T1..T3, 01-09-T3, 01-10-T2, 01-15-T3, 01-16-T1, 01-16-T2 | 01-06, 01-08, 01-09, 01-10, 01-15, 01-16 | 3-13 | REL-02 | T-01-19, T-01-20, T-01-56, T-01-57 | The packaged smoke JSON covers the D-07 checks: production fuses, every engine loaded from `app.asar.unpacked`, egress-zero, codesign on macOS. Verified only with Tier B evidence per OS (blocking human-action checkpoints 01-16-T1 Windows and 01-16-T2 macOS); Tier A only is partially verified; none is blocked | packaged smoke + manual Tier B | `pnpm smoke:packaged` ; Tier B runbooks (checkpoints in 01-16) | ❌ W0 | ⬜ pending |
| 01-02-T4, 01-05-T1 | 01-02, 01-05 | 1, 3 | REL-08 | T-01-10, T-01-11 | D-LICENSE resolved by the user on 2026-10-09: MIT LICENSE, manifests MIT, ADR 0004 accepted; permissive-only scan; non-commercial licenses rejected; NOTICE/OFL obligations generated | doc check + license scan | `pnpm licenses:scan` ; `pnpm check:adr` | ❌ W0 | ⬜ pending |
| 01-01-T3, 01-05-T2, 01-16-T3 | 01-01, 01-05, 01-16 | 1, 3, 13 | EVAL-05 | T-01-02 | ADRs 0001–0003 carry pass policies before any run; spike results and honest statuses are recorded from actual evidence in 01-16-T3 | doc check | `pnpm check:adr` | ❌ W0 | ⬜ pending |
| 01-01-T1, 01-01-T2, 01-05-T2 | 01-01, 01-05 | 1, 3 | EVAL-06 | T-01-01 | Every `.feature` is committed before its steps and covers the six scenario kinds | git-order script + missing-step failure | `node tools/check-features-first.ts` (strict after Plan 01-15; `--allow-unbound` only before it) | ❌ W0 | ⬜ pending |
| 01-05-T3, 01-16-T4 | 01-05, 01-16 | 3, 13 | EVAL-07 | T-01-12 | The verification report follows its schema and every evidence path resolves (report itself written at /gsd-verify-work) | script | `pnpm vitest run --project tools tools/check-report.test.ts` ; `node tools/check-report.ts --phase 01` | ❌ W0 | ⬜ pending |

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
| Install and run in a real Windows 11 x64 profile whose path contains Persian characters and spaces, then export System check | REL-02, PLAT-11 | Hosted runners are Windows Server 2025 and cannot provide a clean Windows 11 user profile | Tier B runbook (checkpoint in Plan 01-16 Task 1): create a local user, for example with `net user` and a Persian name containing spaces. Silently install the NSIS build, launch it, run System check, export the JSON, and store the evidence under the phase directory. |
| Install on a clean macOS 13+ Apple Silicon account or VM, run `codesign --verify --deep --strict`, then export System check | REL-02, PLAT-03 | No macOS hardware in this session. The `macos-latest` runner is macOS 26, and there is no macOS 13 runner. | `checkpoint:human-action` (Plan 01-16 Task 2): the user runs the Tier B macOS runbook and returns the evidence files. |
| Capture egress with an external firewall or packets on a clean machine | PLAT-05 | Supplements the in-app L1–L4 layers with an observer outside the app | Run the System check sample flow with an OS firewall log or packet capture active, and record a zero-connection log. |
| GitHub Actions green on both OSes | REL-01 | Needs the user to authorize pushing to `origin` | `checkpoint:human-action`: push or authorize a push, then link the run URLs in the verification report. |
| Danesh project license decision | REL-08 | Product decision (D-LICENSE); must not be auto-decided | Resolved by the user on 2026-10-09: MIT for Danesh's original code. Plan 01-02 Task 4 records LICENSE and ADR 0004 autonomously; no checkpoint remains. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
