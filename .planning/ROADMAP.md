# Roadmap: Danesh

## Overview

Danesh goes from an empty repository to a signed, local-first, Persian-first desktop learning environment in twelve phases. The early phases build a foundation the rest can trust. Phase 1 delivers a hardened, crash-isolated, durable shell that is proven to package and run native engines on clean Windows and macOS. Phase 2 delivers faithful PDF reconstruction with stable block identity, coverage accounting and an eval harness from day one. Phase 3 delivers a Persian-first semantic reader. Next come the AI capabilities, each gated on an engine spike and its ADR. Phase 4 delivers an evaluated local model manager, Phase 5 hard-content extraction, Phase 6 a concept curriculum, Phase 7 Persian translation and normalization, and Phase 8 citation-verified lessons. Phase 9 closes the core-value loop with retrieval practice and FSRS-based recall, and Phases 10 and 11 add natural local audio and consent-gated web research. Phase 12 adds data ownership features and hardens the product for signed release. Every phase ends with verified evidence, not asserted completion.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Secure, Durable Foundation & Packaging Gate** - Hardened Electron shell, typed validated IPC, default-deny egress, durable storage and job kernel with crash injection, license ADR, packaged smoke test on clean Windows/macOS
- [ ] **Phase 2: PDF Import & Faithful Canonical Model** - Resumable import with dedupe and explicit statuses; canonical block model with stable IDs, provenance, reading order, Persian logical order and coverage accounting; fixture suite and eval harness
- [ ] **Phase 3: Persian-First Semantic Reader, Outline & Search** - Reflowable RTL reader with bidi isolation, typography, evidence inspector, saved position, source outline, Persian-aware search, localization and validated layout
- [ ] **Phase 4: Local Model Manager & AI Runtime** - Hardware probe, evaluated role registry, verified downloads and offline import, one-heavy-model governance, first-run flow
- [ ] **Phase 5: Document Intelligence** - Selective OCR, structured tables, verified/unverified equations, captioned figures, full block rendering, ID-preserving re-processing
- [ ] **Phase 6: Knowledge Map & Curriculum** - Concept discovery, hierarchical curriculum, evidence-backed reversible merges, prerequisite hints, "what next", incremental updates with stable concept IDs
- [ ] **Phase 7: Persian Translation, Normalization & Summarization** - Block-aligned translation plus normalization with protected spans, glossary, deterministic fidelity checks, separate summaries with omission reports
- [ ] **Phase 8: Grounded Lessons & Scoped Q&A** - Streamed lessons with mechanically verified citations, grounded vs supplemental labeling, section-level staleness, scoped grounded Q&A
- [ ] **Phase 9: Active Learning & Memory** - Optional retrieval practice with feedback and hints, three separate signals, FSRS scheduling from an immutable review log, fading concept indicator, full selection actions
- [ ] **Phase 10: Natural Local Audio** - Offline Persian/English TTS with speech front-end, sentence highlight, cached chunked playback, listener-evaluated voices, storage manager
- [ ] **Phase 11: Opt-in Web Research & Privacy Controls** - Consent-gated web research with exact query preview, separate labeled online evidence, egress log, offline guarantee, settings, local diagnostics
- [ ] **Phase 12: Data Ownership, Hardening & Release** - Backup, export and safe deletion; accessibility; large-book soak; AI eval and license release gates; signed installers; platform statement

## Phase Details

### Phase 1: Secure, Durable Foundation & Packaging Gate

**Goal:** As a learner, I want to install Danesh on a clean Windows or macOS machine and have it keep my data durable, private and safe from crashing engines, so that I can trust it with my documents and study history.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, PLAT-08, PLAT-11, JOB-03, REL-01, REL-02, REL-08, EVAL-05, EVAL-06, EVAL-07
**Gates**: D-LICENSE must be decided by product review so REL-08 can record Danesh's own license before any engine ADR. D-PLATFORM fixes which clean machines the smoke test must pass on (default: Windows 11 x64 and macOS 13+ Apple Silicon). The smoke-test engines are packaging candidates only. Final engine choices come from the spike track, and the smoke test re-runs whenever an engine is added or changed.
**Research flag**: Needs spike. S-PACKAGE: native bindings (SQLite, LLM with a tiny GGUF, OCR, TTS) in utilityProcess on packaged Windows and macOS builds; asarUnpack; helper-process signing; better-sqlite3 vs node:sqlite; verify Electron 44's bundled Node version.
**Success Criteria** (what must be TRUE):
  1. A packaged build installs and launches on clean Windows and macOS machines, including a Windows profile whose path contains Persian characters and spaces. It opens its database and runs a small model, OCR and TTS sample in isolated engine processes while the UI stays responsive. CI runs tests, lint and packaging on both OSes.
  2. The renderer runs sandboxed with context isolation, no Node integration and a restrictive CSP. Malformed or unexpected IPC messages are rejected and logged. With the network blocked or monitored, an automated end-to-end scenario shows zero outbound connections by default.
  3. Killing an engine process mid-task, or forcing it out of memory, never takes down the app: the task is marked retriable and the engine restarts with backoff. A sample job resumes after an app restart or a kill -9 without redoing completed work or losing committed output.
  4. User data lives in a versioned database with forward-only migrations. The app snapshots data before migrating, a failed migration leaves prior data intact and restorable, and a database written by a newer version is refused. Large artifacts are written atomically into a content-addressed store.
  5. Danesh's own license is recorded in an ADR. The ADR-with-spike template, the acceptance-scenarios-before-implementation practice and the evidence-path verification report (verified, partially verified, blocked) are all in use for this phase's own work.

**Plans**: 10/16 plans executed (01-17 added by user direction 2026-10-10). Plan 01-11 is complete locally. Latest run 38015174157 failed both jobs: macOS idle p95 120 ms/loaded p95 143 ms, Windows native probe worker crash. Both artifacts were downloaded with authenticated access and the macOS report was validated as failing; no specific runtime correction is proved. Plan 01-10 still needs diagnosis, green cross-platform CI including E2E and current-run artifacts validated as passing. Plan 01-12 remains gated. The latest plan-checker findings (3 blockers, 1 warning) were corrected directly and verified only by deterministic checks, NOT formally rechecked by the AI plan checker (2026-10-09).

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Acceptance scenarios (12 Gherkin files), ADR template and ADR 0001-0003 pass policies, written before any implementation
- [x] 01-02-PLAN.md — Exact-pinned manifests (license MIT), consolidated package-legitimacy checkpoint, frozen install, MIT LICENSE and ADR 0004

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — Walking skeleton tracer: Persian window → preload → Core → SQLite → engine host; lint/type/boundary/test harness

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-05-PLAN.md — Repository gates: license scan (permissive-only, non-commercial rejected, notices) and ADR/features-first/report checkers
- [x] 01-06-PLAN.md — Persian-first Home and System check UI, report export, native menu
- [x] 01-17-PLAN.md — User-directed amendment (2026-10-10): custom frameless shell, System/Light/Dark themes, design tokens, sidebar, settings, motion (runs before 01-07)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-07-PLAN.md — Hardened window, strict validated IPC, local logging, single instance, Windows library location, Chromium egress block

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 01-08-PLAN.md — Packaged production build with fuses, headless smoke mode, packaged smoke runner, test build

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 01-09-PLAN.md — LLM, OCR and TTS packaging probes in isolated hosts; UI responsiveness check

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 01-10-PLAN.md — Partially verified; latest run 38016154277 passed Windows with fresh artifact validated, macOS smoke failed; owner defers macOS investigation, native worker crash remains tracked, cross-platform and Tier B acceptance unchanged

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 01-11-PLAN.md — Forward-only migrations, verified backups, newer-schema refusal and read-only recovery; existing local slice resumed and verified on Windows while the CI gate remains pending

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 01-12-PLAN.md — Content-addressed blob store, Core startup cleanup and real System Check; implementation complete and verified on Windows only under owner-approved sequencing exception (2026-10-10); macOS unverified, 01-10 and release criteria unchanged

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 01-13-PLAN.md — Durable job kernel and sample durable job with crash-safe resume; next approved Windows-first implementation, not started

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 01-14-PLAN.md — Engine and Core supervision: crash/OOM containment with backoff

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 01-15-PLAN.md — Default-deny egress proof: Node guard, empty allowlist policy and broker skeleton, egress-zero check, network-monitored E2E with positive controls

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 01-16-PLAN.md — Evidence: Tier B Windows and macOS checkpoints, ADR 0001-0003 spike results, evidence index

### Phase 2: PDF Import & Faithful Canonical Model

**Goal:** As a learner, I want to import my PDFs, including large, encrypted or damaged ones, through a resumable pipeline that reconstructs them faithfully with stable block identity and honest coverage, so that everything Danesh later teaches rests on content I can trust.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-07, DOC-08, DOC-09, DOC-11, DOC-16, DOC-17, DOC-18, JOB-01, JOB-02, JOB-04, PLAT-10, EVAL-01, EVAL-02
**Gates**: The S-PDF ADR must be accepted before extraction implementation. It tests Persian logical order on 40-60 fixtures from several PDF producers, with the pass policy written before the run. D-LICENSE applies because MuPDF is AGPL, so it can only be an optional adapter unless the license decision allows otherwise.
**Research flag**: Needs deeper research: which PDF engine handles Persian logical order (pdf.js vs MuPDF vs PDFium), and text-layer health and re-extraction alignment thresholds set from spike data.
**Success Criteria** (what must be TRUE):
  1. User can drag and drop or pick one or more PDFs. Each original is kept immutably with its filename, import time and hash. Re-importing an identical file offers the existing source. An encrypted PDF prompts for a password that is never stored, and a damaged or unsupported PDF shows a plain-language status.
  2. User can see each import job's stage, progress and status, and can pause, resume, cancel and retry it. A corrupt page is quarantined and reported while the rest of the import finishes as "completed with issues". A 500+ page book imports within a bounded memory budget.
  3. Imported content lands in a canonical semantic model (not Markdown) in the correct reading order. Multi-column layouts are handled, and running headers, footers and page numbers are excluded. Mixed Persian/English text is stored in logical order with ZWNJ and notation preserved, and raw and normalized forms are kept separately. Every block carries a stable ID, type, page/region provenance, extraction version, quality status and producer record.
  4. Every page is accounted for as extracted, explicitly missing or unsupported, or page furniture. Low-confidence content is marked and missing content is never invented. This is checked by an eval harness, with recorded baselines and a written pass/fail policy, against a hand-verified fixture suite from multiple producers. The suite covers selectable text, bidi, code, tables, multi-column, figures, math, scanned, broken and long documents.
  5. User can view a source library showing each source's title, page count, import date, processing status and size on disk, and can edit a source's title and author.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Persian-First Semantic Reader, Outline & Search

**Goal:** As a learner, I want to read my reconstructed sources in a calm, reflowable Persian-first reader with correct mixed-language text, inspectable evidence, a remembered position and Persian-aware search, so that I can study the real content without ever needing a PDF viewer.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: READ-01, READ-02, READ-04, READ-06, READ-07, READ-08, READ-09, READ-11, READ-12, DOC-15, UX-02, UX-03, UX-11
**Gates**: None from product decisions. The bidi torture-page unit and screenshot tests must pass before the reader is declared done.
**Research flag**: Standard patterns (RTL reader, virtualization). Validate Persian full-text search folding against fixture data.
**Success Criteria** (what must be TRUE):
  1. User reads reconstructed content in a reflowable RTL reader, never a PDF page. Mixed Persian/English text renders with correct bidi, and code, math, URLs and identifiers appear as isolated LTR spans. User can adjust font, size, line height, column width and light, dark and high-contrast themes, and the bundled Persian font works offline.
  2. User can navigate a source by its original outline (bookmarks and heading structure), and sees each block's quality status inline. User can inspect any block's evidence (original excerpt or region crop, page number, provenance and quality status).
  3. After the app is closed and reopened, the reader returns to the same block. Reading progress advances only from meaningful activity, not from opening or scrolling, can be corrected manually, and is stored separately from learning evidence.
  4. User can search all sources with Persian-aware matching (ي/ی and ك/ک folding, ZWNJ, Persian vs Latin digits, diacritics). User can reach core navigation and actions through keyboard shortcuts and a command palette.
  5. Every screen built so far is Persian-first RTL with an English fallback, a Persian-digit preference, Jalali dates and Persian punctuation. Empty-state, error and status messages are Persian and actionable and never show stack traces. The content-first layout (collapsible navigation, wide reader, optional contextual panel) has passed a recorded usability review.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Local Model Manager & AI Runtime

**Goal:** As a learner, I want to get tested local models that suit my hardware, downloaded or imported offline and run within my machine's limits, so that private AI features work on my own computer without cloud services or crashes.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-08, JOB-05, PLAT-09, UX-01, UX-04
**Gates**: The S-RUNTIME ADR must be accepted first. It covers one vs two llama bindings, the VLM path, GPU backends per OS, constrained decoding, cancel, forced OOM and unload/reload. The S-EMBED ADR (Persian retrieval set; hybrid vs single retrieval) must also be accepted. Results from S-OCR and S-LAYOUT feed the multimodal/document registry role. D-DISTRIB governs model hosting mirrors and the offline bundle format (MODEL-04, MODEL-05). D-COMMERCIAL governs which model licenses the registry may ship.
**Research flag**: Needs spike and research (S-RUNTIME, S-EMBED): GPU backends per OS, footprint measurement, token budgeting, and the vector backend (flat scan vs sqlite-vec, benchmarked).
**Success Criteria** (what must be TRUE):
  1. On first run, the user goes through a hardware check (OS, CPU/GPU, memory, free storage, accelerators) that gives a plain-language recommendation. Then come a skippable, resumable recommended-model download and a first PDF import. A bundled sample document is readable before any download finishes.
  2. Models come from a curated, versioned registry organized by role. Each entry shows its license, size, hash, tested hardware and per-task quality-eval results. Hardware support is claimed only after a probe-load or smoke run on this machine, and a model that merely fits in memory is never presented as good.
  3. User can download models with progress, pause/resume, a disk-space preflight and hash verification, and downloads resume after an app restart. User can also import a model bundle from disk offline, verified against the registry hashes.
  4. At most one heavy model is resident under an enforced memory budget, and interactive requests go ahead of background jobs. Under memory pressure the app degrades gracefully and explains the problem in plain language instead of crashing. Switching or removing a model never deletes source data or reading progress.
  5. Normal reading and study screens never show model names, context sizes or technical plumbing. Import, model, job and quality state remain available on demand.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Document Intelligence

**Goal:** As a learner, I want to see scanned pages, tables, equations and figures from my PDFs reconstructed faithfully, or clearly labeled when uncertain, so that technical and scientific material is complete and honest in the reader.
**Mode:** mvp
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: DOC-06, DOC-10, DOC-12, DOC-13, DOC-14, DOC-20, READ-03
**Gates**: The S-OCR and S-LAYOUT ADRs must be accepted before implementation. S-OCR measures Persian OCR character, word, ZWNJ and digit error rates at 150/200/300 DPI. S-LAYOUT covers layout reading order on Persian two-column pages, table structure and formula verification. Pass policies are written before the spikes run.
**Research flag**: Needs research: Persian OCR engine choice, layout reading order on RTL two-column pages, table structure recovery, and formula verification.
**Success Criteria** (what must be TRUE):
  1. Scanned or undecodable regions are OCR'd selectively, region by region, not as whole-document OCR by default. The recognized text appears in the reader with its quality status.
  2. Each equation is stored as its region crop plus a candidate LaTeX marked verified or unverified. Verified equations render as math, and unverified ones show the crop with a label.
  3. Each table is stored as a cell grid with spans, column direction and a confidence level. Low-confidence tables show the region crop with a label.
  4. Figures are extracted as images linked to their captions. The reader renders every block type from the canonical model: headings, paragraphs, lists, tables, syntax-highlighted code, equations, figures with captions, footnotes and citations.
  5. User can re-process a source imported in Phase 2 with the newer extraction version. Matched blocks keep their IDs, so reading position and progress survive. The adversarial fixtures (scans, rotated and borderless tables, math-heavy Persian, two-column RTL) meet the pre-written pass policy against the recorded baseline.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Knowledge Map & Curriculum

**Goal:** As a learner, I want to study by concept through an automatically built curriculum with evidence-backed merges, prerequisite hints and next-step suggestions, so that I never have to build notebooks, goals or schedules myself.
**Mode:** mvp
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: KNOW-01, KNOW-02, KNOW-03, KNOW-04, KNOW-05, KNOW-06, KNOW-07, KNOW-08, KNOW-09, READ-05
**Gates**: The merge and prerequisite precision eval design, with its reference set and pass policy, must be written before synthesis implementation.
**Research flag**: Needs research: merge and prerequisite precision eval design, and hybrid retrieval tuning on Persian content.
**Success Criteria** (what must be TRUE):
  1. After importing sources, the user sees an automatically discovered hierarchical curriculum of topics and subtopics. Each concept shows its source coverage and links to supporting blocks. The user navigates primarily by concept and can switch to the original source outline at any time. Study spaces, notebooks, goals or schedules are never required.
  2. Prerequisite and corequisite relations appear in context as hints, never as locks. "What next" recommendations use source coverage, prerequisites and demonstrated progress, and any topic can always be opened. A prerequisite missing from all sources is mentioned in context without creating an empty topic or an unsourced lesson.
  3. Equivalent concepts from different PDFs merge only when evidence supports it. Each merge shows its reason and source attribution and keeps alternative definitions and disagreements. The user can undo or split a merge, rename a concept or mark something "not a concept", and those corrections survive re-synthesis. Merge and prerequisite precision meet the pre-written pass policy on the reference set.
  4. Adding a further PDF updates only the affected concepts and relationships and records staleness on dependent generated artifacts. Reading history, progress and generated content are not erased. Concept IDs are identical across identical re-runs and stay stable through incremental updates.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Persian Translation, Normalization & Summarization

**Goal:** As a learner, I want to read faithful Persian translations with consistent terminology and optional, explicitly shorter summaries that report what they omit, so that I can study foreign-language material at full academic depth in Persian.
**Mode:** mvp
**Depends on**: Phase 3, Phase 4, Phase 6
**Requirements**: LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, LANG-06, LANG-07, LANG-08, READ-13
**Gates**: The E-LANG ADR must be accepted before implementation. It combines deterministic checks, chrF++, a calibrated judge, native-speaker review and embedded prompt-injection cases. The translation model's registry entry carries these eval results. D-COMMERCIAL applies because candidate translation models have gated or restrictive terms (e.g. TranslateGemma terms of use and its 2K context).
**Research flag**: Needs research: Persian translation model choice under E-LANG, the protected-span strategy, and the two-stage translate-then-normalize diff gate.
**Success Criteria** (what must be TRUE):
  1. User can translate a selection, a section or a whole source into Persian. Output is block-aligned, and any block or section toggles between original and translation in one click. Code, math, identifiers, numbers, units, URLs and citations stay untranslated and are placed correctly in RTL text.
  2. Translation and educational normalization run as one pipeline that keeps meaning, technical detail, constraints, examples, exceptions and full scientific complexity, with no simplification. Normalization marks every substantive addition and translation adds no facts. Brief references to already-explained concepts are labeled.
  3. Each translated block shows a fidelity status from deterministic checks: either checked, or flagged for a number mismatch, a missing sentence or added content.
  4. User can view the English-Persian domain glossary and pin a preferred term, after which affected outputs are flagged stale.
  5. User can generate an optional summary that is explicitly shorter, carries an essential-points coverage report listing omissions and uncertainty, and never replaces canonical content. Source-wide translation and summarization jobs show progress and resume after interruption.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Grounded Lessons & Scoped Q&A

**Goal:** As a learner, I want to get on-demand lessons and scoped answers composed from my own sources, with verified citations and clearly labeled supplemental explanation, so that I learn from evidence I can check instead of invented facts.
**Mode:** mvp
**Depends on**: Phase 4, Phase 6, Phase 7
**Requirements**: LESSON-01, LESSON-02, LESSON-03, LESSON-04, LESSON-05, LESSON-06, LESSON-07, LESSON-08, LESSON-09, LESSON-10
**Gates**: D-QA covers LESSON-10, scoped grounded Q&A in the contextual panel, which is assumed included with no global chat home. If product review rejects it, LESSON-10 moves out of v1 and the Phase 11 web-research entry point must be re-homed. The citation-accuracy eval design is written before implementation.
**Research flag**: Standard verifier pattern: the model selects block IDs from a closed set, code resolves the quotes, and a mechanical check follows. The citation-accuracy eval design remains to be done.
**Success Criteria** (what must be TRUE):
  1. User can generate a lesson for any concept on demand. The lesson streams in, can be cancelled, and is composed from relevant sources. Its inline citations are each mechanically verified against the source text, and opening a citation shows the original excerpt.
  2. Source-grounded content is visually distinct from labeled supplemental explanation, and any segment without a verified citation is shown as supplemental. Source disagreements are presented with attribution and context. Instruction-like text embedded in a fixture PDF cannot change these labels.
  3. Lessons reopen from cache without regeneration and carry generation, version and provenance metadata. When source knowledge changes, only the affected sections are flagged stale, and they are regenerated on demand.
  4. User can regenerate a lesson with feedback and recover the previous version. User can report a problem on any generated sentence, and reports are stored locally only.
  5. User can ask a question scoped to a selection, concept or lesson in the contextual panel. The answer is either cited from the user's sources or states explicitly that it was not found in them.

**Plans**: TBD
**UI hint**: yes

### Phase 9: Active Learning & Memory

**Goal:** As a learner, I want to practice retrieval with feedback and hints, see honest separate signals for coverage, understanding and predicted recall, and get gentle review suggestions, so that I achieve delayed, AI-independent recall and application of what I study.
**Mode:** mvp
**Depends on**: Phase 6, Phase 8
**Requirements**: LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-05, LEARN-06, LEARN-07, LEARN-08, LEARN-09, LEARN-10, READ-10
**Gates**: D-SELFGRADE decides whether a self-graded rating after a recall attempt counts as FSRS evidence. The default assumed is yes, as a distinct, conservatively weighted evidence type. The learning core (immutable review log, FSRS replay, signal separation) is pure TypeScript and may be built test-first in parallel with Phases 6-8.
**Research flag**: Light: confirm the ts-fsrs ReviewLog fields. The parameter optimizer stays out of v1.
**Success Criteria** (what must be TRUE):
  1. User can answer optional retrieval prompts per concept (free response, cloze, application exercise), each carrying a source reference. Feedback explains why an answer is right or wrong, progressive hints are available on request, and the solution is revealed only when the user chooses. Any prompt can be skipped and content is never gated.
  2. Each concept shows three separate signals: reading coverage, assessed understanding, and predicted recall shown as uncertain. There is no single mastery score. The concept indicator, never the lesson text, fades as predicted recall drops, with a non-color cue alongside.
  3. Predicted recall comes from an FSRS-class scheduler that replays an immutable review log with default parameters. Only retrieval attempts strengthen recall, never reading or manual marking. The evidence type (system-assessed vs self-graded) is stored distinctly, and manual progress corrections are kept separate and never feed scheduling.
  4. Due reviews are suggested passively with a soft per-session cap, with no calendar plan and no backlog counter. User can flag, suspend or replace a bad practice question.
  5. Selecting text in the reader offers explain, translate, summarize, ask, practice and copy-with-citation, and each action works on the selection.

**Plans**: TBD
**UI hint**: yes

### Phase 10: Natural Local Audio

**Goal:** As a learner, I want to listen to normalized translations and lessons in natural local Persian and English voices that pronounce technical terms correctly, so that I can study by ear while offline.
**Mode:** mvp
**Depends on**: Phase 4, Phase 7, Phase 8
**Requirements**: AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-04, AUDIO-05, AUDIO-06, AUDIO-07, AUDIO-08, AUDIO-09, EVAL-04, MODEL-07
**Gates**: The S-TTS ADR must be complete before this phase starts. It uses a 60-sentence blind set, an ASR round-trip check and at least 3 native listeners, with thresholds written first. Run it early in the spike track. D-LICENSE applies because sherpa-onnx phonemization pulls in espeak-ng (GPL). D-COMMERCIAL applies because most Persian voices are non-commercial or of unverified provenance. If no license-clean voice passes, the result goes to product review instead of a silent quality downgrade.
**Research flag**: Needs spike (S-TTS): Persian naturalness, per-voice licensing, ezafe and homograph handling, and sherpa-onnx Persian configuration (no published Node example).
**Success Criteria** (what must be TRUE):
  1. User can listen offline to normalized translations and lessons in Persian and English. Playback supports play/pause/seek, pitch-preserved speed, skipping by paragraph or section, and resuming from the last position. Playback continues while the window is minimized and media keys control it.
  2. The sentence being spoken is highlighted in the reader, and clicking a sentence starts playback there. Playback starts quickly through chunked look-ahead generation. Audio is cached and reused, and the cache is invalidated when the text or voice changes.
  3. Mixed Persian/English technical terms, numbers, units and abbreviations are pronounced correctly through a speech front-end. Code, equations and tables are read with a labeled strategy. User can add pronunciation-lexicon entries.
  4. User can preview and download voices, each showing its size, resource needs, license and quality status (evaluated or experimental). The quality status is backed by a recorded native-listener evaluation, and no voice is called natural just because it is tagged Persian.
  5. User can see and reclaim the storage used by models, the audio cache, sources and generated artifacts.

**Plans**: TBD
**UI hint**: yes

### Phase 11: Opt-in Web Research & Privacy Controls

**Goal:** As a learner, I want to optionally extend answers with web research only after seeing and approving exactly what leaves my machine, so that I get outside context without risking my privacy or mixing web content into my sources.
**Mode:** mvp
**Depends on**: Phase 1, Phase 4, Phase 8
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, EVAL-08, UX-06, UX-09
**Gates**: A web search provider ADR is needed. D-WEBSAVE (saving web snippets as a labeled reference source) is deferred to v2, so v1 keeps web evidence in a separate store only. All outbound traffic goes through the Phase 1 egress broker.
**Research flag**: Light: the provider choice needs an ADR. Privacy and injection tests matter more than research.
**Success Criteria** (what must be TRUE):
  1. Web research is off by default. The user can enable it globally and must confirm each request after seeing the exact query text and provider. Private passages are never included without explicit approval.
  2. Web results appear as labeled online evidence with URLs and dates, visually distinct from PDF evidence. They are kept in a separate store that never enters the knowledge map. Prompt-injection fixtures embedded in PDFs and web text cannot trigger tool calls or alter grounding labels.
  3. User can view a log of every outbound web request. With web research disabled and models present, every other feature works fully offline, and an offline indicator shows when web research is unavailable.
  4. User can manage language, theme, fonts, web-research consent, storage, models and diagnostics from one settings page with sane defaults. User can export a local diagnostic bundle after previewing its redactions, with no telemetry and no automatic upload.

**Plans**: TBD
**UI hint**: yes

### Phase 12: Data Ownership, Hardening & Release

**Goal:** As a learner, I want to install a signed, accessible Danesh release that stays stable on large books, is honest about its platforms, licenses and quality, and lets me back up, export and safely delete my data, so that I can rely on it as my long-term study environment.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9, Phase 10, Phase 11
**Requirements**: DOC-19, UX-05, UX-07, UX-08, UX-10, REL-03, REL-04, REL-05, REL-06, REL-07, EVAL-03
**Gates**: D-PLATFORM sets the verified tier in the platform statement (REL-06). D-DISTRIB names the signing-account holders and distribution hosts (REL-03). Windows Artifact Signing eligibility may be limited by region, so decide on an OV or HSM fallback during planning. D-LICENSE and D-COMMERCIAL feed the license-matrix gate (REL-04).
**Research flag**: Standard installer and signing process. Here verification is the work: real packaged runs on clean machines, with untested platforms reported as untested.
**Success Criteria** (what must be TRUE):
  1. User can install Danesh from a signed Windows installer and from a signed, notarized macOS installer on clean machines. Updates arrive only through an opt-in, disclosed update check or a manual download. A published platform-support statement lists the verified platforms and reports all others as untested.
  2. The whole app is usable by keyboard with visible focus. Content exposes screen-reader semantics (headings, tables, MathML), reduced motion is respected, and high-contrast themes are available.
  3. User can back up all data to a single local file and restore it. User can export review history (JSON/CSV), lessons and translations with citations, and the glossary in open formats.
  4. User can delete a source after an impact preview listing affected concepts, lessons and review items. Review history is kept, and concepts that lose their only source are marked "source removed". Destructive actions require confirmation and offer undo where feasible.
  5. Repeatedly processing 500+ page sources keeps memory flat in soak tests. The complete reference-based AI eval suite runs against recorded baselines as a release gate, as does the license-matrix check. The suite covers completeness, source fidelity, omission and extra content, Persian term consistency, merge and prerequisite precision, citation accuracy, and quiz answer quality. Accurate licensing notices cover every dependency, engine, model and voice.

**Plans**: TBD
**UI hint**: yes

## Engine Spike Track

Engine choices are settled by spikes run in parallel with the phase sequence through `/gsd-spike`. Spikes feed ADRs, not product code. For each spike, the pass policy is written before the spike runs, and the result is recorded as an ADR (EVAL-05). A consuming phase may not start implementation plans until its gating ADR is accepted.

| Spike | Decides | Run window | Must conclude before |
|-------|---------|------------|----------------------|
| S-PACKAGE | Native bindings (SQLite, LLM, OCR, TTS) load in utilityProcess in packaged, signed Windows and macOS builds | Phase 1 | Phase 1 completion (REL-02) |
| S-PDF | PDF parser for Persian logical order across 40-60 fixtures from multiple producers | Late Phase 1 or start of Phase 2 | Phase 2 extraction plans |
| S-RUNTIME | LLM binding(s), VLM path, GPU backends per OS, constrained decoding, cancel, forced OOM, unload/reload | Phases 2-3 | Phase 4 |
| S-EMBED | Persian embedding model (bge-m3 vs challenger), hybrid vs single retrieval (nDCG@10, recall@20) | Phases 2-3 | Phase 4 |
| S-OCR | Persian OCR engine: character, word, ZWNJ and digit error at 150/200/300 DPI | Phases 2-4 | Phase 5 |
| S-LAYOUT | Layout regions and reading order, tables and formulas on Persian two-column and scanned fixtures | Phases 2-4 | Phase 5 |
| E-LANG | Persian translation model: deterministic checks, chrF++, calibrated judge, native review, injection cases | Phases 4-6 | Phase 7 |
| S-TTS | Persian and English voices: 60-sentence blind set, ASR round-trip, at least 3 native listeners | As early as possible (Phases 2-5), once D-LICENSE and D-COMMERCIAL are decided | Phase 10 |

## Open Product Decision Gates

These decisions are flagged for product review, not decided silently during execution. Until a decision is made, planning uses the default from REQUIREMENTS.md, and any phase that would act on an undecided gate stops and raises it.

| Decision | Default assumed | Gates |
|----------|-----------------|-------|
| D-LICENSE | **DECIDED 2026-10-09: MIT for Danesh's original source code.** GPL, AGPL and LGPL engines (MuPDF, espeak-ng) are excluded from distributed builds. | Phase 1 (REL-08), Phase 2 (PDF engine), Phase 10 (TTS phonemizer), Phase 12 (REL-04) |
| D-COMMERCIAL | Commercial-safe licenses only | Phase 4 (model registry), Phase 7 (translation model), Phase 10 (voices), Phase 12 (REL-04) |
| D-PLATFORM | Windows 11 x64 and macOS 13+ Apple Silicon verified; others untested | Phase 1 (smoke-test targets), Phase 12 (REL-06) |
| D-DISTRIB | Offline bundle import plus documented mirrors | Phase 4 (MODEL-04, MODEL-05), Phase 12 (REL-03 signing) |
| D-QA | Scoped grounded Q&A included; no global chat home | Phase 8 (LESSON-10), Phase 11 (web entry point) |
| D-SELFGRADE | Self-graded recall counts as a distinct, conservatively weighted evidence type | Phase 9 (LEARN-07) |
| D-BOOKMARK | Deferred to v2 | None in v1 |
| D-WEBSAVE | Deferred to v2; web evidence stays separate | Phase 11 |

## Cross-Cutting Requirement Anchoring

Each requirement maps to exactly one phase. Cross-cutting requirements are anchored where their mechanism and first full verification land. Later phases apply the same rule and re-check it in their own success criteria.

- **Discipline requirements (Phase 1):** EVAL-05 (ADR per engine, backed by a spike), EVAL-06 (acceptance scenarios before implementation) and EVAL-07 (evidence-path verification reports) are established in Phase 1 and apply to every later phase. Each engine phase adds its gating ADR from the spike track.
- **Fixtures and harness (Phase 2):** EVAL-01 and EVAL-02 start with the PDF pipeline, not in a later quality phase. Every later AI phase adds its reference sets to the same harness.
- **AI quality suite (Phase 12):** EVAL-03 is owned by the release gate, but each AI phase builds its own reference eval as it goes. Phase 5 covers extraction, Phase 6 merge and prerequisite precision, Phase 7 fidelity and term consistency, Phase 8 citation accuracy, and Phase 9 quiz answer quality. Phase 12 consolidates them and enforces them against baselines.
- **Voice and injection evals:** EVAL-04 lands with the shipped voices (Phase 10). EVAL-08 lands in Phase 11, the first phase where both PDF and web-text injection paths exist. Phase 8 already tests PDF-embedded injection against grounding labels.
- **Packaging:** REL-02's packaged smoke test is the Phase 1 gate and re-runs whenever a phase adds or changes a native engine. REL-03 (signed installers) is Phase 12.
- **Structural rules:** PLAT-10 (producer record) is anchored in Phase 2, with the first real artifacts. PLAT-09 (separate domains; a model switch never destroys data) is anchored in Phase 4, the first point where models can be switched or removed. MODEL-02 and MODEL-08 (evaluated role registry) are anchored in Phase 4, and translation and voice entries join the same registry in Phases 7 and 10.
- **Progressive surfaces:** JOB-01's job view (Phase 2) lists later job types as they appear. READ-10's selection actions are enabled as each capability lands, with no mock UI: translate and summarize in Phase 7, explain and ask in Phase 8. The requirement is fully delivered with practice in Phase 9. UX-06's settings page is complete in Phase 11, once every settings category exists.

## Phase Count Rationale

The roadmap has 12 phases, within the fine-granularity band of 8-12. The research synthesis proposed 13 phases. They were fitted to 12 without dropping coverage:

- **Foundation and durable kernel merged into Phase 1.** The research's own first structural recommendation was to pull the job kernel, the storage kernel and the packaging smoke test into foundation. The REL-02 smoke test already opens the database and runs engines in supervised utility processes, so the two were inseparable in practice. The kernel still precedes PDF import, so import is born resumable.
- **Model manager made one complete phase (Phase 4) ahead of document intelligence (Phase 5).** This meets both research constraints: asset store and downloads before OCR, and hardware probe, role registry and evals before LLM use. It also makes the VLM path available to Phase 5.
- **Learning (Phase 9) placed before Audio (Phase 10).** Both depend only on lessons, so the swap is safe. It closes the core-value loop (delayed, AI-independent recall) sooner. The highest-uncertainty audio risk is still de-risked early through S-TTS in the spike track.
- **Web research kept separate (Phase 11)** as the research recommended, and paired with the settings and diagnostics privacy controls it naturally owns.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. The engine spike track runs in parallel. These overlaps are dependency-safe:
- Phase 4 planning can overlap Phase 3, because only the first-run flow needs the reader.
- Phase 7's per-block translation can start once Phase 4 exists. Glossary seeding uses Phase 6 concepts.
- The Phase 9 learning core can be built test-first during Phases 6-8.
- Phase 11 can run any time after Phase 8.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Secure, Durable Foundation & Packaging Gate | 11/16 | In Progress (Windows-first; cross-platform verification pending) | - |
| 2. PDF Import & Faithful Canonical Model | 0/TBD | Not started | - |
| 3. Persian-First Semantic Reader, Outline & Search | 0/TBD | Not started | - |
| 4. Local Model Manager & AI Runtime | 0/TBD | Not started | - |
| 5. Document Intelligence | 0/TBD | Not started | - |
| 6. Knowledge Map & Curriculum | 0/TBD | Not started | - |
| 7. Persian Translation, Normalization & Summarization | 0/TBD | Not started | - |
| 8. Grounded Lessons & Scoped Q&A | 0/TBD | Not started | - |
| 9. Active Learning & Memory | 0/TBD | Not started | - |
| 10. Natural Local Audio | 0/TBD | Not started | - |
| 11. Opt-in Web Research & Privacy Controls | 0/TBD | Not started | - |
| 12. Data Ownership, Hardening & Release | 0/TBD | Not started | - |
