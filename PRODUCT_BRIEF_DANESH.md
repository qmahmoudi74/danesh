# Danesh — Product Brief for GSD Core

> Status: Confirmed product intent and engineering constraints for greenfield v1. This is an input to project planning, **not** evidence that any feature has already been implemented.
>
> Language: Product UI defaults to Persian (RTL). Engineering artifacts and source code may use English.

## Vision

Danesh is a privacy-conscious, local-first **desktop learning environment**, not a PDF reader, translator-only utility, note-taking workspace, or generic chat application. It takes instructional source material, reconstructs reliable semantic content, organizes concepts into an adaptive learning structure, teaches via source-grounded lessons and practice, and helps users retain and apply what they learn.

Success means **delayed, AI-independent recall and application**, not simply number of documents processed, generated words, or time spent in the app.

## Firm technical constraints

- Greenfield implementation. Do not migrate code or infrastructure from an earlier Rust, C#, or Next.js prototype. Prior drafts can provide product and UI reference only.
- **Electron + React + TypeScript** for the authored application. All Danesh-owned application code should be TypeScript. Native third-party engines are acceptable where they materially improve performance or accuracy, but must be isolated behind simple typed adapters. Do not introduce Python or a separately maintained multi-language backend.
- Desktop distribution on **Windows and macOS**. Build/test each platform separately and report untested platforms truthfully.
- AI is **local-first**: primary content processing should work offline after model download. Web research is an optional, explicitly network-dependent capability.
- **v1 imports PDF only. No PDF viewer, embedded page renderer, or PDF page navigation UI.** Internal PDF rasterization is allowed for OCR/layout understanding. Danesh must display its *own reconstructed, reflowable semantic content*.
- Fast, responsive UI; resource-intensive PDF, OCR, language-model, and TTS tasks must not block Electron's renderer or main process. Worker isolation, persistent checkpoints, and bounded resource use are required.
- Do not prematurely lock in PDF parsers, OCR engines, inference runtimes, or voice models based on hype. Research and test the actual platforms, document accuracy, model quality in Persian, packaging, security, and licenses. Prefer fewer dependencies but not at the expense of quality.
- Avoid unnecessary cloud services, accounts, Docker, localhost AI servers, and hidden external data transfers. An embedded/native process is preferable where tested and feasible. Evaluate trade-offs in ADRs.

## v1 capabilities — all required unless noted

### DOC: PDF ingestion and faithful semantic reconstruction

- Import valid PDFs, preserve immutable originals and provenance; hash and deduplicate, handle damaged/encrypted files safely and explicitly.
- Extract paragraphs, headings, code, tables, equations, figures, captions, footnotes, and original structural outline where present. Respect reading order, mixed Persian/English text, multi-column layouts, Unicode directionality, and technical notation.
- Use OCR selectively for scanned/undecodable regions, and explicitly mark low-confidence, missing, or unsupported content. Never hallucinate missing text, formulas, or figures.
- Store a **canonical semantic document model**, not Markdown as the source of truth. Each content block needs stable IDs, type, original text or structured data, page/region provenance, original source links, extraction version and quality status.
- Persist jobs; pause/retry/resume without silently losing verified output. Handle crashes, out-of-memory and corrupt pages. Work for large books without requiring a single massive LLM context.
- Original **source outline** must remain navigable as a separate view, even when Danesh creates an alternative learning sequence.

### READ: Danesh's own semantic reader

- Reflowable, readable, beautiful Persian-first RTL UI with correct mixed-language text and scientific typesetting; render reconstructed headings, paragraphs, tables, code, equations, images, citations.
- Reading progress automatically inferred from meaningful activity, with manual correction; do not equate opening/scrolling with verified learning.
- Concept-based study navigation is primary; original source structure is additionally available. Reader should support selection-based learning actions. It is **not** a PDF viewer.
- Preserve stable reading position and make source evidence/excerpts inspectable without drawing the original PDF page as the main experience.

### KNOW: unified knowledge map and learning sequence

- Automatically discover topics, coherent subtopics and likely prerequisite/corequisite relationships from imported PDF content. Merge concept equivalents across multiple PDFs only when evidence supports equivalence; preserve disagreements, alternative definitions and source attribution.
- Primary presentation is a simple hierarchical curriculum/list, **not a compulsory visual node graph**. Recommend next concepts based on source coverage, prerequisites and demonstrated progress, but never lock the user out of choosing topics.
- User must not have to create manual study spaces, notebooks, goals or calendar schedules.
- For an **essential prerequisite missing from all uploaded sources**, mention the gap naturally when relevant. Do **not** fabricate an empty curriculum topic or standalone unsourced lesson. If a later PDF supplies it, integration is allowed.
- Adding a source automatically updates affected concepts, relationships and lessons without erasing reading history, assessments, previous generated content or learning progress.

### LESSON: lessons from evidence

- Generate coherent teaching material **on demand**, composed from relevant uploaded sources, preserving traceable citations and inspectable original excerpts. Preserve source disagreements and explain their context.
- Cache generated lessons, keep generation/version/provenance metadata, and flag affected lessons stale when source knowledge changes. Full regeneration should not happen unnecessarily.
- Clearly distinguish source-grounded content from any explicitly labeled supplemental model explanation. Grounded source material must not quietly acquire invented facts.

### LANG: translation, educational normalization and distinct summarization

- Persian translation and educational normalization occur in a coordinated pipeline. Maintain meaning, technical detail, constraints, examples, code, exceptions and **full scientific complexity**.
- Normalization establishes consistent baseline terminology, tone, conceptual continuity and domain-specific glossary across source materials. It reduces confusion and *extraneous* cognitive load. **It is NOT simplification or lowering the academic level**.
- Brief references to already explained concepts may be used where supported; substantive additions must be marked, and translation must not invent facts.
- **Summarization is a separate optional transformation**, explicitly shorter than original and designed for review. It should check coverage of essential points and indicate material omissions/uncertainty; it must never silently replace the canonical learning content.
- Actions may operate contextually on selected text, current concept/lesson, or whole source when appropriate; heavy source-wide jobs need progress and resumption.

### AUDIO: natural local AI voice in v1

- Natural, useful text-to-speech in Persian and English is a **v1 requirement**, not a later nice-to-have.
- Read normalized translations and lessons; allow play/pause/seek/speed and reuse of cached generated audio. Pronunciation of mixed Persian/English technical terms and numeric expressions needs explicit listening evaluation.
- Choose and download voice assets suitable for the machine with clear resource and storage indications. Do not claim naturalness merely because a voice is listed as Persian.

### LEARN: active learning, assessment and memory

- Short optional retrieval-practice prompts, concept explanation, suitable application exercises, feedback and progressive hints; do not force quiz gates or always reveal solutions immediately.
- Separate **reading coverage**, **assessed understanding**, and **predicted recall probability**. Unsupported numerical mastery scores should not masquerade as ground truth.
- Use an FSRS-like evidence-based scheduling algorithm and prior review outcomes to estimate recall probability; visually fade the **concept indicator** as predicted recall decreases (not the lesson text). Users can strengthen concepts with successful retrieval, not merely by clicking a green button. Estimates are uncertain, not measured individual forgetting timestamps.
- Suggest reviews automatically without requiring a calendar plan or endless obligation. Keep manual progress correction separate from objective retrieval evidence.

### MODEL: private local model management

- Detect OS, CPU/GPU, available memory, storage and supported accelerators; pick from a curated, versioned, actually tested model registry based on role (reasoning/extraction, Persian translation, multimodal/document, embedding, voice).
- Support guided model download, progress, integrity checks, caching, compatibility checks and graceful degradation / clear OOM handling; avoid loading unnecessary concurrent models.
- Do not claim hardware support without running it, and do not equate a fitting model with a good model. Use real quality evals per task.

### WEB: controlled, optional research

- Allow the local AI to query external information when needed through constrained search/open/read tools. Show links, source dates and distinguish online evidence from uploaded-PDF evidence.
- Never silently ingest internet material into the user's sourced knowledge map. Do not send private PDFs, passages or sensitive queries to search providers without clear user control/consent. The rest of the app works offline when models are present.

## UX principles

- A calm, spacious, typography-first study product; prioritize content over AI tool dashboards.
- Candidate layout: collapsible topic navigation, wide central reader, contextual optional assistance panel. This is a **candidate** and must be reviewed rather than treated as the final UI.
- Contextual actions and sensible defaults rather than exposing model names, context sizes or technical plumbing during normal study.
- Fully support Persian RTL and mixed-language code/equations. Offer clear import/model/job/quality state without making all technical controls persistent on screen.
- Preserve accessibility: selection, focus and keyboard navigation; high contrast and readable text; visual memory fade never conveys crucial meaning through color alone.

## Architectural requirements

- Separate source document model, evidence extraction, normalized language outputs, concept/relationship model, generated lessons, learning evidence, recall schedule, and model/job state. A model switch must not destroy canonical source data or study progress.
- Version schemas, migrations, generated content, model metadata, prompt/processing versions, and evaluations.
- Use bounded jobs, checkpointing and cancellation; long-running tasks must survive app restarts where feasible. Electron boundaries need strict IPC validation, context isolation, no Node integration in untrusted renderer and restrictive CSP.
- Modular architecture, not microservices for their own sake. Avoid premature abstraction but keep inference, OCR and TTS behind replaceable contracts.
- Public GitHub repository, automated CI on Windows/macOS, clean-machine installers and accurate licensing notices for engines/models/voices.

## Test-first and evaluation requirements (MANDATORY)

- Define **observable acceptance scenarios (BDD/ATDD)** before implementing each user-visible capability: happy path, missing/invalid inputs, edge cases, recovery, cancellation and persistence.
- Use **TDD where deterministic correctness matters**: source identity, deduplication, job state machine, provenance, text ordering transforms, data migrations, graph integrity, FSRS scheduling and privacy policy.
- Maintain a real PDF fixture suite covering selectable text, Persian/English mixed bidi, code, tables, multi-column, image figures, math, scanned/low-quality, broken, long-document samples. The previous Rust team's generated PDFs alone do **not** constitute sufficient evidence of real-world quality.
- Maintain independent **AI quality evals** with references: content completeness, factual/source fidelity, omission/extra-content detection, Persian technical term consistency, concept merges and prerequisite precision, citation accuracy, quiz answer quality and spoken voice listening checks.
- Never invent pass rates or benchmarks. Record baseline metrics, actual performance and a clear pass/fail policy before declaring features release-ready.
- Verify real Windows/macOS packaged operation; do not present CI configuration or green unit tests as proof of successful installers.
- Report verified, partially verified and blocked requirements truthfully, with evidence paths.

## Suggested v1 implementation phases (GSD may refine order after dependency analysis)

1. Foundation: repository, Electron/React/TypeScript, security boundaries, persistent storage, CI, packaging smoke test.
2. Document pipeline: real PDF import, canonical content model, provenance, persistent resumable jobs.
3. Semantic reader: full Persian/English typography, source outline, navigation, saved progress, contextual source excerpts.
4. Document intelligence quality: OCR, structured tables, equations, images, adversarial fixtures and regression/evaluation harness.
5. Local inference/model manager: hardware checks, downloads, text/vision/embedding roles, model quality tests.
6. Knowledge synthesis: concept extraction, deduplication, relationships, grounded learning tree and incremental source updates.
7. Lesson/content production: on-demand grounded lesson, coordinated translation+normalization, separate summarization/coverage validation.
8. Audio: Persian/English natural local TTS, streaming/chunk caching and speaker-quality evaluations.
9. Learning: active recall, feedback, reading vs mastery separation, FSRS scheduling and indicator fading.
10. Research: opt-in constrained web tools, citations and separation of online vs private sources.
11. Hardening/release: large-book reliability, usability/accessibility, quality gates, Windows/macOS installers and licensing.

## Rules for the agent executing this project

- Make reasonable technical choices, research libraries, document important trade-offs in ADRs, and do not ask the user to select each package.
- When a choice might change **product intent**, flag the contradiction for product review instead of silently changing a confirmed requirement.
- Phase work must have requirements, acceptance tests, implementation, actual verification, and persistent status. Continue to the next phase when approved by workflow, not confuse phase completion with v1 completion.
- Avoid mock/demo UI presented as real functionality. Clearly label previews and incomplete implementations.
- Do not push/publish, connect third-party accounts, deploy paid services, delete data or perform destructive commands without explicit authorization.
- Treat success as functional learning outcomes and reliable content, not number of lines of code.
