# Phase 1: Secure, Durable Foundation & Packaging Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 1-Secure, Durable Foundation & Packaging Gate
**Areas discussed:** Product-decision gates, Clean-machine verification standard, Code signing scope, What the Phase 1 app visibly does, Library location & durability, GitHub publishing & CI, Engineering discipline formats, Smoke-test engine probes
**Mode:** `--auto`. No questions were shown to the user. Each choice is the recommended option, auto-selected. The items marked "checkpoint" go to the user at execution time.

---

## Product-decision gates

| Option | Description | Selected |
|--------|-------------|----------|
| Raise D-LICENSE as a human checkpoint; permissive-only dependencies until decided | Do not choose the license in an automated pass; offer Apache-2.0, MIT or AGPL-3.0 at execution | ✓ |
| Assume Apache-2.0 now | Commit a permissive LICENSE immediately | |
| Assume AGPL-3.0 now | Enables MuPDF/espeak-ng; strong copyleft for all users | |

**Choice:** [auto] Raise as a checkpoint (recommended). The brief requires that product-intent choices be flagged, not decided silently.
**Notes:** The platform tier defaults to Windows 11 x64 plus macOS 13+ Apple Silicon (the D-PLATFORM default). Other architectures are reported as untested.

---

## Clean-machine verification standard

| Option | Description | Selected |
|--------|-------------|----------|
| Two tiers: CI runners (partial) plus a human-run clean-machine runbook (verified) | Honest evidence levels; Persian-named Windows profile with spaces | ✓ |
| CI runners only | GitHub-hosted runners are not clean user machines | |
| Manual only | Loses regression protection | |

**Choice:** [auto] Two tiers (recommended).
**Notes:** macOS Tier B needs the user's hardware or VM, so it is a human-action checkpoint.

---

## Code signing scope in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| No paid signing: macOS ad-hoc with deep-verify, unsigned Windows NSIS; real signing in Phase 12 | Proves nested-binary signing structure early without accounts or cost | ✓ |
| Full Developer ID plus Windows signing now | Needs accounts (D-DISTRIB) and money; belongs to REL-03 | |
| No signing checks at all | Hides notarization blockers until the release phase | |

**Choice:** [auto] Ad-hoc plus deep-verify (recommended).

---

## What the Phase 1 app visibly does

| Option | Description | Selected |
|--------|-------------|----------|
| Honest Persian RTL shell, real System check screen, labeled sample durable job | Real diagnostics; no mock study features | ✓ |
| Headless smoke test only, blank window | Nothing for a human to verify on a clean machine | |
| Placeholder reader/import UI | Violates the brief's no-mock-UI rule | |

**Choice:** [auto] Shell, System check and sample job (recommended).

---

## Library location and durability

| Option | Description | Selected |
|--------|-------------|----------|
| `userData` default, full-Unicode paths, single writer, WAL with synchronous=FULL, keep 3 pre-migration backups | Matches the research and PLAT-11; relocation deferred to settings | ✓ |
| User-chosen library folder on first run | Adds first-run UI before there is anything to store | |
| ASCII-only fallback location | Masks PLAT-11 failures instead of fixing them | |

**Choice:** [auto] `userData` default (recommended).
**Notes:** The DB driver is better-sqlite3 behind an adapter. The S-PACKAGE spike also evaluates node:sqlite.

---

## GitHub publishing and CI

| Option | Description | Selected |
|--------|-------------|----------|
| Author workflows and validate locally; push only on explicit user authorization (checkpoint) | The brief forbids push/publish without authorization | ✓ |
| Push automatically to run CI | Violates the authorization rule | |
| Skip CI until later | REL-01 belongs to this phase | |

**Choice:** [auto] Author locally, push behind a checkpoint (recommended).

---

## Engineering discipline formats

| Option | Description | Selected |
|--------|-------------|----------|
| MADR-style ADRs with spike-evidence/license/packaging/security sections; Gherkin via playwright-bdd and vitest-cucumber; evidence-path verification report | Matches EVAL-05/06/07 and the research tooling | ✓ |
| Free-form docs | Not auditable | |

**Choice:** [auto] MADR plus Gherkin plus evidence report (recommended).

---

## Smoke-test engine probes

| Option | Description | Selected |
|--------|-------------|----------|
| License-clean tiny probes (GGUF via node-llama-cpp, OCR, an espeak-free TTS), each in its own utilityProcess; ≤150 MB; stop on any load failure | Proves packaging without committing to engines or GPL | ✓ |
| Use the intended production engines now | Engine choices belong to the spike track and ADRs | |
| Skip native probes | Defers the riskiest packaging unknown | |

**Choice:** [auto] License-clean probes (recommended).

---

## Claude's Discretion

- Monorepo tool (pnpm or npm workspaces), package layout following ARCHITECTURE.md, boundary-lint tool.
- Exact version pins (following STACK.md, re-checked at scaffold time), RPC registry design, supervisor/backoff parameters, crash-injection mechanism, fake-engine harness, log rotation.
- UI toolkit for the minimal shell (Tailwind 4 logical properties plus React Aria Components) and i18n scaffolding.

## Deferred Ideas

- Library relocation UI goes to Phase 11 settings.
- Opt-in update check goes to Phase 12.
- OS-level egress hardening is evaluated after S-PACKAGE.
- Real signing and notarization go to Phase 12.
- Intel Mac and Windows arm64 go to v2.
- Consent-gate UI goes to Phase 4 (downloads) and Phase 11 (web).
