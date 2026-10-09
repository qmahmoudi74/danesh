# Feature Research

**Domain:** Local-first, Persian-first (RTL) AI desktop learning environment that turns instructional PDFs into a source-grounded curriculum, reader, lessons, translations, audio, and spaced-repetition practice
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall. Competitor feature sets come from vendor pages and reviews (MEDIUM, directionally reliable). Persian-specific PDF/TTS/typography claims rest on domain knowledge plus thin sources (LOW-MEDIUM, flagged inline). No competitor ships Danesh's exact combination, so "table stakes" is partly inferred by analogy.

## How to read this document

- IDs (DOC-x, READ-x, ...) are proposed requirement handles, aligned to the capability areas in PROJECT.md.
- **TS** = table stakes, **DIFF** = differentiator, **AF** = anti-feature (do not build), **GAP** = table stakes the brief does not mention (requirements step must decide).
- Complexity: L / M / H. "Deps" lists what must exist first.
- PROJECT.md "Out of Scope" is treated as confirmed. Where a competitor has that feature, the table says why Danesh deliberately does not.

## Competitive landscape (what comparable products actually do)

| Product class | Representative features users now expect | Relevance to Danesh |
|---|---|---|
| NotebookLM (cloud) | Multi-source upload; chat with inline citations that jump to the source passage; study guides, flashcards, quizzes (generated only from uploaded sources; wrong answers get an explanation plus an "Explain" button); Guided Learning mode; Audio/Video Overviews, mind maps, infographics, slide decks; daily generation caps | Sets the bar for "grounded answers with citations" and "quiz from my sources". Its podcast/video/mind-map outputs are the opposite of Danesh's fidelity-first stance. Cloud-only and account-bound. |
| Readwise Reader | Highlights/annotations; full-text search; TTS narration of any document; AI assistant (define, ask, simplify); offline access; API and export (Obsidian/Notion) via Readwise; saved reading position | Sets the bar for reader ergonomics, search, TTS, export. Simplify-language action conflicts with Danesh's "no lowering academic level". |
| RemNote | PDF to AI flashcards, AI tutor, AI explanations on cards, SM-2/FSRS scheduling, select text to create cards, preview and edit cards before saving | Sets the bar for "document to practice". Bulk card dumps and notes workspace are not Danesh's model. |
| Anki + FSRS | Stability/difficulty/retrievability model; desired retention default 0.90; parameter optimizer needing hundreds of reviews (400+ in 24.04) before it beats defaults; daily limits; full-collection backups (.colpkg) and deck export (.apkg); forum evidence that changing desired retention can explode review load (150 to 4000+/day) and users recover from backups | Sets the bar for scheduling correctness, backup, and workload safety. Cautionary tale for exposing retention knobs. |
| Quizlet / Brainscape | Magic Notes (notes to flashcards/tests/summaries), Q-Chat Socratic tutor, memory score, confidence-based repetition, shared sets, streaks | Social/gamified/paywalled model; reviewers warn AI output must be checked against source. Shared sets/streaks are anti-features here. |
| Khanmigo | Socratic hints instead of answers, guiding questions, step-by-step nudges | Direct model for Danesh's progressive hints and "solutions not always revealed". |
| Scholarcy / Elicit | Structured summaries and key-claim extraction, per-paper tables, quotes tied to evidence | Model for evidence-linked extraction; both are summary-centric rather than curriculum-centric. |
| Mathpix / Docling / Marker / MinerU | Equation to LaTeX, table structure recovery (TableFormer), reading order, bounding-box provenance (page, backend), optional LLM pass, OCR fallbacks. Docling extracts from the text layer or OCR to avoid generating false content. Public benchmarks are vendor-reported and conflicting; no source found exposes per-element OCR confidence to end users | Defines DOC capability ceiling. Nobody surfaces per-block quality to learners; that is a Danesh differentiator. Engine choice is deferred to ADRs. |
| Speechify / ElevenReader | Natural voices, speed to 3x+, sentence/word highlight following playback, skip by paragraph, background playback, offline downloads, sleep timer | Sets the bar for playback UX. Cloud voices; Danesh must hit "useful" with local Persian voices. |
| LM Studio / Jan / AnythingLLM | One-click model catalog with sizes and compatibility hints, download progress, offline operation, workspaces with own docs/settings, workspace export/import (JSON), provider picker on first run | Sets the bar for model download UX. Their "bring any model, tweak parameters, run local server, plugins/MCP" ethos is deliberately NOT Danesh's. |

## Feature Landscape

### Table Stakes (Users Expect These)

#### DOC - Import and reconstruction

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| DOC-1 | Drag-drop and file-picker PDF import, multi-file queue, immutable original copy, hash + dedupe with clear "already imported" message | Every comparator does upload; dedupe prevents double processing of large books | L | Storage layer. Dedupe must offer "open existing" not just refuse. |
| DOC-2 | Visible import/job state: queued, running with stage names, progress, ETA-ish, cancel, pause, resume, retry; survives restart | Long jobs with no feedback read as hangs; brief already requires persistent jobs | M | Job state machine (TDD target). State available on demand, not as persistent technical chrome. |
| DOC-3 | Explicit statuses for damaged / encrypted / unsupported PDFs, with password prompt for encrypted files and a plain-language reason for failure | Users expect to be told why, and to be able to unlock | M | Password never persisted. Handle "owner-password only" PDFs that open but restrict copying: state policy openly. |
| DOC-4 | Structure extraction: headings, paragraphs, lists, code, tables, equations, figures, captions, footnotes, outline | Core promise; Docling/Marker/MinerU set the baseline | H | Each block: stable ID, type, provenance, quality status (per brief). |
| DOC-5 | Reading order and multi-column handling; headers/footers/page numbers removed and not mistaken for content | Basic correctness; the most common extraction complaint | H | Needs fixture suite. |
| DOC-6 | Selective OCR for scanned or undecodable regions | Scanned books are common; OCR is table stakes for "instructional PDFs" | H | Persian OCR quality is the risk (see PITFALLS). Rasterization stays internal. |
| DOC-7 | Per-block quality status (ok / low confidence / missing / unsupported) shown in the reader, with "show original region excerpt" | Brief requirement; also the product's trust contract | M | Quality status must come from real signals, not model self-report. |
| DOC-8 | Large-book handling without single-context LLM calls; memory-bounded; crash/OOM recovery that keeps verified output | A 600-page textbook is the median target, not the edge case | H | Chunked pipeline with checkpoints. |
| DOC-9 | Source library list with title, page count, import date, processing status, size on disk | Minimum library management | L | |
| DOC-10 (GAP) | Delete a source, with explicit explanation of what else is affected (concepts, lessons, citations, review items) and a confirm step | Every product lets users remove content; local-first users especially expect disk reclaim | M-H | Decision needed: what happens to review history of concepts that lose their only source. Recommend: keep history, mark concept "source removed", never silently erase. Also needs "reconcile after delete" path in KNOW. |
| DOC-11 (GAP) | Re-process a source with a newer extraction version (user-initiated), preserving progress by remapping block IDs where matched | Engines will improve; users with old low-quality extractions expect an upgrade path | H | Stable block ID continuity across extractor versions is hard. Needs an ADR before the model freezes. |
| DOC-12 (GAP) | Rename / edit metadata of a source (title, author) | Basic library hygiene; titles from PDFs are often garbage | L | |

#### READ - Semantic reader

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| READ-1 | Reflowable RTL reader with correct bidi for mixed Persian/English, LTR islands for code, math, URLs, identifiers | Brief requirement; Persian users see broken bidi as a defect immediately | H | Unicode isolates (FSI/PDI), explicit dir per block, ZWNJ preserved. |
| READ-2 | Typography controls: font family, size, line height, column width, light/dark/high-contrast themes | Reader (Readwise, Kindle-like) baseline; accessibility | L-M | Bundle an OFL Persian font (e.g. Vazirmatn-class) so first run is correct offline. |
| READ-3 | Math rendering (LaTeX/MathML) inside RTL flow, tables, code blocks with syntax highlighting, figures with captions, footnotes | Scientific content is in scope | M-H | Equation fallback: show original region excerpt when reconstruction low-confidence, labeled. |
| READ-4 | Table of concepts (primary) and original source outline (secondary) side navigation; collapsible | Brief requirement; every reader has a TOC | M | KNOW for concept view; DOC outline for source view. |
| READ-5 | Persistent reading position, "continue where you left off", jump-back after navigation | Universal | L | Position keyed on block ID, not scroll offset. |
| READ-6 | Selection actions: explain, translate, summarize-selection, ask, practice, copy with citation | Reader/RemNote/Readwise all have contextual selection menus | M | Depends on LESSON/LANG/MODEL. Menu must stay short. |
| READ-7 | Inspect source evidence: click a citation or block and see original excerpt, page number, provenance, quality status in a side panel | Citation-jump is table stakes for NotebookLM-class tools | M | Excerpt is extracted text/region crop, not a PDF page viewer. |
| READ-8 | Reading progress inferred from meaningful activity (dwell, scroll-through at plausible speed, interaction) with manual correction | Brief requirement | M | Strictly separate from learning evidence. |
| READ-9 (GAP) | Full-text search across all sources and generated content, Persian-normalization aware (ي/ی, ك/ک, ZWNJ, Persian vs Latin digits, diacritics) | Search is in Reader, NotebookLM, RemNote; absent from the brief. Without it a 600-page book is unnavigable | M | SQLite FTS-class index + a Persian normalizer shared with glossary matching. |
| READ-10 (GAP) | Keyboard shortcuts and a command palette for core navigation | Desktop-app expectation; also accessibility | L | |
| READ-11 (GAP) | Bilingual toggle per block or section: original text vs normalized Persian translation, side-by-side or flip | Immersive-translation readers do this; for learners it is the way to verify fidelity | M | Needs LANG block-aligned outputs. |

#### KNOW - Concept map / curriculum

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| KNOW-1 | Hierarchical curriculum list (topics, subtopics) with per-concept source coverage and links to source blocks | Brief requirement | H | Embeddings + LLM extraction; precision evals. |
| KNOW-2 | Prerequisite / corequisite hints shown contextually ("builds on X"), never as locks | Brief requirement; every adaptive tutor shows some ordering | H | Prerequisite precision needs reference-labeled evals. |
| KNOW-3 | "What next" recommendation based on coverage, prerequisites and demonstrated progress; user can always choose any topic | Brief requirement | M | LEARN evidence. |
| KNOW-4 | Adding a source updates concepts/relationships/lessons incrementally; no loss of reading history, assessments, review state | Brief requirement; also the failure that would destroy user trust | H | Stable concept IDs; merge/split migrations; stale flags. |
| KNOW-5 | Multi-source merge only with evidence of equivalence; show source attribution and preserve disagreements/alternative definitions | Brief requirement | H | Merge must be explainable ("merged because...") and reversible. |
| KNOW-6 (GAP) | Undo/split a wrong concept merge or rename a concept; user feedback on bad extraction ("this isn't a concept", "these are the same") | Any auto-organized system needs a correction path; users will hit bad merges | M | Corrections stored as overrides that survive re-synthesis. Keep out of "manual notebook" territory: corrections only, not authoring. |
| KNOW-7 | Missing-prerequisite gap mention in context, with no fabricated topic | Brief requirement | M | |

#### LESSON

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| LESSON-1 | On-demand lesson generation for a concept, with streaming display, cancel, and progress | Every AI tool streams; local models are slow so it matters more | M-H | MODEL. |
| LESSON-2 | Inline citations on claims linking to source blocks; unsupported sentences visibly labeled | NotebookLM baseline; brief requirement | H | Citation accuracy eval. Sentence-level attribution is the hard part. |
| LESSON-3 | Visual distinction between source-grounded text and labeled supplemental explanation | Brief requirement | M | Needs per-sentence provenance type in the lesson data model. |
| LESSON-4 | Cached lessons with version/provenance metadata; stale badge when source knowledge changes; regenerate on demand | Brief requirement | M | |
| LESSON-5 | Disagreement presentation: "Source A says..., Source B says..." with context | Brief requirement | M-H | KNOW-5. |
| LESSON-6 (GAP) | Regenerate / retry with feedback ("too long", "missing X") and keep the previous version recoverable | Users routinely re-roll AI output; losing a good lesson to a regenerate is a known annoyance | L-M | Version history, small retention policy. |
| LESSON-7 (GAP) | Report-a-problem on any generated sentence (wrong/unsupported) stored locally and fed into local eval corpus | Quizlet-class reviews flag need to verify AI output; gives a local feedback loop without telemetry | L | |

#### LANG - Translation, normalization, summarization

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| LANG-1 | Translate selection / section / whole source to Persian with block-aligned output and original always one click away | Translation tools baseline | H | Context-aware chunking, resumable. |
| LANG-2 | Domain glossary: auto-built EN-FA term table, consistent terms across sources, viewable and user-overridable (pin preferred Persian term) | DeepL/Google glossaries are table stakes for professional translation; consistency is the brief's normalization goal | M-H | Overrides propagate with staleness marking, not silent rewrite. |
| LANG-3 | Preserve code, math, identifiers, units, citations untranslated and correctly placed in RTL | Technical translation fails visibly here | M | READ-1 bidi rules. |
| LANG-4 | Job progress and resume for source-wide translation | Brief requirement | M | DOC-2 job engine. |
| LANG-5 | Summarization as separate, explicitly shorter output with coverage check ("these essential points were included; these omitted") | Brief requirement | H | Coverage check = extract essential points from source then verify presence. |
| LANG-6 | Translation fidelity status per block (checked / unchecked / flagged: number mismatch, missing sentence, added content) | Brief demands no invented facts; users of AI translation expect to be told when it may be wrong | H | Cheap deterministic checks first (numbers, code, length ratio, named entities), model checks second. |

#### AUDIO

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| AUDIO-1 | Play/pause/seek/speed (0.5x-3x, pitch-preserved), skip paragraph/section, resume position | Speechify/Reader baseline | M | |
| AUDIO-2 | Highlight of the currently spoken sentence in the reader, click a sentence to start from there | Speechify/ElevenReader/Reader baseline | M | Sentence-level chunking is easy; word-level needs alignment timestamps the TTS engine may not provide. Recommend sentence-level in v1. |
| AUDIO-3 | Chunked, streaming generation with look-ahead so playback starts quickly; audio cache keyed by text+voice+version with size indicator and clear-cache | Local TTS is slower than cloud; cache is the only way it feels instant on replay | M-H | Cache invalidated when translation changes. |
| AUDIO-4 | Voice picker with preview sample, size, language, CPU/GPU requirement, license note | LM Studio-style catalog expectation | M | MODEL registry. |
| AUDIO-5 | Pronunciation handling for mixed Persian/English technical terms, numbers, units, abbreviations; speak-able handling of equations/code/tables (skip, summarize, or read with a labeled strategy) | A natural voice that mispronounces every technical term fails the learner | H | Text normalizer before TTS; user-editable pronunciation lexicon is the escape hatch. Persian TTS ecosystem is thin (community Piper voices, gated XTTS fine-tunes; no authoritative quality benchmark found) so this needs real listening evals per voice. |
| AUDIO-6 | Honest quality labeling per voice (evaluated / experimental), never "natural" by language tag | Brief requirement | L | Ties to eval results. |
| AUDIO-7 (GAP) | Background playback / keep playing when window minimized; media-key support | Desktop audio expectation | L | |

#### LEARN

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| LEARN-1 | Short optional retrieval prompts per concept (free-response, cloze, application exercises) generated from grounded content, each with a source reference | NotebookLM/RemNote/Quizlet baseline, brief requirement | M-H | LESSON data. |
| LEARN-2 | Answer feedback that explains why wrong/right, with progressive hints (Khanmigo-style) before revealing solution; reveal is the learner's choice | Brief requirement; Khanmigo and NotebookLM both do explanation on wrong answers | M-H | Quality evals for answer-key correctness. |
| LEARN-3 | Review session that serves due items with a quick rating/grade, shows source on demand, and ends gracefully | Anki baseline | M | FSRS. |
| LEARN-4 | FSRS-class scheduling with sane defaults (retention ~0.90), no user tuning needed; optimizer only after enough reviews and hidden behind an advanced setting | Anki shows defaults beat early optimization (<~400 reviews) and that exposing retention knobs can explode workload | M | Use an existing FSRS implementation; TDD against reference vectors. |
| LEARN-5 | Three separate signals in UI: reading coverage, assessed understanding, predicted recall (shown as uncertain) | Brief requirement | M | Data model must never collapse them. |
| LEARN-6 | Concept indicator fades with predicted recall; non-color cue (shape/label/tooltip) accompanies fade | Brief requirement plus accessibility | M | Concept-level aggregation of item-level retrievability. |
| LEARN-7 | Review suggestions surfaced passively (e.g. "3 concepts are due"), soft per-session caps, no backlog guilt counter | Brief requirement; Anki's debt spiral is the counter-example | L-M | |
| LEARN-8 (GAP) | "Bad question" controls: flag wrong, suspend, replace; answer-key disputes | Anki users rely on suspend/delete; AI-generated questions will sometimes be wrong | L-M | |
| LEARN-9 (GAP) | Workload safeguard when changing scheduling settings (preview of review load, no mass reschedule by default) | Anki forum evidence of review explosion after changing retention | L-M | Only matters if settings are exposed; safest answer is to not expose in v1. |
| LEARN-10 | Manual progress correction kept separate from retrieval evidence | Brief requirement | L | Separate fields; never feed FSRS. |

#### MODEL

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| MODEL-1 | Hardware detection (OS, CPU, GPU, VRAM/unified memory, free disk, accelerators), translated into plain-language recommendation ("this machine can run X well") | LM Studio/Jan show compatibility hints | M-H | Detected vs verified: only claim support after a smoke-run on the machine. |
| MODEL-2 | Curated, versioned registry by role with sizes, licenses, and measured per-task quality notes | Brief requirement; differs from LM Studio's open catalog | M | Registry shipped with app and updatable only through explicit user action. |
| MODEL-3 | Guided download: progress, pause/resume, integrity check (hash), disk-space preflight, cancel, retry, resumable after restart | Large downloads fail often; LM Studio baseline | M | |
| MODEL-4 | Graceful OOM handling and degradation: load one heavy model at a time, unload on pressure, queue work, tell the user in plain language | Brief requirement; the top local-AI support complaint | H | Worker isolation. |
| MODEL-5 (GAP) | Storage manager: models, audio cache, sources, extraction artifacts, with sizes, and safe delete/reclaim | Local-first apps with multi-GB models need it | L-M | |
| MODEL-6 | Model switch never invalidates canonical source or progress; outputs carry model/version metadata; stale/re-run policy | Brief requirement | M | |
| MODEL-7 (GAP) | Offline install path for models (import a model bundle from disk) | Privacy/air-gapped users and users with poor connectivity expect side-loading | M | Compatible with "curated registry": import is verified against registry hashes, not arbitrary models. Particularly relevant for Persian-first users facing network/sanction access issues to model hosts. |

#### WEB

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| WEB-1 | Opt-in web research toggle (off by default), global and per-request | Privacy positioning | L-M | |
| WEB-2 | Before any query leaves the machine: show the exact query text and provider, require consent; never include private passages by default | Brief requirement | M | A "query preview" step is a key trust feature. |
| WEB-3 | Results shown as labeled online evidence with URL and retrieved/published date, visually distinct from PDF evidence | Brief requirement | M | |
| WEB-4 | Explicit "save to library" is the only path from web to knowledge map, and imports land as a separate, labeled source type | Brief requirement (no silent ingestion) | M | Note PDF-only import; saving a web snippet as a labeled reference is not a PDF import. Decision flag. |
| WEB-5 | Whole app fully functional offline when models are present; clear offline indicator when web research is unavailable | Brief requirement | L | |

#### UX / platform expectations

| ID | Feature | Why Expected | Complexity | Deps / Notes |
|---|---|---|---|---|
| UX-1 | First-run flow: welcome, hardware check, recommended models download (skippable/resumable), import first PDF, with a bundled tiny sample document so the reader can be seen before downloads finish | LM Studio/AnythingLLM walk users through provider/model; empty-state apps lose users | M | Don't expose model names or context sizes during study (brief); show them only in an on-demand "details" view. |
| UX-2 | Empty states, error states, and status messages written in Persian, actionable, no stack traces | Baseline | L-M | i18n framework from day one. |
| UX-3 (GAP) | Persian-first localization details: Persian/Latin digit preference, Jalali calendar for dates, ZWNJ/yeh/kaf correctness, Persian punctuation, RTL layout mirroring of the app chrome, English UI fallback | Persian-first is a product identity; users judge it on small details | M | READ-1 and READ-9 share the normalizer. |
| UX-4 | Accessibility: full keyboard navigation, visible focus, screen-reader semantics for reconstructed content (headings, tables, MathML), reduced motion, contrast themes; fade indicator never color-only | Brief requirement | M-H | Semantic HTML in reader from the start; retrofit is expensive. |
| UX-5 (GAP) | Settings page: language, theme, fonts, web research consent, storage, model management, diagnostics; sane defaults, advanced section collapsed | Every desktop app | L | |
| UX-6 (GAP) | Backup and restore of all user data (library, extraction artifacts, progress, review history) as a single local file; automatic pre-migration snapshot | Anki .colpkg precedent; local-first means the user's disk is the only copy; schema migrations are risky | M | Must include or reference original PDFs; document size implications. Strongly recommended P1. |
| UX-7 (GAP) | Export of learning data in open formats: review history (JSON/CSV), lessons and translations (Markdown/HTML with citations preserved), glossary | Data portability expectation for local-first; Reader exports to Obsidian/Notion | M | Not a notes workspace: export is outbound only. |
| UX-8 (GAP) | Local-only diagnostics: rotating logs, user-triggered "export diagnostic bundle" with redaction and a preview, crash recovery on next launch | Privacy-first products need supportability without telemetry | M | No automatic upload. |
| UX-9 (GAP) | Update mechanism: signed/notarized installers; update check opt-in and clearly disclosed, or manual download | Desktop table stakes; auto-update is a network call that must respect "no hidden transfers" | M | macOS notarization and Windows signing influence phase scheduling. |
| UX-10 (GAP) | Undo/confirm for destructive actions; safe deletion of generated content | Basic trust | L | |

### Differentiators (Competitive Advantage)

| ID | Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|---|
| D-1 | Faithful reconstruction with visible per-block quality status and provenance to original region; "never invent missing text/formulas/figures" enforced by design | No learning tool exposes extraction confidence; Docling-class tools are developer toolkits. This is the trust foundation of the Core Value | H | Quality status must be derived from verifiable signals; this is the product's moat. |
| D-2 | Canonical semantic document model with stable block IDs; everything downstream (citations, stale flags, incremental updates, re-extraction) hangs off it | Enables features competitors cannot do reliably (staleness, incremental curriculum update) | H | Foundation decision for the whole roadmap. |
| D-3 | Concept-first navigation with original outline kept as a separate view | NotebookLM is source-list based; Readwise is document based | M | |
| D-4 | Cross-source merge with preserved disagreements and attribution | Competitors merge silently or not at all | H | Highest precision risk; ship with explanation and undo (KNOW-6). |
| D-5 | Incremental curriculum update that preserves history and flags stale lessons | Competitors regenerate wholesale or treat sources as independent | H | |
| D-6 | Grounded vs supplemental labeling inside lessons | NotebookLM blends; Quizlet reviewers warn about invented content | M | |
| D-7 | Coordinated Persian translation + educational normalization with domain glossary and fidelity checks, offline | No offline product does Persian educational normalization; DeepL/Google are cloud and sentence-level | H | The glossary is the shared asset between LANG, AUDIO, search, and LEARN. |
| D-8 | Separate summarization with explicit coverage and omission reporting | Summarizers (Scholarcy, Quizlet) rarely report what they dropped | M-H | |
| D-9 | Local Persian/English TTS with evaluated technical-term pronunciation | Cloud TTS readers lack good Persian; local Persian voices are the open gap | H | Highest uncertainty in the whole product (voice availability/quality). |
| D-10 | Concept-level FSRS with three honest signals and a fading indicator | Anki is card-level and offers no concept view; Quizlet/Brainscape show opaque scores | M-H | |
| D-11 | Retrieval-only strengthening (no "mark learned") with Socratic hints | Aligns with learning science; NotebookLM quizzes don't feed scheduling | M | |
| D-12 | Hardware-aware, tested model registry with real per-task evals | LM Studio shows "fits memory", not "works well for this task" | M-H | The evals double as release gates. |
| D-13 | Privacy-by-construction: no account, no telemetry, query-preview consent for web research | NotebookLM/Quizlet/Khanmigo are cloud and account-bound | M | Marketable positioning; verify with network-egress tests in CI. |
| D-14 | Persistent resumable job engine across restarts | Competitors fail whole imports on crash | M-H | |
| D-15 | Optional "user pronunciation lexicon" and "pinned glossary terms" as the user's only authoring surface (corrections, not notes) | Gives the user control without creating a notes workspace | L-M | Keeps within Out of Scope while answering power users. |
| D-16 | Optional Anki (.apkg) export of generated questions with citations | Lets Anki users keep their existing habit and prevents lock-in | M | Candidate P3; reinforces portability story. |

### Anti-Features (Commonly Requested, Often Problematic)

Confirmed anti-features come from PROJECT.md Out of Scope. Additional ones are recommended and flagged as "proposed" for the requirements step to ratify.

| Anti-Feature | Source | Who has it / why requested | Why Danesh does not | Alternative |
|---|---|---|---|---|
| PDF viewer / page rendering as main experience | Confirmed | Readwise, NotebookLM source viewers, every reader | Product value is reconstructed semantic content | Source excerpt inspector with region crop (READ-7) |
| Non-PDF formats (EPUB/DOCX/HTML) | Confirmed | Reader, NotebookLM | Scope control; each format needs its own faithful reconstruction | Defer to v2 |
| Compulsory node-graph knowledge map | Confirmed | NotebookLM mind maps, RemNote graph | Calm, typography-first; graphs are demoware | Hierarchical list; optional graph is a later nicety |
| Manual study spaces, notebooks, goals, calendars | Confirmed | RemNote, AnythingLLM workspaces, Anki decks | User must not do organizing work | Auto organization, passive review suggestions |
| Fabricated topics/lessons for missing prerequisites | Confirmed | Generic AI tutors fill gaps | Violates source-grounding | Natural gap mention |
| Forced quiz gates | Confirmed | Quizlet/Duolingo-style progression | Optional practice only | Optional prompts |
| Numerical mastery score as ground truth | Confirmed | Quizlet memory score, Brainscape confidence | Dishonest precision | Three separate uncertain signals |
| "Mark as learned" strengthening recall | Confirmed | Most trackers | Decouples from retrieval | Only retrieval strengthens |
| Simplification as normalization | Confirmed | Reader "simplify", Quizlet summaries | Lowers academic level | Terminology/tone consistency only |
| Silent web ingestion | Confirmed | NotebookLM "discover sources" | Breaks provenance | Labeled online evidence, explicit save |
| Cloud, accounts, Docker, localhost AI servers, hidden transfers | Confirmed | NotebookLM, Quizlet; LM Studio/Jan/AnythingLLM expose localhost APIs | Privacy and simplicity | Embedded inference only |
| Mock/demo UI presented as functional | Confirmed | Early prototypes | Trust | Clearly labeled previews |
| Podcast-style Audio Overview, Video Overview, infographics, slide decks | Proposed | NotebookLM signature features | Generative re-narration invents and drops content, expensive locally, fidelity-hostile; not currently listed in Out of Scope, so ratify | Faithful read-aloud of lessons/translations (AUDIO) |
| Bulk "dump N flashcards from this PDF" | Proposed | RemNote, Quizlet Magic Notes | Floods learner with unvetted cards; Anki debt; conflicts with concept-level scheduling | On-demand, source-cited prompts per concept; flag/suspend bad ones |
| Bring-any-model / arbitrary GGUF import / sampling-parameter tuning / custom system prompts | Proposed | LM Studio, Jan, AnythingLLM | Breaks "tested registry" promise and exposes plumbing | Curated registry; verified offline bundle import (MODEL-7) |
| Cloud LLM API keys (OpenAI etc.) as an alternative backend | Proposed | Jan, AnythingLLM | Contradicts local-first/privacy | None; revisit only via explicit product decision |
| Plugin system, MCP server, public API, localhost endpoint | Proposed | AnythingLLM, Jan, Reader API | Security surface in Electron; scope | None in v1 |
| Open-ended general chat as the home screen | Proposed | NotebookLM, Khanmigo, Q-Chat | Brief: not a generic chat app; hallucination risk when ungrounded | Scoped, grounded Q&A inside the contextual panel with "not found in your sources" answer |
| Voice cloning | Proposed | ParsVoice-XTTS-class models support it | Consent/licensing risk, heavy, not needed for learning | Fixed curated voices |
| Social sharing, shared decks, leaderboards, streaks, XP | Proposed | Quizlet, Brainscape, Duolingo | Needs accounts/cloud; engagement metrics contradict "success is not time spent" | None |
| Usage analytics/telemetry | Proposed | Nearly all | Privacy | Local diagnostics export (UX-8) |
| Browser extension / web clipper | Proposed | Reader | PDF-only import | None |
| Mobile/tablet sync | Proposed | Reader, RemNote, Quizlet | No cloud/accounts; desktop only v1 | Backup/export file |
| Linux packaged distribution | Confirmed | | v1 scope | Revisit v2 |
| Free-form highlights and notes workspace | Proposed boundary | Reader, RemNote | Brief: not a note-taking workspace | Selection actions only; decide whether a lightweight "bookmark" is in scope (see decision flags) |
| Auto-update that phones home silently | Proposed | Electron default patterns | Violates "no hidden transfers" | Opt-in, disclosed update check |

## Feature Dependencies

```
DOC-1 import ──> DOC-2 job engine ──> DOC-4/5/6 extraction ──> D-2 canonical model (stable block IDs, provenance)
                                                                      │
        ┌─────────────────────────────┬──────────────────────────────┼───────────────────────────┐
        ▼                             ▼                              ▼                           ▼
   READ-1..7 reader            READ-9 search                 KNOW-1..5 concepts            LANG-1..6 translation
        │                                                           │                            │
        │                                                           ▼                            ▼
        │                                                    LESSON-1..5 (needs MODEL-1..4)  LANG-2 glossary ──> AUDIO-5 pronunciation
        │                                                           │                            │
        ▼                                                           ▼                            ▼
   READ-8 progress ──(separate from)──> LEARN-1..3 retrieval ──> LEARN-4 FSRS ──> LEARN-5/6 signals + fading indicator
                                                                      ▲
   MODEL-1..4 runtime/registry ───────────────────────────────────────┴──> AUDIO-1..6 (needs normalized text + voices)

WEB-1..5 (independent; needs MODEL tool use; touches LESSON labeling only)
UX-6 backup/restore ──requires──> versioned schemas + stable IDs (PLAT)
DOC-10 delete source ──requires──> KNOW-4 incremental update + LESSON-4 staleness
DOC-11 re-extraction ──requires──> stable block ID remapping (D-2)
READ-11 bilingual toggle ──requires──> LANG block-aligned outputs
AUDIO-2 sentence highlight ──requires──> sentence segmentation shared with READ and LANG
```

### Dependency Notes

- **Canonical model gates everything.** D-2 must be designed before reader, KNOW, and LESSON; block ID stability across re-extraction and merge/split is the riskiest early design decision.
- **Job engine (DOC-2) is shared infrastructure** for import, translation, synthesis, TTS pre-generation, and model downloads. Build once, generic.
- **MODEL manager precedes any AI feature** but extraction without AI (text-layer parse) can ship first, so the reader phase does not wait for models.
- **LANG glossary feeds AUDIO, search, and quizzes.** Build glossary before audio so pronunciation lexicons and terminology stay consistent.
- **LEARN depends on LESSON content and citations**, not on KNOW directly beyond concept IDs.
- **Search normalizer, bidi rules, and sentence segmentation are shared utilities**; implement once in the reader foundation phase.
- **Backup/export depends on schema discipline** (PLAT); add the pre-migration snapshot in the same phase as the first migration, not later.
- **Conflicts:** podcast-style audio overview vs faithful read-aloud (reject the former); manual progress correction vs FSRS evidence (keep fields separate); user glossary overrides vs automatic normalization (overrides win but trigger stale marking).

## MVP Definition

Note: PROJECT.md states every capability area is required for v1. "MVP" here means the vertical slice ordering to validate the Core Value early, not scope cuts.

### Launch With (earliest vertical slice, validates trust in reconstruction)

- [ ] DOC-1..9 with text-layer PDFs, quality statuses, resumable jobs — nothing downstream matters if reconstruction is not trusted
- [ ] READ-1..5, READ-7, READ-9 — correct Persian/mixed bidi, source excerpt inspector, search
- [ ] UX-1, UX-5, UX-6 (backup basic), UX-8 (local diagnostics) — the GAP items cheapest to add early and expensive to retrofit

### Full v1 (all brief areas, ordered by dependency)

- [ ] MODEL-1..6 then KNOW-1..7, LESSON-1..7 — the grounded-curriculum core
- [ ] LANG-1..6 with glossary — before AUDIO
- [ ] AUDIO-1..7 — after glossary and normalized text
- [ ] LEARN-1..10 — after lessons and citations exist
- [ ] WEB-1..5 — independent, late
- [ ] DOC-10, DOC-11, UX-7, UX-9, UX-10 — hardening phase, but design hooks earlier

### Add After Validation (v1.x)

- [ ] D-16 Anki export — once real users ask for portability
- [ ] Optional visual concept graph (secondary, not primary) — if learners request it
- [ ] Word-level audio highlight — if a chosen voice engine provides alignments
- [ ] KNOW-6 manual merge/split UI beyond basic undo — after seeing real merge errors

### Future Consideration (v2+)

- [ ] Non-PDF formats, Linux, mobile companion, optional encrypted sync — need product decisions that conflict with current scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DOC-1..9 import, jobs, extraction statuses | HIGH | HIGH | P1 |
| D-2 canonical model | HIGH | HIGH | P1 |
| READ-1 bidi/RTL correctness | HIGH | HIGH | P1 |
| READ-7 source evidence inspector | HIGH | MEDIUM | P1 |
| READ-9 Persian-aware search (GAP) | HIGH | MEDIUM | P1 |
| UX-6 backup/restore (GAP) | HIGH | MEDIUM | P1 |
| UX-1 first-run + model setup | HIGH | MEDIUM | P1 |
| MODEL-3/4 downloads, OOM handling | HIGH | HIGH | P1 |
| KNOW-1..5 curriculum + merge | HIGH | HIGH | P1 |
| LESSON-2/3 citations + grounded labeling | HIGH | HIGH | P1 |
| LANG-2 glossary + LANG-6 fidelity checks | HIGH | HIGH | P1 |
| LEARN-1..6 retrieval, hints, FSRS, signals | HIGH | MEDIUM-HIGH | P1 |
| AUDIO-1..6 | HIGH (brief says v1) | HIGH | P1 (with quality-gate risk) |
| DOC-10 delete source (GAP) | MEDIUM-HIGH | MEDIUM-HIGH | P1/P2 (hooks P1, full flow P2) |
| DOC-11 re-extraction with ID remap (GAP) | MEDIUM | HIGH | P2 |
| READ-11 bilingual toggle (GAP) | MEDIUM-HIGH | MEDIUM | P2 |
| UX-7 export of learning data (GAP) | MEDIUM | MEDIUM | P2 |
| UX-9 signed/notarized installers + opt-in update (GAP) | MEDIUM-HIGH | MEDIUM | P1 for signing, P2 for update check |
| MODEL-7 offline model bundle import (GAP) | MEDIUM | MEDIUM | P2 |
| LEARN-8 bad-question controls (GAP) | MEDIUM | LOW-MEDIUM | P2 |
| WEB-1..5 | MEDIUM | MEDIUM | P2 (late phase per brief) |
| D-16 Anki export | LOW-MEDIUM | MEDIUM | P3 |
| Highlights / bookmarks | LOW-MEDIUM | LOW | P3, needs scope decision |

**Priority key:** P1 must have for v1 launch; P2 should have, add when possible; P3 nice to have.

## Competitor Feature Analysis

| Feature | NotebookLM | Readwise Reader | RemNote / Anki | LM Studio / AnythingLLM | Danesh approach |
|---------|-----------|-----------------|----------------|-------------------------|-----------------|
| Source grounding | Inline citations to passages | Highlights only, no grounding on AI | AI tutor references notes/PDF | RAG with citations (AnythingLLM) | Citations to block IDs with original excerpt and quality status; grounded vs supplemental labeled |
| Practice | Quizzes/flashcards from sources, explanations | None | AI cards, SM-2/FSRS | None | Concept-level retrieval, hints, FSRS, three signals |
| Document structure | Treats docs as text chunks | Reflowable article view | PDF view + extracts | Chunked embeddings | Canonical semantic model, concept curriculum |
| Audio | Podcast overview | TTS narration | None | None | Faithful local TTS of lessons/translations |
| Translation | Output language setting | None dedicated | None | Via prompt only | Normalized Persian pipeline with glossary and fidelity checks |
| Offline/private | No | Partial offline, cloud account | RemNote cloud; Anki local | Yes | Fully local; web research opt-in with query preview |
| Export/backup | Limited | Via Readwise integrations | .colpkg / .apkg (Anki) | Workspace JSON export (AnythingLLM, single third-party source) | Single-file backup + open-format export |
| Model management | n/a | n/a | n/a | Open catalog, user picks | Curated tested registry by role; hardware-aware |
| Onboarding | Sign in, upload | Sign in, import | Account, import | Provider/model picker first-run | Hardware check, recommended models, sample doc |

## Decision Flags for the Requirements Step

1. **GAP table stakes to include:** UX-6 backup/restore, READ-9 search, DOC-10 delete source, UX-1 first-run, UX-5 settings, MODEL-5 storage manager, UX-8 local diagnostics, UX-9 signing/notarization, UX-3 Persian localization specifics. Recommend all as v1.
2. **Grounded Q&A:** every comparator has chat-with-sources. Recommend scoped Q&A in the contextual panel (selection/concept/lesson scope, citations, "not in your sources" answer) and NOT a global chat home. Needs explicit confirmation since the brief says "not a generic chat app" but also lists contextual assistance.
3. **Highlights/bookmarks:** Reader and RemNote treat them as table stakes; the brief excludes a notes workspace. Decide if a minimal bookmark/highlight (no notes) is allowed.
4. **Self-graded recall in FSRS:** decide whether "I remembered" self-ratings count as retrieval evidence (Anki-style) or only system-assessed responses do. Recommend counting self-ratings with a distinct evidence type, weighted conservatively.
5. **Audio Overview style outputs:** not in Out of Scope; recommend adding to Out of Scope as anti-feature.
6. **Web snippet saving vs PDF-only import:** WEB-4 implies a non-PDF "reference" source type; decide if allowed in v1.
7. **User-editable extraction text** (fix a mangled block): not in brief. Recommend corrections as versioned overlays, deferred unless D-1 quality status proves insufficient.
8. **Update check:** opt-in only, or manual downloads only.

## Sources

- NotebookLM capabilities (Audio/Video Overviews, mind maps, flashcards, quizzes with wrong-answer explanations, Guided Learning, daily limits): Google Education NotebookLM page and secondary articles via web search, MEDIUM
- Readwise Reader (highlights, Ghostreader, TTS, full-text search, offline, API, export via Readwise): readwise.io pages and app store listings via web search, MEDIUM (some copy dated)
- RemNote PDF-to-flashcards and AI tutor: remnote.com feature pages via web search, MEDIUM (vendor claims)
- Khanmigo Socratic hint behavior and limitations: review/summary pages via web search, MEDIUM
- Quizlet Magic Notes / Q-Chat and reviewer cautions: educator/review sites via web search, MEDIUM-LOW (partially 2023-era)
- Anki FSRS (desired retention default 0.90, optimizer threshold, workload spike story, .colpkg/.apkg): Anki manual/FAQ pointers and forum.ankiweb.net threads via web search, MEDIUM-HIGH for mechanics, MEDIUM for numbers
- Docling / Marker / MinerU comparison (provenance, TableFormer, OCR options, vendor-reported benchmarks): Docling arXiv paper 2501.17887 and comparison blogs, MEDIUM (benchmarks vendor-reported, treat as directional; no source confirmed per-element OCR confidence)
- LM Studio / Jan / AnythingLLM onboarding, workspaces, export: tutorials and aggregator pages via web search, LOW-MEDIUM (export detail is single third-party source)
- Persian TTS landscape (community Piper voices such as fa_IR-amir-medium, ParsVoice XTTS fine-tune with gated access, NAACL 2025 note on lack of high-quality open systems): replicate/huggingface/arXiv 2510.10774 pages via web search, LOW-MEDIUM; no head-to-head quality benchmark found, so AUDIO needs hands-on listening evaluation
- Persian typography/search/OCR specifics (ZWNJ, yeh/kaf normalization, digit variants, broken text layers in Persian PDFs, Jalali dates): domain knowledge, not re-verified in this session, LOW-MEDIUM; flag for phase-level research
- PROJECT.md (D:/workspace/AI/danesh/.planning/PROJECT.md): confirmed intent and Out of Scope, HIGH

---
*Feature research for: local-first Persian-first AI desktop learning environment*
*Researched: 2026-10-09*
