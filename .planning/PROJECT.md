# Danesh

## What This Is

Danesh is a privacy-conscious, local-first **desktop learning environment** for Windows and macOS. It takes instructional PDFs, reconstructs reliable semantic content from them, organizes the concepts into an adaptive learning structure, teaches through source-grounded lessons and practice, and helps the learner retain and apply what they learn. It is not a PDF reader, a translator-only utility, a note-taking workspace, or a generic chat app. The product UI is Persian-first (RTL) with full mixed Persian/English and scientific content support.

## Core Value

A learner can study their own PDFs and achieve **delayed, AI-independent recall and application** of the material, built on faithfully reconstructed, source-grounded content that never invents facts.

Success is measured by functional learning outcomes and reliable content, not documents processed, words generated, time spent in the app, or lines of code.

## Requirements

### Validated

(None yet — ship to validate)

### Active

All Active requirements are hypotheses until shipped and validated. Grouped by the brief's capability areas; every area is required for v1.

**DOC — PDF ingestion and faithful semantic reconstruction**

- [ ] Import valid PDFs; preserve immutable originals with provenance; hash and deduplicate
- [ ] Handle damaged and encrypted PDFs safely and with explicit user-facing status
- [ ] Extract paragraphs, headings, code, tables, equations, figures, captions, footnotes, and the original structural outline where present
- [ ] Respect reading order, mixed Persian/English text, multi-column layouts, Unicode directionality, and technical notation
- [ ] Use OCR selectively for scanned or undecodable regions only
- [ ] Explicitly mark low-confidence, missing, or unsupported content; never hallucinate missing text, formulas, or figures
- [ ] Store a canonical semantic document model (not Markdown as source of truth): each block has a stable ID, type, original text or structured data, page/region provenance, source links, extraction version, and quality status
- [ ] Persist jobs; pause/retry/resume without silently losing verified output
- [ ] Survive crashes, out-of-memory conditions, and corrupt pages
- [ ] Process large books without requiring a single massive LLM context
- [ ] Keep the original source outline navigable as a separate view, even when Danesh creates an alternative learning sequence

**READ — Danesh's own semantic reader (not a PDF viewer)**

- [ ] Reflowable, beautiful, Persian-first RTL reader with correct mixed-language text and scientific typesetting
- [ ] Render reconstructed headings, paragraphs, tables, code, equations, images, and citations
- [ ] Infer reading progress from meaningful activity, with manual correction; opening or scrolling does not count as verified learning
- [ ] Concept-based study navigation as the primary mode; original source structure available as a secondary mode
- [ ] Selection-based learning actions in the reader
- [ ] Stable reading position preserved across sessions
- [ ] Source evidence and original excerpts inspectable without rendering the original PDF page as the main experience

**KNOW — unified knowledge map and learning sequence**

- [ ] Automatically discover topics, coherent subtopics, and likely prerequisite/corequisite relationships from imported PDF content
- [ ] Merge equivalent concepts across PDFs only when evidence supports equivalence; preserve disagreements, alternative definitions, and source attribution
- [ ] Present a simple hierarchical curriculum/list as the primary view (no compulsory visual node graph)
- [ ] Recommend next concepts from source coverage, prerequisites, and demonstrated progress, without ever locking the user out of choosing topics
- [ ] No manual study spaces, notebooks, goals, or calendar schedules required from the user
- [ ] When an essential prerequisite is missing from all uploaded sources, mention the gap naturally where relevant; never fabricate an empty curriculum topic or a standalone unsourced lesson
- [ ] A later PDF that supplies a missing prerequisite can be integrated
- [ ] Adding a source automatically updates affected concepts, relationships, and lessons without erasing reading history, assessments, prior generated content, or learning progress

**LESSON — lessons from evidence**

- [ ] Generate coherent teaching material on demand, composed from relevant uploaded sources
- [ ] Preserve traceable citations and inspectable original excerpts in every lesson
- [ ] Preserve source disagreements and explain their context
- [ ] Cache generated lessons with generation/version/provenance metadata
- [ ] Flag affected lessons as stale when source knowledge changes; avoid unnecessary full regeneration
- [ ] Clearly distinguish source-grounded content from explicitly labeled supplemental model explanation; grounded material must not quietly acquire invented facts

**LANG — translation, educational normalization, and distinct summarization**

- [ ] Coordinated Persian translation + educational normalization pipeline preserving meaning, technical detail, constraints, examples, code, exceptions, and full scientific complexity
- [ ] Normalization establishes consistent baseline terminology, tone, conceptual continuity, and a domain glossary across sources, reducing extraneous cognitive load — it is NOT simplification or lowering the academic level
- [ ] Brief references to already-explained concepts allowed where supported; substantive additions are marked; translation never invents facts
- [ ] Summarization is a separate, optional, explicitly shorter transformation for review that checks coverage of essential points, indicates material omissions/uncertainty, and never silently replaces canonical learning content
- [ ] Actions operate contextually on selected text, the current concept/lesson, or a whole source as appropriate
- [ ] Heavy source-wide jobs show progress and support resumption

**AUDIO — natural local AI voice (v1, not a nice-to-have)**

- [ ] Natural, useful local text-to-speech in Persian and English
- [ ] Read normalized translations and lessons aloud with play/pause/seek/speed
- [ ] Cache and reuse generated audio
- [ ] Explicit listening evaluation of pronunciation for mixed Persian/English technical terms and numeric expressions
- [ ] Choose and download voice assets suited to the machine, with clear resource and storage indications
- [ ] Never claim naturalness merely because a voice is listed as Persian

**LEARN — active learning, assessment, and memory**

- [ ] Short optional retrieval-practice prompts, concept explanation, suitable application exercises, feedback, and progressive hints
- [ ] No forced quiz gates; solutions not always revealed immediately
- [ ] Separate reading coverage, assessed understanding, and predicted recall probability as distinct signals
- [ ] No unsupported numerical mastery scores presented as ground truth
- [ ] FSRS-like evidence-based scheduling using prior review outcomes to estimate recall probability
- [ ] Visually fade the concept indicator (not the lesson text) as predicted recall decreases; estimates presented as uncertain, not measured forgetting timestamps
- [ ] Concepts strengthen only through successful retrieval, not by clicking a "done" button
- [ ] Suggest reviews automatically without a calendar plan or endless obligation
- [ ] Manual progress correction kept separate from objective retrieval evidence

**MODEL — private local model management**

- [ ] Detect OS, CPU/GPU, available memory, storage, and supported accelerators
- [ ] Pick from a curated, versioned, actually-tested model registry by role: reasoning/extraction, Persian translation, multimodal/document, embedding, voice
- [ ] Guided model download with progress, integrity checks, caching, and compatibility checks
- [ ] Graceful degradation and clear OOM handling; avoid loading unnecessary concurrent models
- [ ] Never claim hardware support without running it; never equate "fits in memory" with "good quality" — use real per-task quality evals

**WEB — controlled, optional research**

- [ ] Local AI can query external information through constrained search/open/read tools when needed
- [ ] Show links and source dates; distinguish online evidence from uploaded-PDF evidence
- [ ] Never silently ingest internet material into the user's sourced knowledge map
- [ ] Never send private PDFs, passages, or sensitive queries to search providers without clear user control/consent
- [ ] Rest of the app works fully offline when models are present

**UX — product-wide experience principles**

- [ ] Calm, spacious, typography-first study product that prioritizes content over AI tool dashboards
- [ ] Contextual actions and sensible defaults; no model names, context sizes, or technical plumbing exposed during normal study
- [ ] Clear import/model/job/quality state available without persistent on-screen technical controls
- [ ] Accessibility: selection, focus, and keyboard navigation; high contrast and readable text; memory fade never conveys crucial meaning through color alone

**PLAT — architecture, quality, and release**

- [ ] Separated data domains: source document model, evidence extraction, normalized language outputs, concept/relationship model, generated lessons, learning evidence, recall schedule, model/job state; a model switch never destroys canonical source data or study progress
- [ ] Versioned schemas, migrations, generated content, model metadata, prompt/processing versions, and evaluations
- [ ] Bounded jobs with checkpointing and cancellation; long-running tasks survive app restarts where feasible
- [ ] Electron security: strict IPC validation, context isolation, no Node integration in untrusted renderer, restrictive CSP
- [ ] Heavy PDF/OCR/LLM/TTS work never blocks Electron's renderer or main process (worker isolation, bounded resources)
- [ ] Public GitHub repository with automated CI on Windows and macOS
- [ ] Clean-machine installers for Windows and macOS, verified as real packaged operation
- [ ] Accurate licensing notices for all engines, models, and voices
- [ ] Real PDF fixture suite: selectable text, Persian/English mixed bidi, code, tables, multi-column, image figures, math, scanned/low-quality, broken, and long-document samples
- [ ] Independent AI quality evals with references: content completeness, factual/source fidelity, omission/extra-content detection, Persian technical-term consistency, concept merge and prerequisite precision, citation accuracy, quiz answer quality, spoken voice listening checks
- [ ] Recorded baseline metrics, actual performance, and an explicit pass/fail policy before any feature is declared release-ready

### Out of Scope

- **PDF viewer, embedded page renderer, or PDF page navigation UI** — Danesh displays its own reconstructed, reflowable semantic content; internal rasterization for OCR/layout is allowed but never shown as the main experience
- **Non-PDF import formats (EPUB, DOCX, HTML, etc.)** — v1 imports PDF only
- **Migrating code or infrastructure from the earlier Rust, C#, or Next.js prototypes** — greenfield; prior drafts are product/UI reference only
- **Python or a separately maintained multi-language backend** — all Danesh-owned code is TypeScript; native engines only behind typed adapters
- **Cloud services, user accounts, Docker, localhost AI servers, and hidden external data transfers** — local-first and privacy-conscious; embedded/native processes preferred
- **Microservices architecture** — modular monolith; avoid microservices for their own sake
- **Compulsory visual node-graph as the primary knowledge view** — the primary presentation is a hierarchical curriculum/list
- **Manual study spaces, notebooks, goals, or calendar schedules** — the user must not have to create these
- **Fabricated curriculum topics or standalone unsourced lessons for missing prerequisites** — gaps are mentioned naturally, not filled with invented content
- **Forced quiz gates** — practice is optional
- **Numerical mastery scores presented as ground truth** — reading coverage, assessed understanding, and predicted recall stay separate and honestly uncertain
- **"Mark as learned" buttons that strengthen recall** — only successful retrieval strengthens a concept
- **Simplification or lowering the academic level as "normalization"** — normalization preserves full scientific complexity
- **Silent ingestion of web content into the knowledge map** — online evidence is always separate and labeled
- **Linux packaged distribution** — v1 targets Windows and macOS only
- **Mock/demo UI presented as real functionality** — previews and incomplete implementations must be clearly labeled

## Context

**Product positioning.** Danesh ("knowledge" in Persian) is a learning environment, not a document tool. Every capability serves delayed, AI-independent recall and application. The UI defaults to Persian (RTL); engineering artifacts and source code may use English.

**Prior work.** Earlier prototypes were built in Rust, C#, and Next.js. They are product and UI reference only — no code, infrastructure, or test assets are migrated. The previous Rust team's generated PDFs alone are not sufficient evidence of real-world extraction quality.

**Technical environment.** Electron + React + TypeScript desktop app targeting Windows and macOS. Resource-intensive work (PDF parsing, OCR, language models, TTS) runs in isolated workers or embedded native processes with persistent checkpoints and bounded resource use. AI runs locally after model download; web research is the only optional network-dependent capability.

**Engine selection is open.** PDF parsers, OCR engines, inference runtimes, embedding models, translation models, and voice models are intentionally not chosen yet. Choices must come from research and hands-on testing on the actual platforms: accuracy, Persian quality, packaging, security, and licenses — documented in ADRs. Prefer fewer dependencies, but not at the expense of quality. Do not lock in on hype.

**Candidate UX layout (not final).** Collapsible topic navigation, wide central reader, contextual optional assistance panel. This is a candidate to be reviewed, not a decided design.

**Brief's suggested v1 phase order** (GSD may refine after dependency analysis):

1. Foundation: repository, Electron/React/TypeScript, security boundaries, persistent storage, CI, packaging smoke test
2. Document pipeline: real PDF import, canonical content model, provenance, persistent resumable jobs
3. Semantic reader: full Persian/English typography, source outline, navigation, saved progress, contextual source excerpts
4. Document intelligence quality: OCR, structured tables, equations, images, adversarial fixtures, regression/evaluation harness
5. Local inference/model manager: hardware checks, downloads, text/vision/embedding roles, model quality tests
6. Knowledge synthesis: concept extraction, deduplication, relationships, grounded learning tree, incremental source updates
7. Lesson/content production: on-demand grounded lessons, coordinated translation+normalization, separate summarization/coverage validation
8. Audio: Persian/English natural local TTS, streaming/chunk caching, speaker-quality evaluations
9. Learning: active recall, feedback, reading vs mastery separation, FSRS scheduling, indicator fading
10. Research: opt-in constrained web tools, citations, separation of online vs private sources
11. Hardening/release: large-book reliability, usability/accessibility, quality gates, Windows/macOS installers, licensing

**Test-first and evaluation mandate.**

- Define observable acceptance scenarios (BDD/ATDD) before implementing each user-visible capability: happy path, missing/invalid inputs, edge cases, recovery, cancellation, persistence.
- TDD where deterministic correctness matters: source identity, deduplication, job state machine, provenance, text-ordering transforms, data migrations, graph integrity, FSRS scheduling, privacy policy.
- Never invent pass rates or benchmarks. Report verified, partially verified, and blocked requirements truthfully with evidence paths.
- CI configuration or green unit tests are not proof of working installers; real packaged operation on Windows and macOS must be verified, and untested platforms reported as untested.

## Constraints

- **Tech stack**: Electron + React + TypeScript; all Danesh-owned application code in TypeScript — single-language codebase, no separately maintained backend
- **Native engines**: Third-party native engines allowed only where they materially improve performance or accuracy, isolated behind simple typed adapters — keeps engines replaceable and the codebase TypeScript
- **No Python**: No Python runtime or Python backend — avoids a multi-language backend to maintain and package
- **Platforms**: Windows and macOS; each built and tested separately; untested platforms reported truthfully — the two target desktop audiences
- **Local-first AI**: Primary content processing works offline after model download — privacy and independence from cloud services
- **Privacy**: No hidden external data transfers; no private PDFs, passages, or sensitive queries sent to search providers without explicit consent — privacy-conscious positioning
- **Infrastructure**: No unnecessary cloud services, accounts, Docker, or localhost AI servers; embedded/native process preferred where tested and feasible; trade-offs recorded in ADRs — simple, private, installable desktop app
- **Input format**: v1 imports PDF only; no PDF viewer UI — Danesh's value is its own reconstructed content
- **Performance**: Heavy PDF/OCR/LLM/TTS work must not block Electron's renderer or main process; worker isolation, persistent checkpoints, and bounded resource use required — fast, responsive UI on consumer hardware
- **Security**: Strict IPC validation, context isolation, no Node integration in untrusted renderer, restrictive CSP — Electron hardening for a local app handling user documents and AI output
- **Data integrity**: Canonical semantic document model is the source of truth; schemas, migrations, generated content, model/prompt versions, and evaluations are versioned; model switches never destroy source data or study progress — learning history must be durable
- **Content fidelity**: Never hallucinate missing text, formulas, figures, or facts; supplemental model explanations are explicitly labeled — trust is the product
- **Engine selection**: No premature lock-in of PDF parsers, OCR, inference runtimes, or voices; research and test real platforms, Persian quality, packaging, security, and licenses — quality over hype
- **Licensing**: Accurate licensing notices for engines, models, and voices; public GitHub repository — open distribution
- **Agent conduct**: Make reasonable technical choices and document important trade-offs in ADRs without asking the user to pick each package; flag any choice that would change product intent for product review instead of silently changing a confirmed requirement
- **Authorization**: No pushing/publishing, connecting third-party accounts, deploying paid services, deleting data, or destructive commands without explicit authorization
- **Phase discipline**: Each phase has requirements, acceptance tests, implementation, actual verification, and persistent status; phase completion is not v1 completion

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Greenfield build; prior Rust/C#/Next.js prototypes used as product/UI reference only | Clean architecture aligned with confirmed constraints; avoid inheriting prior tech debt | — Pending |
| Electron + React + TypeScript, single-language authored code | One language for the whole app; native engines behind typed adapters where they earn their place | — Pending |
| Local-first AI with embedded/native inference (no localhost servers, no cloud) | Privacy, offline operation, and no hidden data transfer | — Pending |
| PDF-only import with no PDF viewer; Danesh renders its own reconstructed semantic content | The product is the reconstructed, teachable content, not page rendering | Confirmed by owner 2026-10-10; early viewer removed; semantic Reader remains partial |
| Canonical semantic document model (stable block IDs + provenance) as source of truth, not Markdown | Enables provenance, citations, stale detection, and incremental updates | — Pending |
| Hierarchical curriculum/list as primary knowledge view; no compulsory node graph | Calm, typography-first study experience | — Pending |
| Natural local Persian/English TTS is a v1 requirement | Audio is part of the core learning experience, not an add-on | — Pending |
| FSRS-like scheduling with separate coverage / understanding / recall signals | Evidence-based memory model; avoid fake mastery scores | — Pending |
| Engine choices (PDF parser, OCR, inference runtime, models, voices) deferred to research + ADRs | Avoid hype-driven lock-in; test Persian quality, packaging, licenses on real platforms | — Pending |
| Test-first: BDD/ATDD acceptance scenarios per capability; TDD for deterministic cores; independent AI quality evals | Quality must be demonstrated with evidence, not asserted | — Pending |
| Fine-grained phase slicing (8–12 phases), parallel plan execution | Broad v1 scope with 11 suggested phases in the brief | — Pending |
| MIT license for Danesh's original source code (D-LICENSE, decided by the user 2026-10-09) | A permissive license for the public repo. Third-party components keep their own licenses, and GPL, AGPL and LGPL engines (MuPDF, espeak-ng) are excluded from distributed builds. | ✓ Decided |
| Premium custom desktop shell and design system from Phase 1 (user direction 2026-10-10, Plan 01-17) | Danesh must feel calm, precise and crafted rather than like a stock Electron window. Frameless window with its own title bar (native traffic lights kept on macOS), System/Light/Dark themes applied by Main before first paint, semantic tokens in `apps/renderer/src/styles/tokens.css`, motion tokens with reduced-motion support. Every later screen follows 01-UI-SPEC.md "Amendment A". | ✓ Decided |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-09 after initialization*
