---
gsd_state_version: "1.0"
current_phase: 1
current_phase_name: Secure, Durable Foundation & Packaging Gate
status: in_progress
stopped_at: Plan 01-14 complete on Windows; 13/16 Phase 1 plans, 0/12 phases; next 01-10 platform verification, 01-15 gated on 01-10; Tier B open
last_updated: "2026-10-10"
last_activity: 2026-10-10 (all 14 supervision scenarios pass; 157 domain tests; 666 broad units; four broader UI failures retained; zero production hooks)
state_head: 382c80d7969cb8d1078febe47323647f204b0444
progress:
  total_phases: 12
  completed_phases: 0
  total_plans: 16
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09)

**Core value:** A learner can study their own PDFs and achieve delayed, AI-independent recall and application of the material, built on faithfully reconstructed, source-grounded content that never invents facts.
**Current focus:** Phase 1: Secure, Durable Foundation & Packaging Gate

## Current Position

Phase: 1 (Secure, Durable Foundation & Packaging Gate) — IN PROGRESS
Plan: 13 of 16 completed. Plan 01-14 has passed all three tasks on Windows. PDF-01/PDF-02 remain provisional early increments; the original-page UI is removed in favor of semantic content and inspectable raw excerpts. No Phase 2/3 or learning-outcome completion is claimed.
Status: Plan 01-14 is complete with Windows-only acceptance (382c80d; canonical summary fb1b1b6). Plan 01-10 remains partial, macOS investigation is deferred and Tier B remains outstanding. Plan 01-15 explicitly depends on 01-10 as well as 01-14, so it is not dependency-ready.
Last activity: 2026-10-10. Domain: 157 pass; broad units: 666 pass; final mandatory supervision plus source-evidence E2E: 15 pass, none skipped. Broad E2E: 68 pass, 4 fail, 8 future Plan 01-15 skips. Reader clipboard and window-size failures reproduced; two pixel-width assertions remain tracked. No full green E2E run is claimed. Formatting/lint/types/dependency boundaries pass; production build and zero-hook scan pass; features-first with --allow-unbound passes.

Progress: 13/16 current-phase engineering plans; 0/12 phases. Product delivery is described below, without an overall percentage.

## Performance Metrics

## Product capabilities (2026-10-10)

Plan counts measure Phase 1 engineering execution only, never overall Danesh delivery.

| Outcome | Status | Requirements and actual evidence / missing behavior |
|---------|--------|----------------------------------------------------|
| Faithful PDF ingestion | Partially implemented | DOC-01..09; PDF-01/02 summaries: immutable CAS originals, deduplication, refusal, provisional heading/paragraph extraction. Printed fixtures only; full canonical types and real-world fidelity not verified. |
| Semantic Reader | Partially implemented | READ-01..12; PDF-02 and brief-alignment E2E: selectable mixed-direction text, source-block raw excerpts. No PDF viewer. Outline, saved position, search and concept navigation missing. |
| Local AI runtime | Partially implemented | MODEL-01..08; 01-09 native offline probes and supervised processes. No user model registry, downloads or task-quality evaluation. |
| Document intelligence | Not implemented | DOC-06, DOC-10..14, DOC-20; scanned pages are explicitly marked needs-OCR; structured OCR/layout pipeline not delivered. |
| Knowledge map and curriculum | Not implemented | KNOW-01..09; Phase 6 has no implementation. |
| Translation and normalization | Not implemented | LANG-01..08; Phase 7 has no implementation. |
| Grounded lessons and Q&A | Not implemented | LESSON-01..10; Phase 8 has no implementation. |
| Active learning and memory | Not implemented | LEARN-01..10; Phase 9 has no implementation or delayed recall evidence. |
| Natural local audio | Partially implemented | AUDIO-01..09; 01-09 TTS packaging probe only. No learner playback, Persian naturalness/listener evaluation or cached lesson audio. |
| Privacy, portability and release readiness | Partially implemented | PLAT-01..08, UX-07..09, REL-01..08; 01-11/12/13 Windows storage/recovery verified. Full process egress, portability and signed release missing; 01-10 and Tier B blocked on platform evidence. |

Owner decision: the latest product direction supersedes PDF-01's original-page UI. The confirmed brief already excludes PDF viewing/navigation. The revised acceptance scenarios were committed in 0a16d6a before implementation. Immutable originals, existing extraction data and internal PDF engines are retained. Roadmap review found no further direct contradiction: Phases 3/6/7/9 specify semantic reading, hierarchical curriculum, full-complexity normalization and retrieval-only recall evidence.

Brief-alignment verification: the direct Reader and original-data retention passed the affected PDF flows with an English locator correction. Final independent raw-excerpt/provenance acceptance passes using React Aria disclosures. The original clipboard scenario is still enabled and now reproduces an empty clipboard despite a focused valid selection and copy event; its cause is unproven. No speculative copy handler is retained. PDF reconstruction and semantic reading remain partial. Plan 01-14 is Windows-verified complete; see its canonical summary and saved actual fault/Core/job evidence.

**Velocity:**
- Total plans completed: 13
- Average duration: -
- Total execution time: Not measured

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 13/16 completed | Not measured | Not measured |

**Recent Trend:**
- Last 5 plans: 01-09, 01-11, 01-12, 01-13, 01-14 (completed; durations not measured)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Current owner direction 2026-10-10]: PRODUCT_BRIEF_DANESH.md governs product intent. The no-viewer scope supersedes the early original-page UI; acceptance changes precede code. Execute successive approved plans only when dependencies are met; verified feature-branch commits/pushes are authorized. Plan 01-14 is now Windows-verified complete. Plan 01-15 remains gated on 01-10; macOS/Tier B criteria stay intact. Use focused corrections after broad failures, without weakening assertions.

- [Owner direction 2026-10-10, CI]: Windows CI unit timeouts fixed without weakening assertions (cheaper fixtures, file-scoped 30 s deadlines for real-I/O test files). Run 38021049327 at 5436b02 passed the whole Windows job (unit, package, installed smoke, E2E, packaged E2E). macOS still fails only ui-responsive (idle p95 139 ms before any engine runs); accepted as temporarily unresolved by the owner.
- [Owner direction 2026-10-10, PDF-02]: Early Phase 2 increment: an isolated `pdf` engine host (pdf.js) does import checks and page extraction; logical order is rebuilt from geometry with the Unicode bidi algorithm (bidi-js 1.1.0, MIT); raw and normalized text are stored separately with page boxes, stable block ids, flags and extractor version (migration 0004_extraction; jobs moved to 0005). The reader is a document mode. Evaluation covers Chromium-printed fixtures only (CER 0.10%, 1/991), so S-PDF remains open. ADR 0005 amended (still proposed).

- [Owner direction 2026-10-10, PDF-01]: Ship a usable PDF journey before the remaining Phase 1 infrastructure. Done on Windows: pick PDF → pdf.js check in Core → original in CAS → `document` row (migration 0003) → Library → original pages in a pdf.js viewer → survives relaunch. Durable jobs move to migration 0004 (01-13-PLAN.md renamed accordingly). ADR 0005 (pdf.js, proposed). Drizzle stays deferred (pin approval). Encrypted PDFs are refused, not unlocked. No text extraction. macOS and CI not run for this increment. See PDF-01-SUMMARY.md.

- [Historical owner direction, superseded by current strict execution]: The earlier session limited development to 01-12/13 and prohibited pushing or starting 01-14. The current request explicitly authorizes verified pushes and successive dependency-ready plans; cross-platform/release criteria remain unchanged.

- [Phase 1]: Plan 01-12 is complete with Windows-only verification. CAS streams bounded writes, syncs before atomic non-overwriting hard-link publication, verifies every read and duplicate, and sweeps only CAS-owned partials before Core opens/migrates the library. Unsupported links fail closed rather than risking a rename overwrite; backup temporary data is preserved. All existing CAS Gherkin scenarios, real killed-writer tests, packaged CAS UI and production smoke passed. Plan 01-13 was not started because remaining execution budget cannot cover its full durable job implementation and crash/restart verification; resume its approved plan next. See 01-12-SUMMARY.md.

- [Roadmap]: The research's Foundation and Durable kernel phases were merged into Phase 1 to fit 12 phases. The kernel still precedes PDF import.
- [Roadmap]: The complete model manager and runtime (Phase 4) precede document intelligence (Phase 5). The asset store comes before OCR, and the probe, registry and evals come before LLM use.
- [Roadmap]: Learning (Phase 9) runs before Audio (Phase 10) to close the core-value loop sooner. S-TTS still runs early in the spike track.
- [Roadmap]: Engine spikes (S-PACKAGE, S-PDF, S-RUNTIME, S-EMBED, S-OCR, S-LAYOUT, E-LANG, S-TTS) run as a parallel track through /gsd-spike. Each consuming phase is gated on its ADR.
- [Roadmap]: Open product decisions (D-*) gate specific phases. Execution stops and raises them, never decides them silently.
- [Phase 1]: D-LICENSE resolved by the user: MIT for Danesh's original source code. Third-party dependencies, engines, models and voices keep their own licenses. GPL, AGPL and LGPL engines are excluded from distributed builds. — User decision on 2026-10-09. It unblocks REL-08 and ADR 0004 in Phase 1.
- [Phase 1]: Phase 1 planning is ready for implementation (15 plans, 13 waves). The final plan-checker pass reported 3 blockers and 1 warning; they were corrected directly in 01-15 and 01-16 and verified only by deterministic checks (structure, 41 verify commands, cross-plan consistency, decision coverage 24/24, git diff --check). The AI plan checker was NOT re-run, so the corrections are not formally rechecked. Automatic chaining and workflow.auto_advance are disabled. — User approved finalizing planning on 2026-10-09 with this limitation recorded; execution needs separate explicit authorization.

- [Phase 1]: User direction 2026-10-10 added Plan 01-17 (premium custom shell, System/Light/Dark themes, design system, motion). Design contract = 01-UI-SPEC.md Amendment A; executed before 01-07. macOS shell behavior is implemented but not yet run on macOS.

- [Phase 1]: Diagnostic CI run 38015174157 (1a1c397) failed both platforms. Authenticated GitHub access successfully downloaded both ZIP artifacts and job logs; ZIP hashes match metadata. macOS pre-inference idle p95 120 ms (22 startup samples), loaded p95 143 ms (261 samples), LLM-only p95 143 ms, zero recorded renderer long tasks. Runner parallelism 3, one-minute load 5.594 before/9.067 after supports investigating scheduling/runner pressure; no process priority, App Nap, synchronized scheduler/CPU trace or GPU timing proves a specific cause. Windows probe worker exit 3221226356 lacks a native stack/faulting module and did not reproduce in the 363-test local run. No further flag/thread/runtime correction was chosen. Original heartbeat/policy/concurrency remain intact. Actual macOS evidence is structurally validated but correctly fails the pass gate; Windows supplied no current-run smoke. See evidence/tier-a-ci/38015174157/RUN.md. REL-01 stays partial.

- [Phase 1]: Subsequent run 38016154277 at c36666b passed the complete Windows job and its fresh authenticated artifact passed validation; macOS failed smoke, with E2E skipped. This is a pre-CAS result and does not prove the earlier native crash fixed. See evidence/tier-a-ci/38016154277/RUN.md. Owner-authorized Windows-first sequencing remains active; macOS debugging is deferred.

- [Phase 1]: 01-11 resumed the previous session's unfinished implementation under adopt-d14 (plan auto_select, configured yolo mode). Read-only preflight guards versions and checksums; verified backups publish through an atomic hard link to avoid rename overwrites. Core write guard, recovery banners and System check are proven on Windows. A fresh migration failure without a verified backup reports failed instead of promising a backup. macOS remains unverified.

- [Phase 1]: 2026-10-10 quality intervention (user-directed): Biome adopted (format/imports/general lint on migrated folders; ESLint keeps type-aware and security rules), AGENTS.md + docs/conventions.md, Main split into core-link / window-session / preference store, square UI and right-hand compact title bar, theme preference unsaved until chosen. Drizzle: adopt at Phase 2 first real tables; AI SDKs: no adoption now, Vercel AI SDK spike at Phase 8 (docs/engineering/technology-review.md).

### Pending Todos

- Resolve Plan 01-10 through actual Windows/macOS CI artifacts and separate Tier B evidence; macOS investigation remains deferred. Begin approved 01-15 only when 01-10 closes. No later plan is started.

### Blockers/Concerns

- [Current UI verification]: Reader clipboard copy remains empty in focused tests, native window-size drift measured 6 pixels against the existing 4-pixel tolerance, and two running-chunk style checks measured 1.6px against specified 2px. These assertions remain enabled. No speculative correction or clean full-suite claim is retained. The former viewer-canvas issue is superseded by removal of the excluded viewer UI.

- ~~[Phase 1]: D-LICENSE needs a product decision~~ RESOLVED 2026-10-09: MIT for original source (user decision).
- [Phase 1]: S-PACKAGE proven on Windows x64 with native engines and installed Persian-path smoke. Earlier macOS diagnostics loaded all three engines, but the complete smoke/E2E gate and Tier B remain unsatisfied.
- [Phase 1]: 01-10 still requires passing current-run artifacts and green CI/E2E on both platforms. Observed run 38029631841 at 21d7bdf: Windows in progress, macOS failed smoke; idle p95 151 ms, loaded p95 139 ms, zero renderer long tasks. This snapshot does not prove a present Windows result or a macOS root cause. New-push CI is pending. Tier B is separately outstanding; macOS debugging is owner-deferred and the 50 ms threshold is unchanged.
- [Phase 4]: D-COMMERCIAL and D-DISTRIB (model licenses, hosting mirrors, offline bundles) need decisions before the registry and downloads ship.
- [Phase 10]: Persian TTS naturalness and voice licensing are unproven. S-TTS needs at least 3 native listeners and should start early.
- [All engine phases]: There is no public Persian quality evidence for any candidate engine or model, so every choice is spike-gated with pass policies written first.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Platform verification | macOS responsiveness and consumer-machine verification | Deferred by owner; original acceptance policy retained | 2026-10-10 | Phase 1 |
| CI reliability | Windows native probe worker crash, exit 3221226356 | Tracked; latest hosted run and local 423 tests pass, without proving a fix; investigate if reproduced or blocking | 2026-10-10 | Phase 1 |

## Session Continuity

Last session: 2026-10-10
Stopped at: Plan 01-14 complete on Windows; 13/16 Phase 1 plans, 0/12 phases; next 01-10 platform verification, 01-15 gated on 01-10; Tier B open. Production code 382c80d and canonical 01-14 summary fb1b1b6 are committed. Next implementation 01-15 is approved but blocked by its explicit 01-10 dependency. Preserve outstanding UI assertions, actual CI artifacts and separate Tier B requirements.
Resume file: .planning/phases/01-secure-durable-foundation-packaging-gate/01-10-PLAN.md
