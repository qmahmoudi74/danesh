# Requirements: Danesh

**Defined:** 2026-10-09
**Core Value:** A learner can study their own PDFs and achieve delayed, AI-independent recall and application of the material, built on faithfully reconstructed, source-grounded content that never invents facts.

**Sources:** `PRODUCT_BRIEF_DANESH.md` (confirmed intent), `.planning/PROJECT.md`, `.planning/research/SUMMARY.md` and `FEATURES.md`. Auto mode included every brief requirement plus every research-identified table-stakes gap. Differentiators not in the brief were deferred to v2. Choices that could change product intent are listed under **Open Product Decisions** for review rather than silently decided.

## v1 Requirements

Requirements for the initial release. Each maps to exactly one roadmap phase.

### Platform & Security (PLAT)

- [ ] **PLAT-01**: The renderer runs sandboxed with context isolation, no Node integration and a restrictive CSP. It reaches the backend only through a closed, typed API.
- [ ] **PLAT-02**: Every IPC/RPC message is schema-validated by the receiving process. Invalid payloads are rejected and logged locally.
- [ ] **PLAT-03**: Heavy work (PDF parsing, OCR, inference, embeddings, TTS) runs in isolated processes. The UI stays responsive (typing, scrolling, navigation) while jobs run.
- [ ] **PLAT-04**: A crash or out-of-memory in an engine process never takes down the app. The affected task is marked retriable and the engine restarts with backoff.
- [ ] **PLAT-05**: Outbound network access is denied by default. Only explicit, user-controlled paths (web research, model downloads, opt-in update check) can open connections. An automated test verifies this with the network blocked.
- [ ] **PLAT-06**: User data lives in a versioned local database with forward-only migrations. The app refuses to open a database written by a newer version.
- [ ] **PLAT-07**: The app automatically snapshots the user's data before any schema migration. A failed migration leaves prior data intact and restorable.
- [ ] **PLAT-08**: Original PDFs and large artifacts are stored in a content-addressed store with atomic writes.
- [ ] **PLAT-09**: These data domains are stored separately: source model, evidence, language outputs, concepts, lessons, learning evidence, recall schedule, and model/job state. Switching or removing a model never deletes source data or study progress.
- [ ] **PLAT-10**: Every generated artifact records its producer: model ID/version, prompt/processing version and input fingerprint.
- [ ] **PLAT-11**: The app works when the user profile or storage path contains Persian characters or spaces.

### Durable Jobs (JOB)

- [ ] **JOB-01**: User can see every long-running job (import, OCR, translation, synthesis, TTS, download) on demand, with its current stage, progress and status.
- [ ] **JOB-02**: User can pause, resume, cancel and retry any job.
- [ ] **JOB-03**: Jobs resume automatically after an app restart or crash. Completed work is not redone and verified output is not lost.
- [ ] **JOB-04**: A failing unit (e.g. a corrupt page) is quarantined and reported, and the rest of the job still completes, marked "completed with issues".
- [ ] **JOB-05**: Heavy work is bounded: at most one heavy model is resident and a memory budget is enforced. Interactive requests take priority over background jobs.

### PDF Ingestion & Reconstruction (DOC)

- [ ] **DOC-01**: User can import one or more PDFs via drag-and-drop or the file picker.
- [ ] **DOC-02**: The original PDF is preserved immutably with provenance (original filename, import time, content hash).
- [ ] **DOC-03**: Re-importing an identical PDF is detected by hash, and the user is offered the existing source instead of re-processing it.
- [ ] **DOC-04**: An encrypted PDF prompts for its password, which is never persisted.
- [ ] **DOC-05**: A damaged or unsupported PDF shows an explicit status with a plain-language reason.
- [ ] **DOC-06**: Danesh extracts paragraphs, headings, lists, code, tables, equations, figures, captions and footnotes into a canonical semantic document model, not Markdown.
- [ ] **DOC-07**: Every block has a stable ID, type, original text or structured data, page/region provenance, extraction version and quality status.
- [ ] **DOC-08**: Extracted content follows the correct reading order, including multi-column layouts. Running headers, footers and page numbers are excluded from content.
- [ ] **DOC-09**: Mixed Persian/English text is stored in correct logical order, with Unicode directionality, ZWNJ and technical notation preserved. Raw and normalized forms are kept separately.
- [ ] **DOC-10**: Scanned or undecodable regions are OCR'd selectively, region by region, not as whole-document OCR by default.
- [ ] **DOC-11**: Every page's content is accounted for as extracted, explicitly missing/unsupported, or page furniture. Low-confidence content is marked, and no missing text, formula or figure is ever invented.
- [ ] **DOC-12**: Each equation is stored as its original region crop plus a candidate LaTeX marked unverified or verified. Unverified equations display the crop with a label.
- [ ] **DOC-13**: Each table is stored as a cell grid (with spans and column direction) and a confidence level. Low-confidence tables display the region crop with a label.
- [ ] **DOC-14**: Figures are extracted as images linked to their captions.
- [ ] **DOC-15**: The original source outline (bookmarks and heading structure) is extracted and navigable as its own view.
- [ ] **DOC-16**: Books of 500+ pages import within bounded memory, without any single-context LLM call over the whole book.
- [ ] **DOC-17**: User can see a source library listing each source's title, page count, import date, processing status and size on disk.
- [ ] **DOC-18**: User can edit a source's title and author.
- [ ] **DOC-19**: User can delete a source after an impact preview listing affected concepts, lessons and review items. Review history is kept, and concepts that lose their only source are marked "source removed".
- [ ] **DOC-20**: User can re-process a source with a newer extraction version. Matched blocks keep their IDs, so citations, reading progress and learning history survive.

### Semantic Reader (READ)

- [ ] **READ-01**: User reads reconstructed content in a reflowable, Persian-first RTL reader that never renders the original PDF page as the main experience.
- [ ] **READ-02**: Mixed Persian/English text renders with correct bidi. Code, math, URLs and identifiers render as isolated LTR spans.
- [ ] **READ-03**: The reader renders headings, paragraphs, lists, tables, syntax-highlighted code, equations, figures with captions, footnotes and citations.
- [ ] **READ-04**: User can adjust font, size, line height, column width and theme (light, dark, high contrast). A Persian font is bundled so text renders correctly offline.
- [ ] **READ-05**: User navigates primarily by concept (curriculum) and can switch to the original source outline at any time.
- [ ] **READ-06**: The reading position is stable and restored across sessions. It is keyed to block ID, not scroll offset.
- [ ] **READ-07**: Reading progress is inferred from meaningful activity, not from opening or scrolling, and the user can correct it manually. Progress is stored separately from learning evidence.
- [ ] **READ-08**: User can inspect the source evidence of any block or citation (original excerpt or region crop, page number, provenance, quality status) without a PDF page viewer.
- [ ] **READ-09**: Each block's quality status (ok, low confidence, missing, unsupported) is visible in the reader.
- [ ] **READ-10**: User can select text and invoke contextual learning actions: explain, translate, summarize, ask, practice, and copy with citation.
- [ ] **READ-11**: User can full-text search across sources and generated content. Matching is Persian-aware: ي/ی and ك/ک folding, ZWNJ, Persian vs Latin digits, diacritics.
- [ ] **READ-12**: User can reach core navigation and actions with keyboard shortcuts and a command palette.
- [ ] **READ-13**: User can toggle any block or section between the original text and its Persian translation.

### Knowledge Map & Learning Sequence (KNOW)

- [ ] **KNOW-01**: Danesh automatically discovers topics and coherent subtopics from imported sources, each linked to supporting source blocks.
- [ ] **KNOW-02**: User sees a hierarchical curriculum list with per-concept source coverage. Creating study spaces, notebooks, goals or calendar schedules is never required.
- [ ] **KNOW-03**: Danesh infers likely prerequisite and corequisite relations and shows them in context as hints, never as locks.
- [ ] **KNOW-04**: User gets "what next" recommendations based on source coverage, prerequisites and demonstrated progress, and can always open any topic.
- [ ] **KNOW-05**: Equivalent concepts across PDFs are merged only when evidence supports it. A merge shows its reason and source attribution, and keeps alternative definitions and disagreements.
- [ ] **KNOW-06**: User can undo or split a wrong merge, rename a concept, or mark something "not a concept". Corrections survive re-synthesis.
- [ ] **KNOW-07**: When an essential prerequisite is missing from all sources, Danesh mentions the gap in context. It never creates an empty topic or an unsourced lesson.
- [ ] **KNOW-08**: Adding a source incrementally updates affected concepts and relationships and flags affected lessons stale. Reading history, assessments, generated content and progress are not erased.
- [ ] **KNOW-09**: Concept IDs stay stable across identical re-runs and incremental updates.

### Grounded Lessons (LESSON)

- [ ] **LESSON-01**: User can generate a lesson for a concept on demand. The lesson streams in as it is generated and can be cancelled.
- [ ] **LESSON-02**: Lessons are composed from relevant uploaded sources, with inline citations to source blocks. Each citation is mechanically verified against the source text.
- [ ] **LESSON-03**: User can open any lesson citation to inspect the original excerpt.
- [ ] **LESSON-04**: Source-grounded content is visually distinct from explicitly labeled supplemental model explanation. A segment without a verified citation is shown as supplemental.
- [ ] **LESSON-05**: Lessons present source disagreements with attribution and context.
- [ ] **LESSON-06**: Generated lessons are cached with generation, version and provenance metadata, and reopen without regeneration.
- [ ] **LESSON-07**: When source knowledge changes, only the affected lesson sections are flagged stale, and they are regenerated on demand rather than wholesale.
- [ ] **LESSON-08**: User can regenerate a lesson with feedback and recover the previous version.
- [ ] **LESSON-09**: User can report a problem on any generated sentence. Reports are stored locally only.
- [ ] **LESSON-10**: User can ask a question scoped to a selection, concept or lesson in the contextual panel. The answer is cited from their sources, or states explicitly that the answer was not found in them. *(Scope pending product confirmation; see Open Product Decisions.)*

### Translation, Normalization & Summarization (LANG)

- [ ] **LANG-01**: User can translate a selection, section or whole source into Persian. Output is block-aligned and the original is always one click away.
- [ ] **LANG-02**: Translation and educational normalization run as one coordinated pipeline. It preserves meaning, technical detail, constraints, examples, code, exceptions and full scientific complexity, with no simplification.
- [ ] **LANG-03**: Code, math, identifiers, numbers, units, URLs and citations are left untranslated and placed correctly in RTL output.
- [ ] **LANG-04**: Danesh builds an English–Persian domain glossary for consistent terminology across sources. User can view it and pin a preferred term, and affected outputs are flagged stale.
- [ ] **LANG-05**: Normalization marks any substantive addition, and translation never adds facts. Brief references to already-explained concepts are allowed and labeled.
- [ ] **LANG-06**: Each translated block shows a fidelity status from deterministic checks: checked, or flagged for number mismatch, missing sentence or added content.
- [ ] **LANG-07**: User can generate an optional summary. It is explicitly shorter, includes an essential-points coverage report listing omissions and uncertainty, and never replaces canonical content.
- [ ] **LANG-08**: Source-wide translation and summarization jobs show progress and resume after interruption.

### Audio (AUDIO)

- [ ] **AUDIO-01**: User can listen to normalized translations and lessons through local, offline TTS in Persian and English.
- [ ] **AUDIO-02**: User can play, pause, seek, change speed (pitch-preserved), skip by paragraph or section, and resume from the last position.
- [ ] **AUDIO-03**: The sentence being spoken is highlighted in the reader, and clicking a sentence starts playback there.
- [ ] **AUDIO-04**: Playback starts quickly through chunked generation with look-ahead. Generated audio is cached and reused, and invalidated when the text or voice changes.
- [ ] **AUDIO-05**: Mixed Persian/English technical terms, numbers, units and abbreviations are pronounced correctly via a speech front-end. Code, equations and tables are read using a labeled strategy.
- [ ] **AUDIO-06**: User can add pronunciation-lexicon entries to correct how a term is spoken.
- [ ] **AUDIO-07**: User can preview and download voices. Each shows size, resource requirements and license.
- [ ] **AUDIO-08**: Each voice shows its quality status (evaluated or experimental) from recorded listening evaluations. No voice is called natural just because it is tagged Persian.
- [ ] **AUDIO-09**: Playback continues while the window is minimized, and media keys control it.

### Active Learning & Memory (LEARN)

- [ ] **LEARN-01**: User can answer short optional retrieval-practice prompts per concept (free response, cloze, application exercise). Each prompt carries a source reference.
- [ ] **LEARN-02**: User receives feedback explaining why an answer is right or wrong and can request progressive hints. The solution is revealed only when the user chooses.
- [ ] **LEARN-03**: Practice never gates content. User can skip any prompt and open any content.
- [ ] **LEARN-04**: Each concept shows three separate signals: reading coverage, assessed understanding, and predicted recall probability shown as uncertain. There is no single mastery score.
- [ ] **LEARN-05**: Predicted recall comes from an FSRS-class scheduler that replays an immutable review log, using default parameters. Scheduling settings are not exposed in v1.
- [ ] **LEARN-06**: The concept indicator, not the lesson text, fades as predicted recall decreases. A non-color cue accompanies the fade.
- [ ] **LEARN-07**: Recall is strengthened only by a retrieval attempt, never by reading or manual marking. The evidence type (system-assessed or self-graded after an attempt) is stored distinctly.
- [ ] **LEARN-08**: Danesh suggests due reviews passively, with a soft per-session cap. There is no calendar plan and no backlog counter.
- [ ] **LEARN-09**: User can correct progress manually. Corrections are stored separately and never feed scheduling.
- [ ] **LEARN-10**: User can flag, suspend or replace a bad practice question.

### Local Model Management (MODEL)

- [ ] **MODEL-01**: Danesh detects the OS, CPU/GPU, memory, free storage and supported accelerators, and recommends models in plain language.
- [ ] **MODEL-02**: Models come from a curated, versioned registry organized by role: reasoning/extraction, translation, multimodal/document, embedding, voice. Each entry records license, size, hash and tested hardware.
- [ ] **MODEL-03**: Hardware support is claimed only after a probe-load or smoke run on the user's machine.
- [ ] **MODEL-04**: User can download models with progress, pause/resume, a disk-space preflight and hash verification. Downloads resume after a restart.
- [ ] **MODEL-05**: User can import a model bundle from disk offline. It is verified against the registry hashes.
- [ ] **MODEL-06**: Danesh loads at most one heavy model at a time, degrades gracefully under memory pressure, and explains out-of-memory conditions in plain language instead of crashing.
- [ ] **MODEL-07**: User can see, and reclaim, the storage used by models, the audio cache, sources and generated artifacts.
- [ ] **MODEL-08**: Registry entries carry per-task quality-eval results. A model that merely fits in memory is never presented as good.

### Optional Web Research (WEB)

- [ ] **WEB-01**: Web research is off by default. User can enable it globally and confirm it per request.
- [ ] **WEB-02**: Before any query leaves the machine, the user sees the exact query text and provider and gives consent. Private passages are never included without explicit approval.
- [ ] **WEB-03**: Web results appear as labeled online evidence with URLs and dates, visually distinct from PDF evidence.
- [ ] **WEB-04**: Web content never enters the sourced knowledge map. It is kept in a separate, labeled store.
- [ ] **WEB-05**: User can view a log of every outbound web request.
- [ ] **WEB-06**: With web research disabled and models present, every other feature works offline, and an offline indicator shows when web research is unavailable.

### Experience, Localization & Data Portability (UX)

- [ ] **UX-01**: On first run, the user goes through a hardware check, a recommended model download (skippable and resumable) and a first PDF import. A bundled sample document is readable before any download finishes.
- [ ] **UX-02**: The UI is Persian-first RTL with an English fallback. It supports a Persian-digit preference, Jalali dates and Persian punctuation.
- [ ] **UX-03**: Empty-state, error and status messages are in Persian, actionable, and never show stack traces.
- [ ] **UX-04**: Normal study never exposes model names, context sizes or technical plumbing. Import, model, job and quality state are available on demand.
- [ ] **UX-05**: User can use the whole app by keyboard with visible focus. Content exposes screen-reader semantics (headings, tables, MathML), reduced motion is respected, and high-contrast themes are available.
- [ ] **UX-06**: User can manage language, theme, fonts, web-research consent, storage, models and diagnostics from a settings page with sane defaults.
- [ ] **UX-07**: User can back up all data to a single local file and restore from it.
- [ ] **UX-08**: User can export learning data in open formats: review history (JSON/CSV), lessons and translations with citations, and the glossary.
- [ ] **UX-09**: User can export a local diagnostic bundle after previewing its redactions. There is no telemetry and no automatic upload.
- [ ] **UX-10**: Destructive actions require confirmation and support undo where feasible.
- [ ] **UX-11**: User studies in a calm, content-first layout with collapsible topic navigation, a wide reader and an optional contextual panel. The layout is validated by a usability review before it is final.

### Quality & Evaluation (EVAL)

- [ ] **EVAL-01**: A real PDF fixture suite with hand-verified ground truth exists, drawn from multiple PDF producers. It covers selectable text, Persian/English bidi, code, tables, multi-column, figures, math, scanned/low-quality, broken and long documents.
- [ ] **EVAL-02**: An eval harness runs the extraction and AI pipelines against fixtures and records metrics. Baselines and a pass/fail policy are written down before any feature is declared release-ready.
- [ ] **EVAL-03**: Reference-based AI quality evals exist for content completeness, source fidelity, omission and extra content, Persian term consistency, concept merge and prerequisite precision, citation accuracy, and quiz answer quality.
- [ ] **EVAL-04**: A listening-evaluation protocol, run by native listeners, is applied to every shipped voice.
- [ ] **EVAL-05**: Each engine choice (PDF parser, OCR, layout, inference runtime, embedding model, translation model, TTS) is recorded in an ADR. Each ADR is backed by a spike on real Windows/macOS platforms covering accuracy, Persian quality, packaging, security and license.
- [ ] **EVAL-06**: Every user-visible capability has BDD/ATDD acceptance scenarios defined before implementation, covering the happy path, invalid inputs, edge cases, recovery, cancellation and persistence.
- [ ] **EVAL-07**: Verification reports list verified, partially verified and blocked requirements with evidence paths. No pass rate or benchmark is invented.
- [ ] **EVAL-08**: Prompt-injection fixtures embedded in PDFs and web text cannot trigger tool calls or alter grounding labels.

### Release & Distribution (REL)

- [ ] **REL-01**: The public GitHub repository runs automated CI on Windows and macOS (tests, lint, packaging).
- [ ] **REL-02**: The packaged app passes a smoke test on clean Windows and macOS machines. It launches, loads its native engines, opens the database, and runs a model, OCR and TTS sample.
- [ ] **REL-03**: User can install Danesh from a signed Windows installer and from a signed, notarized macOS installer on clean machines.
- [ ] **REL-04**: Accurate licensing notices cover every dependency, engine, model and voice. Checking the license matrix is a release gate.
- [ ] **REL-05**: Updates come through an opt-in, disclosed update check or a manual download. There is never a silent auto-update.
- [ ] **REL-06**: A published platform-support statement lists the verified platforms and reports all others as untested.
- [ ] **REL-07**: Processing 500+ page sources repeatedly keeps memory flat: soak tests show no unbounded growth.
- [ ] **REL-08**: Danesh's own project license is chosen and recorded in an ADR before engine selection, and every engine, model and voice license is compatible with it.

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Reader & Library

- **READ-V2-01**: User can add minimal bookmarks or highlights without notes. *(Scope decision pending.)*
- **DOC-V2-01**: User can correct mangled extracted text as a versioned overlay.

### Knowledge

- **KNOW-V2-01**: User can open an optional secondary visual concept graph. It never replaces the curriculum list.

### Audio

- **AUDIO-V2-01**: Word-level highlight during playback, if the chosen voice engine provides alignments.

### Learning

- **LEARN-V2-01**: User can export practice questions with citations to Anki (.apkg).
- **LEARN-V2-02**: Personal FSRS parameter optimization once enough review history exists, with a workload preview.

### Web

- **WEB-V2-01**: User can explicitly save a web snippet as a separate, labeled reference source.

### Platform

- **PLAT-V2-01**: Verified support for Intel Macs and Windows arm64.
- **PLAT-V2-02**: Linux packaged distribution.
- **PLAT-V2-03**: Non-PDF import formats (EPUB, DOCX, HTML).
- **PLAT-V2-04**: Optional end-to-end-encrypted sync between the user's own devices.

## Out of Scope

Explicitly excluded, to prevent scope creep. Items marked *(proposed)* came from research and are consistent with the brief, but need product ratification.

| Feature | Reason |
|---------|--------|
| PDF viewer, embedded page renderer or page-navigation UI | Danesh shows its own reconstructed content. Internal rasterization for OCR/layout only. |
| Migrating code from the Rust/C#/Next.js prototypes | Greenfield. Prior drafts are product/UI reference only. |
| Python or a multi-language backend | All Danesh-owned code is TypeScript. Native engines only behind typed adapters. |
| Cloud services, accounts, Docker, localhost AI servers, hidden transfers | Local-first and privacy-conscious. |
| Microservices | Modular monolith. |
| Compulsory visual node graph | The primary view is the hierarchical curriculum. |
| Manual study spaces, notebooks, goals, calendars | Organization is automatic. |
| Fabricated topics or unsourced lessons for missing prerequisites | Gaps are mentioned, never filled with invented content. |
| Forced quiz gates | Practice is optional. |
| Numerical mastery scores as ground truth | Three separate, honestly uncertain signals instead. |
| "Mark as learned" strengthening recall | Only retrieval strengthens recall. |
| Simplification presented as normalization | Normalization keeps the full academic level. |
| Silent ingestion of web content | Online evidence always stays separate and labeled. |
| Mock or demo UI presented as real functionality | Previews must be clearly labeled. |
| Podcast-style audio overviews, video overviews, infographics, slide decks *(proposed)* | Generative re-narration invents and drops content. |
| Bulk "dump N flashcards from this PDF" *(proposed)* | Floods the learner with unvetted cards and conflicts with concept-level scheduling. |
| Bring-any-model, arbitrary GGUF import, sampling tuning, custom system prompts *(proposed)* | Breaks the tested-registry promise and exposes plumbing. |
| Cloud LLM API keys as an alternative backend *(proposed)* | Contradicts local-first. |
| Plugin system, MCP server, public API, localhost endpoint *(proposed)* | Electron security surface and scope. |
| Open-ended general chat as the home screen *(proposed)* | The brief says Danesh is not a generic chat app. Q&A is scoped and grounded (LESSON-10). |
| Voice cloning *(proposed)* | Consent and licensing risk; not needed for learning. |
| Social sharing, leaderboards, streaks, XP *(proposed)* | Needs accounts. Engagement metrics contradict the success definition. |
| Usage telemetry *(proposed)* | Privacy. Local diagnostics export instead (UX-09). |
| Browser extension or web clipper *(proposed)* | v1 is PDF-only. |
| Free-form notes workspace | The brief says Danesh is not a note-taking workspace. |

## Open Product Decisions

The brief requires these to be flagged for product review. The default listed is what planning assumes until a decision is made.

| ID | Decision | Default assumed | Gates |
|----|----------|-----------------|-------|
| D-LICENSE | Danesh's own repository license (the LICENSE file was removed in commit b2016c7) | Permissive-compatible design; copyleft engines (MuPDF AGPL, espeak-ng GPL) only as optional adapters | REL-08; PDF engine and TTS choices |
| D-COMMERCIAL | Is Danesh commercial, or free/non-commercial? | Commercial-safe licenses only (excludes CC-BY-NC voices/models) | Voice and model selection |
| D-PLATFORM | Verified platform tier | Windows 11 x64 and macOS 13+ on Apple Silicon verified; Intel Mac and Windows arm64 reported untested | REL-06 |
| D-QA | Scoped grounded Q&A in the contextual panel | Included in v1 (LESSON-10); no global chat home | LESSON-10 |
| D-SELFGRADE | Does a self-graded rating after a recall attempt count as FSRS evidence? | Yes, as a distinct, conservatively weighted evidence type | LEARN-07 |
| D-DISTRIB | Model hosting mirrors, sideloading and signing-account holders (host access may be restricted for Persian-first users) | Offline bundle import (MODEL-05) plus documented mirrors | MODEL-04, REL-03 |
| D-BOOKMARK | Minimal bookmarks/highlights (no notes) | Deferred to v2 | READ-V2-01 |
| D-WEBSAVE | Saving web snippets as a labeled reference source | Deferred to v2; v1 keeps web evidence separate | WEB-V2-01 |

## Traceability

Which phases cover which requirements. Filled in during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 1 | Pending |
| PLAT-04 | Phase 1 | Pending |
| PLAT-05 | Phase 1 | Pending |
| PLAT-06 | Phase 1 | Pending |
| PLAT-07 | Phase 1 | Pending |
| PLAT-08 | Phase 1 | Pending |
| PLAT-09 | Phase 4 | Pending |
| PLAT-10 | Phase 2 | Pending |
| PLAT-11 | Phase 1 | Pending |
| JOB-01 | Phase 2 | Pending |
| JOB-02 | Phase 2 | Pending |
| JOB-03 | Phase 1 | Pending |
| JOB-04 | Phase 2 | Pending |
| JOB-05 | Phase 4 | Pending |
| DOC-01 | Phase 2 | Pending |
| DOC-02 | Phase 2 | Pending |
| DOC-03 | Phase 2 | Pending |
| DOC-04 | Phase 2 | Pending |
| DOC-05 | Phase 2 | Pending |
| DOC-06 | Phase 5 | Pending |
| DOC-07 | Phase 2 | Pending |
| DOC-08 | Phase 2 | Pending |
| DOC-09 | Phase 2 | Pending |
| DOC-10 | Phase 5 | Pending |
| DOC-11 | Phase 2 | Pending |
| DOC-12 | Phase 5 | Pending |
| DOC-13 | Phase 5 | Pending |
| DOC-14 | Phase 5 | Pending |
| DOC-15 | Phase 3 | Pending |
| DOC-16 | Phase 2 | Pending |
| DOC-17 | Phase 2 | Pending |
| DOC-18 | Phase 2 | Pending |
| DOC-19 | Phase 12 | Pending |
| DOC-20 | Phase 5 | Pending |
| READ-01 | Phase 3 | Pending |
| READ-02 | Phase 3 | Pending |
| READ-03 | Phase 5 | Pending |
| READ-04 | Phase 3 | Pending |
| READ-05 | Phase 6 | Pending |
| READ-06 | Phase 3 | Pending |
| READ-07 | Phase 3 | Pending |
| READ-08 | Phase 3 | Pending |
| READ-09 | Phase 3 | Pending |
| READ-10 | Phase 9 | Pending |
| READ-11 | Phase 3 | Pending |
| READ-12 | Phase 3 | Pending |
| READ-13 | Phase 7 | Pending |
| KNOW-01 | Phase 6 | Pending |
| KNOW-02 | Phase 6 | Pending |
| KNOW-03 | Phase 6 | Pending |
| KNOW-04 | Phase 6 | Pending |
| KNOW-05 | Phase 6 | Pending |
| KNOW-06 | Phase 6 | Pending |
| KNOW-07 | Phase 6 | Pending |
| KNOW-08 | Phase 6 | Pending |
| KNOW-09 | Phase 6 | Pending |
| LESSON-01 | Phase 8 | Pending |
| LESSON-02 | Phase 8 | Pending |
| LESSON-03 | Phase 8 | Pending |
| LESSON-04 | Phase 8 | Pending |
| LESSON-05 | Phase 8 | Pending |
| LESSON-06 | Phase 8 | Pending |
| LESSON-07 | Phase 8 | Pending |
| LESSON-08 | Phase 8 | Pending |
| LESSON-09 | Phase 8 | Pending |
| LESSON-10 | Phase 8 | Pending |
| LANG-01 | Phase 7 | Pending |
| LANG-02 | Phase 7 | Pending |
| LANG-03 | Phase 7 | Pending |
| LANG-04 | Phase 7 | Pending |
| LANG-05 | Phase 7 | Pending |
| LANG-06 | Phase 7 | Pending |
| LANG-07 | Phase 7 | Pending |
| LANG-08 | Phase 7 | Pending |
| AUDIO-01 | Phase 10 | Pending |
| AUDIO-02 | Phase 10 | Pending |
| AUDIO-03 | Phase 10 | Pending |
| AUDIO-04 | Phase 10 | Pending |
| AUDIO-05 | Phase 10 | Pending |
| AUDIO-06 | Phase 10 | Pending |
| AUDIO-07 | Phase 10 | Pending |
| AUDIO-08 | Phase 10 | Pending |
| AUDIO-09 | Phase 10 | Pending |
| LEARN-01 | Phase 9 | Pending |
| LEARN-02 | Phase 9 | Pending |
| LEARN-03 | Phase 9 | Pending |
| LEARN-04 | Phase 9 | Pending |
| LEARN-05 | Phase 9 | Pending |
| LEARN-06 | Phase 9 | Pending |
| LEARN-07 | Phase 9 | Pending |
| LEARN-08 | Phase 9 | Pending |
| LEARN-09 | Phase 9 | Pending |
| LEARN-10 | Phase 9 | Pending |
| MODEL-01 | Phase 4 | Pending |
| MODEL-02 | Phase 4 | Pending |
| MODEL-03 | Phase 4 | Pending |
| MODEL-04 | Phase 4 | Pending |
| MODEL-05 | Phase 4 | Pending |
| MODEL-06 | Phase 4 | Pending |
| MODEL-07 | Phase 10 | Pending |
| MODEL-08 | Phase 4 | Pending |
| WEB-01 | Phase 11 | Pending |
| WEB-02 | Phase 11 | Pending |
| WEB-03 | Phase 11 | Pending |
| WEB-04 | Phase 11 | Pending |
| WEB-05 | Phase 11 | Pending |
| WEB-06 | Phase 11 | Pending |
| UX-01 | Phase 4 | Pending |
| UX-02 | Phase 3 | Pending |
| UX-03 | Phase 3 | Pending |
| UX-04 | Phase 4 | Pending |
| UX-05 | Phase 12 | Pending |
| UX-06 | Phase 11 | Pending |
| UX-07 | Phase 12 | Pending |
| UX-08 | Phase 12 | Pending |
| UX-09 | Phase 11 | Pending |
| UX-10 | Phase 12 | Pending |
| UX-11 | Phase 3 | Pending |
| EVAL-01 | Phase 2 | Pending |
| EVAL-02 | Phase 2 | Pending |
| EVAL-03 | Phase 12 | Pending |
| EVAL-04 | Phase 10 | Pending |
| EVAL-05 | Phase 1 | Pending |
| EVAL-06 | Phase 1 | Pending |
| EVAL-07 | Phase 1 | Pending |
| EVAL-08 | Phase 11 | Pending |
| REL-01 | Phase 1 | Pending |
| REL-02 | Phase 1 | Pending |
| REL-03 | Phase 12 | Pending |
| REL-04 | Phase 12 | Pending |
| REL-05 | Phase 12 | Pending |
| REL-06 | Phase 12 | Pending |
| REL-07 | Phase 12 | Pending |
| REL-08 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 136 total
- Mapped to phases: 136
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-09*
*Last updated: 2026-10-09 after roadmap creation (traceability populated)*
