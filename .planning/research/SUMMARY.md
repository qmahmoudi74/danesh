# Project Research Summary

**Project:** Danesh
**Domain:** Local-first, Persian-first (RTL) desktop learning environment. Turns instructional PDFs into faithfully reconstructed, source-grounded concepts, lessons, translations, audio and spaced-repetition practice. Electron + React + TypeScript, Windows and macOS, no Python, no localhost AI servers, no cloud.
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall. App shell, storage, UI and test tooling are HIGH. Engine layers (Persian PDF parsing, OCR, inference runtime and VLM, embeddings, TTS, models) are MEDIUM-LOW by design: no public Persian head-to-head evidence exists, so these are shortlists to be settled by spikes.

## Executive Summary

Danesh is a learning tool whose value depends on trust in its content, not on generation quality. Comparable products (NotebookLM, Readwise Reader, RemNote, Anki with FSRS, Khanmigo) converge on source-grounded answers with citations, concept-level organization, and spaced retrieval. None combines faithful reconstruction of Persian/English technical PDFs, per-block quality status, offline operation, and evidence-separated learning signals. That combination is the differentiator, and it is also why the risk sits in the document pipeline and the engines.

Recommended approach: a modular monolith with a strict process topology. A thin Electron Main supervises. A sandboxed React renderer talks only through a typed, validated RPC contract. One long-lived Core utilityProcess owns domain logic, is the single SQLite writer, and runs a durable job kernel where every expensive step is an idempotent task that commits output and "done" state in one transaction. Heavy engines (PDF, OCR/layout, LLM, embeddings, TTS, egress broker) run as disposable Engine Host processes that are pure compute and never touch the database. Data splits into immutable evidence, versioned derived artifacts with producer snapshots and input fingerprints, and rebuildable indexes. A model switch can only change a role binding and mark artifacts superseded. Stack: Electron 44, React 19, TypeScript 6.0.x, Vite 7, better-sqlite3 13 (or node:sqlite behind an adapter), Kysely with hand-written migrations, zod contracts. Engines sit behind typed adapters chosen by spike: pdf.js as permissive default parser, PP-DocLayoutV3 and PP-OCR-class models via ONNX Runtime, node-llama-cpp for text and embeddings, bge-m3 as the Persian-evidenced embedding candidate, sherpa-onnx or own ORT VITS runner for TTS, ts-fsrs for scheduling.

Key risks are concentrated and knowable early. (1) Licensing: the repo has no license; MuPDF is AGPL, espeak-ng is GPL (pulled in by sherpa-onnx phonemization), and most Persian voices are non-commercial or of unverified provenance. These product decisions gate the PDF and audio phases. (2) Persian text is hostile to extraction: visual-order output, presentation forms, missing ToUnicode and ZWNJ ambiguity break every extractor differently, so the canonical model keeps raw glyph evidence and a versioned normalization module, and no downstream stage treats one extractor's output as truth. (3) The brief's order puts the riskiest unknowns late (native packaging, Persian TTS naturalness, Persian OCR, LLM runtime with vision, Persian translation quality). Run their spikes as an early parallel track, and build the durable job kernel, crash-injection harness, fixture suite and eval harness before PDF features. Mitigation throughout: verified-or-labeled outputs, mechanical checks (segment completeness, protected spans, number equality, citation substring checks), packaged-app smoke tests on clean Windows and macOS machines, and honest "untested" reporting.

## Key Findings

### Recommended Stack

App shell, persistence and UI are settled (versions checked against npm registry 2026-10-09). Engine layers are shortlists with spike gates. Two cross-cutting decisions must precede engine ADRs: D-LICENSE (Danesh's own license) and D-COMMERCIAL (commercial vs free/non-commercial). Default: commercial-safe permissive engines and voices only.

Core technologies (HIGH unless marked):
- Electron 44.7.0: shell; requires macOS 13+; no win32-ia32. MIT.
- React 19.3.0 + TypeScript 6.0.x (pin; not 7.x): TS 7 has no stable programmatic API until 7.1 and breaks typescript-eslint (MEDIUM; peer ranges verified).
- Vite 7.3.x + electron-vite 5.0.0 + @vitejs/plugin-react 5.2.0: Vite 8 only via electron-vite 6 beta.
- electron-builder 26.x (pin, e.g. 26.17.0): NSIS/MSI, DMG, signing/notarization hooks, asarUnpack. Not 27 alpha.
- @electron/fuses 2.1.3, @electron/notarize 3.1.2.
- better-sqlite3 13.0.3 (N-API, SQLite 3.53.4, FTS5, backup API) behind a Db adapter; node:sqlite (Stability 1.2 RC in Node 24) is the zero-native-dependency alternative to revisit when stable.
- Kysely 0.29.6 with hand-written forward-only numbered SQL migrations and PRAGMA user_version (MEDIUM, judgement call).
- pdfjs-dist 6.4.299 (Apache-2.0): default parser candidate with @napi-rs/canvas. Known RTL weaknesses (ToUnicode content-stream order, ActualText ignored, mirrored brackets) reported indirectly (MEDIUM-LOW).
- bidi-js 1.1.0: UAX #9 in TS, applied after evidence-based direction detection.
- zod 4.6.5: shared contracts package; validate every IPC payload in Main and Core and worker RPC.
- ts-fsrs 5.4.2 (FSRS-6, MIT): wrapped in domain/learning; default parameters in v1; optimizer deferred.
- Tailwind 4.3.3 (logical properties only), React Aria Components 1.22.0, i18next 26.4.2, @fontsource-variable/vazirmatn 5.3.0 (OFL-1.1, bundled), KaTeX 0.19.0 (MathJax 4.1.3 on demand), Shiki 4.5.0.

Engine candidates (MEDIUM-LOW; spike-decided):
- OCR: tesseract.js 7.0.0 (fas+eng, tessdata_best) as cheap baseline; PP-OCRv5 Arabic-script recognizer via onnxruntime-node (covers Persian); PaddleOCR-VL-1.5 via llama.cpp for tables/formulas (heavier, ~1.2 GB per one guide). Self-reported Tesseract fas_print figures (1.19% CER on 750 lines) are LOW-MEDIUM, used only as a baseline.
- Layout: PP-DocLayoutV3 (regions plus reading order, Apache-2.0 upstream; ONNX export license unconfirmed; RTL order unknown).
- LLM runtime: node-llama-cpp 3.22.1 (MIT; prebuilt N-API for win-x64 CPU/Vulkan/CUDA, win-arm64 CPU, mac-arm64 Metal, mac-x64 CPU). NO vision/mmproj support (issues #88, #562), so VLM OCR needs a second binding. @fugood/llama.node 1.7.15 is the only Node binding found with image input; small community; no documented Electron packaging. Prefer one binding if spike reaches parity; else node-llama-cpp (text/embeddings) + llama.node (VLM), each in its own utility process.
- Models (quality NOT established; every row needs Persian eval): Gemma 4 (Apache-2.0; E2B/E4B/12B/26B-A4B; multimodal; Persian not named in published claims); TranslateGemma (Gemma Terms of Use, gated, 2K context, en->fa_IR in WMT24++ but no Persian score found); Qwen3.5/3.6 (Apache-2.0, no Persian numbers). Hardware tiers are hypotheses: 8 GB to E2B/E4B Q4; 16 GB to 12B Q4_K_M; 24 GB+ to larger MoE/dense.
- Embeddings: bge-m3 (MIT; FaMTEB overall 59.1, retrieval 43.4, STS 76.4; 1024-d) default candidate. Qwen3-Embedding-0.6B (Apache-2.0) challenger. EmbeddingGemma 2 (released 2026-10-06) too new. jina-embeddings-v3 excluded pending license check.
- TTS runtime: sherpa-onnx-node 1.13.8 (Apache-2.0; no Windows arm64 package; pin 1.13.x since 2.0 plans to remove espeak-ng; ships Persian NeMo CTC ASR usable for round-trip checks). Fallback: own onnxruntime-node VITS runner with own G2P.
- TTS voices: Mana-Persian-Piper (MIT model, CC0 training data, single speaker, 44.1 kHz) is primary license-clean Persian candidate; listening quality unpublished. rhasspy fa_IR voices need consent/provenance review. pocket-tts-farsi-v2 has best measured Persian WER/UTMOS so far but CC-BY-NC-4.0 (blocks commercial use). Exclude gyro (described as derived from Edge "Farid"), ParsVoice-XTTS (CPML, PyTorch), MMS-TTS fas (CC-BY-NC, unverified). Kokoro-82M (Apache-2.0) English default candidate (no Persian).
- Persian front-end (own TS): digit/date/unit normalization (@persian-tools/persian-tools 4.0.4, MIT, wrapped and tested), script-span segmentation, G2P adapter (ezafe is main limiter). Do NOT use arabic-reshaper (GPL-3.0).

Process primitives: utilityProcess.fork() per heavy engine; MessageChannelMain and process.parentPort for RPC; worker_threads/Piscina for pure-JS CPU work in Core; never localhost HTTP servers (Ollama, LM Studio, llama-server), never WebLLM in renderer.

Constraints: Electron 44 needs macOS 13+. better-sqlite3 13 and node-llama-cpp are N-API. sqlite-vec 0.1.9 has no Windows arm64 package. Each OS built and smoke-tested on its own runner (no cross-packaging for node-llama-cpp). Never load two ONNX Runtimes in one process. Recommended support statement: Windows 11 x64 and macOS 13+ Apple Silicon verified; Intel Mac and Windows arm64 untested/best-effort. Scope decision for product review.

### Expected Features

Table stakes (brief-covered):
- Import and reconstruction (DOC-1..9): drag-drop import, hash dedupe with "open existing"; visible resumable job state (cancel, pause, retry); explicit encrypted/damaged/unsupported statuses; structure extraction (headings, paragraphs, lists, code, tables, equations, figures, captions, footnotes, outline); reading order and furniture handling; selective OCR; per-block quality status (ok, low confidence, missing, unsupported) from real signals; memory-bounded chunked processing; source library list.
- Semantic reader (READ-1..8): reflowable RTL reader, correct mixed bidi, LTR islands; typography controls; math/tables/code/figures in flow; concept navigation plus secondary source outline; position keyed on block ID; selection actions; source-evidence inspector.
- Knowledge map (KNOW-1..7): hierarchical curriculum list with coverage; prerequisite hints that never lock; "what next"; incremental source addition without history loss; evidence-backed reversible merges with preserved disagreements; missing-prerequisite mention with no fabricated topic.
- Lessons (LESSON-1..7): streamed, cancellable generation; inline citations to source blocks, unsupported sentences labeled; grounded vs supplemental labeling; cached versions with stale badges; disagreement presentation; regenerate with prior version kept.
- Language (LANG-1..6): block-aligned Persian translation with original one click away; domain glossary (viewable, pinnable); code/math/identifiers/units preserved; resumable source-wide jobs; separate summarization with coverage/omission report; per-block fidelity status from deterministic checks first.
- Audio (AUDIO-1..6): play/pause/seek/speed; sentence highlight; chunked streaming with composite-keyed cache; voice picker with license and resource notes; pronunciation handling for mixed terms, numbers, symbols; honest per-voice quality labels.
- Learning (LEARN-1..10): optional retrieval prompts with source refs; feedback with progressive hints; passive review suggestions with soft caps; FSRS defaults (retention ~0.90), no user tuning; three separate signals (coverage, assessed understanding, predicted recall shown as uncertain); fading indicator with non-color cue; manual correction separate from FSRS evidence.
- Models (MODEL-1..6): hardware detection with plain-language recommendation; curated versioned tested registry by role; resumable guided download with hash verification and disk preflight; graceful OOM handling, one heavy model at a time; model switch never invalidates sources or progress.
- Web (WEB-1..5): off by default; exact query preview and consent per send; labeled online evidence with URL and date; explicit save as separate labeled source type; full offline operation with models present.

GAP table stakes not in the brief (recommend all as v1; requirements step to ratify):
- DOC-10 delete source with impact preview and confirm (keep history; mark concepts "source removed").
- DOC-11 re-process with newer extraction version, preserving IDs by remapping.
- DOC-12 rename/edit source metadata.
- READ-9 Persian-aware full-text search (ي/ی, ك/ک, ZWNJ, Persian vs Latin digits, diacritics). Without it a 600-page book is unnavigable.
- READ-10 keyboard shortcuts and command palette. READ-11 bilingual per-block toggle.
- KNOW-6 undo/split wrong merge; "this is not a concept" feedback.
- LESSON-6 regenerate with feedback keeping prior version; LESSON-7 local report-a-problem.
- LEARN-8 bad-question controls (flag, suspend, replace); LEARN-9 workload safeguard (recommend not exposing scheduling settings in v1).
- MODEL-5 storage manager; MODEL-7 offline model-bundle import verified against registry hashes.
- UX-1 first-run flow with hardware check, skippable model download, bundled tiny sample PDF.
- UX-3 Persian localization details (digit preference, Jalali dates, Persian punctuation, RTL chrome, English UI fallback).
- UX-5 settings. UX-6 backup/restore single file with automatic pre-migration snapshot (strongly recommended P1). UX-7 open-format export. UX-8 local-only diagnostics bundle with redaction and preview. UX-9 signed/notarized installers; opt-in update check. UX-10 confirm/undo for destructive actions.

Differentiators: faithful reconstruction with visible per-block quality and provenance (D-1); canonical model with stable block IDs (D-2); concept-first navigation with separate source outline (D-3); cross-source merge with preserved disagreements (D-4); incremental curriculum update flagging stale lessons (D-5); grounded vs supplemental labeling (D-6); separate summarization with omission reporting (D-8); offline Persian normalization with glossary and fidelity checks (D-7); local Persian/English TTS with evaluated technical-term pronunciation (D-9, highest uncertainty); concept-level FSRS with three honest signals (D-10); retrieval-only strengthening with Socratic hints (D-11); hardware-aware registry with real evals (D-12); privacy by construction verified by egress tests (D-13); persistent resumable job engine (D-14).

Anti-features confirmed in PROJECT.md Out of Scope: PDF viewer as main experience; non-PDF import; compulsory node graph; manual notebooks/goals/calendars; fabricated prerequisite topics; forced quiz gates; numerical mastery score; "mark as learned"; simplification as normalization; silent web ingestion; cloud/accounts/Docker/localhost AI servers/hidden transfers; Linux distribution; mock UI presented as functional.

Proposed anti-features (recommend ratifying into Out of Scope): Audio Overview, Video Overview, infographics, slide decks (generative re-narration invents and drops content); bulk "dump N flashcards from this PDF"; bring-any-model/arbitrary GGUF/sampling tuning/custom system prompts; cloud LLM API keys as backend; plugin system, MCP server, public API, localhost endpoint; open-ended general chat as home screen (use scoped grounded Q&A in contextual panel instead); voice cloning; social sharing/streaks/leaderboards; usage telemetry; browser clipper; mobile sync; silent auto-update.

### Architecture Approach

Four-tier process topology: Main (supervisor and security policy, no domain logic, no DB); Renderer (sandboxed presentation only); Core (utilityProcess: RPC server, domain services, job scheduler and governor, the only DB writer, migrations, consent gate, blob store); Engine Hosts (PDF, OCR/layout, LLM, embeddings, TTS, plus Egress Broker as the only outbound network process). Engines never receive a DB handle; they return results and Core persists. Storage: danesh.db (WAL; evidence, artifacts, learning, jobs), index.db (embeddings, FTS5; rebuildable), content-addressed blobs/ and backups/, models held separately.

Monorepo, dependency direction enforced by lint: contracts (zod, no deps) at root; domain (pure, I/O-free: block model and alignment, job FSM, provenance/staleness, concept merge rules, coverage, FSRS wrapper, privacy policy); storage; engine-api (adapter interfaces plus conformance suites); engines/* (one package per implementation); pipelines; models (registry, asset store, snapshots, hardware probe, evals); eval plus fixtures. Renderer never imports storage or engines; pipelines never import apps.

Major components:
1. Main: window lifecycle, CSP/permission handlers, spawn/restart Core and hosts, broker MessagePorts once, native dialogs. Stays idle.
2. Preload: closed typed method map (call, subscribe); holds Core port privately; no generic send.
3. Core: composition root; zod re-validation; job scheduler with resource classes and model-affinity batching; sole SQLite writer; migration runner; consent gate.
4. Engine Hosts: stateless adapters with init, run (AbortSignal, progress events), dispose; crash-isolated; restart with backoff; page failing twice is quarantined.
5. Egress Broker: only process opening outbound connections; consent-granted requests and allowlisted model downloads; audit-logged.
6. Storage layer: typed repositories, forward-only SQL migrations, pre-migration backup (VACUUM INTO or backup API), CAS blob store with atomic writes.
7. Eval harness: runs engines and pipelines against fixtures, records baselines and pass/fail; not shipped, built early.

Key patterns:
- Durable task with transactional output: blobs written first (idempotent by hash); output rows and task "done" commit in one transaction. Retry never redoes done tasks.
- Job FSM (queued, running, paused, blocked, failed, cancelled, completed, completed_with_issues) as pure table-driven domain module. completed_with_issues is first-class (gap blocks carry reasons).
- Two-stage reconstruction: Stage A (engine-bound per-page evidence: glyph runs with boxes/fonts, OCR lines and confidences, layout regions, crops); Stage B (deterministic whole-document assembly: reading order, bidi repair, joins, footnotes, outline, quality). Improving assembly never requires re-parse or re-OCR.
- Stable block identity: block_id ULID minted once, never reused; block_version holds per-run content; re-extraction alignment (exact content hash; then page-local bbox IoU and text similarity; then monotonic order constraint); matched keep IDs; unmatched old retired, never deleted; splits/merges in block_lineage; candidate run promoted only if quality comparison passes, via single-transaction pointer swap.
- Fingerprint and producer snapshot on every derived artifact; four-state staleness (fresh, enrichable, stale, superseded_producer); model switch can only produce superseded_producer. Lessons section-granular.
- Three learning signals in three tables, no shared score column; review_log append-only, created only by successful assessed attempt; card_state rebuildable cache; schedule recall items not concepts; concept recall aggregate via lineage.
- Grounded vs supplemental in schema: grounded segment requires at least one verifier-confirmed source_block citation; web citations never satisfy it; model selects block IDs from closed set, code resolves quotes.
- Privacy: renderer CSP connect-src 'none'; Electron session filters do not govern Node sockets in utility processes, so guarantee is lint-enforced (no network imports outside broker), tested (full scenario with network blocked), optionally hardened per OS after spike.

Scaling (library size on one machine): ~2k pages: flat vector scan and single worker suffice. ~20k pages (~100k chunks): paginated block APIs mandatory, quantized vectors may be needed. 200+ books: evaluate sqlite-vec or ANN behind VectorIndex. First bottleneck is LLM throughput and model swaps, not storage.

### Critical Pitfalls

1. Trusting the PDF text layer for Persian/Arabic-script text (P1). Visual-order output, presentation forms, bad/missing ToUnicode, mirrored brackets, lam-alef reversal, ZWNJ loss, kashida produce plausible wrong text. Prevention: keep raw_text and normalized_text separately; per-document/per-font text-layer health detector; normalization as pure, versioned, TDD'd pipeline (presentation-form mapping limited to Arabic blocks, bracket un-mirroring, direction by evidence per run, yeh/kaf fold, digit policy, tatweel strip, flagged ZWNJ restoration); route unhealthy regions to OCR; never a global RTL flag.
2. OCR-vs-embedded-text decision wrong (P2). Poor prior OCR layers trusted; dot-confusable letters substituted with high confidence; whole-document OCR "to be safe". Prevention: per-region decision from health score plus ink-vs-text coverage; keep both texts, mark conflict on material disagreement; labeled Persian OCR benchmark (clean, 150/300 DPI, diacritics, mixed digits, bad scans) measuring word error and dot-confusable substitution rate before engine choice; lexicon checks flag, never silently rewrite.
3. Silent omission/fabrication of formulas, tables, figures (P3). Formula models emit plausible wrong LaTeX; tables lose spans or RTL column order; unmatched regions vanish silently. Prevention: per-page coverage accounting (extracted + missing + furniture must cover all ink/text); formulas stored as crop plus candidate LaTeX with unverified|verified status, verified by re-render and self-consistency, below threshold show crop; tables as cell grids with spans, confidence, crop, explicit column direction; figures as assets with caption links.
4. Native packaging and process crashes (P8, P9, P10). ABI mismatch; native binaries inside asar; node-llama-cpp source-build fallback needing compiler/network at first run; unsigned nested binaries failing notarization; GPU claims inferred; OOM as process kill. Prevention: Phase 1 packaged smoke test on clean Windows and macOS that loads a native binding and tiny GGUF in a utility process, runs one OCR image and one TTS sentence, opens SQLite, including Persian-named Windows profile and spaced path; NODE_LLAMA_CPP_SKIP_DOWNLOAD; codesign --verify --deep --strict in packaging test; probe-load per backend with CPU fallback; resource broker with one heavy model resident.
5. Durable jobs and migrations losing verified output (P11, P12). Non-idempotent steps duplicate blocks or overwrite verified output; running jobs stuck after crash; SQLite opened from several processes; migrations without backup; position-based IDs. Prevention: kill -9 crash-injection suite from day the job kernel exists; idempotent tasks with output and state in one transaction; boot recovery pass; pre-migration backup; refuse newer schemas; golden DB files from every released schema tested forward on Windows and macOS; ULID block IDs with alignment and alias table.

Also critical: knowledge-graph over-merging and unstable concept IDs (P13: conservative merge with evidence, reversible splits, typed acyclic prerequisites, deterministic ordering, integrity tests); fake mastery and FSRS misuse (P14: no path from "mark as known" or reading to stability; immutable review log; default parameters; hint-aware ratings); silent LLM omission and normalization drift (P5: segment-ID-keyed outputs, protected spans, number/identifier equality, two-stage translate then constrained normalize with diff gate); citation fabrication (P6: model never writes citation strings; exact-substring quote checks); prompt injection in PDFs and web text (P20, P23: data delimiters, no tool calls from document content, closed tool schemas, injection fixtures); licensing traps (P21: license matrix per engine/model/voice/dataset as acceptance criterion); Persian TTS quality and licensing (P16: speech front-end separate from display normalization; scripted listening protocol; composite cache key).

"Looks done but isn't" checks: PDF import without coverage accounting; Persian extraction tested only on Word PDFs; search without yeh/kaf/digit/ZWNJ folding; reader without bidi isolation (RTL torture page in unit and screenshot tests); selection offsets breaking after normalization; citations as free text; re-runs changing concept IDs; zero-egress claims never tested; licenses checked only for code deps.

## Implications for Roadmap

The brief's 11-phase order is a reasonable skeleton but needs three structural changes: (1) pull job kernel, storage kernel and packaging smoke test into foundation; (2) start fixture suite, eval harness and engine spikes early as a parallel track; (3) split the model manager so asset storage arrives before OCR and hardware probing/evals arrive before LLM use. The list below has 13 phases; PROJECT.md's decision says 8-12. Phase 12 (web) can fold into Phase 13 if 12 is required, but it is architecturally independent and better kept separate.

Engine spikes (early parallel track; feed ADRs, not product code): S-PACKAGE (native binding + tiny GGUF in utilityProcess on packaged Win and mac; signing; asarUnpack); S-PDF (Persian bidi/logical order across 40-60 fixtures from multiple producers; pass policy written first); S-TTS (60-sentence blind set; ASR round-trip with sherpa Persian CTC; at least 3 native listeners; thresholds first); S-OCR (line crops at 150/200/300 DPI; CER, WER, ZWNJ, digit error); S-LAYOUT (PP-DocLayoutV3 via ORT and PaddleOCR-VL via llama.cpp on multi-column, table, math, scanned fixtures); S-RUNTIME (text, JSON schema, embeddings, VLM image prompt, cancel, forced OOM, unload/reload, clean Win x64 NVIDIA and Vulkan, macOS arm64); S-EMBED (Persian retrieval set; nDCG@10 and recall@20 hybrid vs each alone); E-LANG (Persian translation eval: deterministic checks, chrF++, calibrated judge, native review, embedded prompt-injection cases).

Phase 1: Foundation, licensing and packaging gate.
- Rationale: process topology, security boundaries, license decision, and proof that native engines package on both platforms. Late discovery forces architecture change.
- Delivers: monorepo with contracts, boundary lint, CI on Windows and macOS; Main/Preload/Renderer/Core skeleton with ping RPC; security baseline (context isolation, sandbox, CSP, fuses, app:// protocol, sender validation); default-deny egress with network-blocked E2E scenario; repository license ADR and license-matrix template; fixture policy (redistributable public set plus private manifest-tracked set; Git LFS); eval harness skeleton; RTL/logical-property lint and fonts; S-PACKAGE complete; packaged smoke test on clean machines; storage path tests with Persian-named profile.
- Addresses: UX-8 foundations, PLAT security, UX-3 groundwork, egress and licensing gates.
- Avoids: P8, P9, P17, P19, P21, P23, P15 (fixture policy), P33, P35.
- Research flag: NEEDS spike (native addon in utilityProcess; helper-process signing).

Phase 2: Durable kernel and storage.
- Rationale: every later capability is a job writing artifacts; kernel and crash harness first means PDF import is born resumable.
- Delivers: SQLite in Core behind Db adapter (better-sqlite3 default; node:sqlite decision recorded); forward-only migration runner with checksum, user_version, transactional DDL, downgrade refusal; pre-migration backup and backup/restore (UX-6); CAS blob store with atomic writes; job and task FSM (pure TS); scheduler with resource classes; boot recovery; engine-host protocol with fake engine; crash-injection harness (kill -9 at every step); append-only triggers on evidence tables.
- Uses: better-sqlite3, Kysely, zod, utilityProcess. Implements: storage and durable job kernels; Patterns 1 and 5.
- Avoids: P11, P4 (per-page quarantine model), Anti-Pattern 9.
- Research flag: standard patterns; driver choice settled in Phase 1.

Phase 3: PDF import and canonical document model.
- Rationale: trust in reconstruction is the core value; stable block IDs and provenance cannot be retrofitted.
- Delivers: import with hash dedupe and "open existing"; encrypted/damaged/oversized statuses (password never persisted); Stage A extraction in sandboxed host with per-page limits (pdfjs-dist candidate, final parser per S-PDF); Stage B assembly (reading order, direction by evidence, bidi repair, joins, outline); block/block_version/block_lineage/block_override schema with ULIDs; alignment for re-extraction; per-page coverage accounting; text-layer health detector; shared Persian normalization module (test-first, span-typed, versioned); DOC-10..12 hooks; fixture suite and gold set growing from Phase 1.
- Uses: pdfjs-dist, @napi-rs/canvas, bidi-js.
- Addresses: DOC-1..5, DOC-7, DOC-9, DOC-10 hooks, DOC-11 design, D-1, D-2.
- Avoids: P1, P3 (coverage side), P4, P12, P24, P25, P26.
- Research flag: NEEDS deeper research (Persian ordering engine; alignment thresholds need real data). Gate on S-PDF.

Phase 4: Semantic reader, source outline, search and progress.
- Rationale: parallel with Phase 5 once blocks exist; first trust surface; search depends on normalizer.
- Delivers: RTL reader with block-level direction and inline isolates; concept navigation placeholder and original outline view; typography controls and bundled fonts; source-evidence inspector; position keyed on block ID; selection actions shell; READ-9 search (FTS5 over normalized search_text in index.db; trigram plus unicode61; RRF-ready); coverage events kept separate from learning signals; virtualized rendering; bidi torture-page tests (unit and screenshot).
- Addresses: READ-1..11 (subset per plan), UX-4 groundwork, D-3.
- Avoids: P22, P30, P32, P26, P1 (search folding).
- Research flag: standard; Persian FTS behavior validated by spike data.

Phase 5: Model asset store and document intelligence.
- Rationale: OCR/layout models need the asset store and integrity layer first; document-intelligence quality gates depend on S-OCR, S-LAYOUT, S-RUNTIME VLM path.
- Delivers: asset store; registry manifest (repo, commit SHA, sha256, size, license, role, tested_on); first-party resumable downloader with hash verification; sideload import; mirrors; storage manager (MODEL-5); selective OCR routing by region; OCR and layout adapters with conformance suites; table cell-grid reconstruction; equation candidate and verification with unverified UI state; figure asset extraction; adversarial fixtures (scans, rotated and borderless tables, math-heavy Persian, two-column RTL); eval gate with recorded baseline and pass policy written before running; OCR crash/OOM containment.
- Uses: tesseract.js and/or PP-OCRv5 via onnxruntime-node, PP-DocLayoutV3, PaddleOCR-VL if S-RUNTIME allows; ipull or first-party downloader.
- Avoids: P2, P3, P15, P18, P21, P28, P34.
- Research flag: NEEDS research (Persian OCR and layout engines; table structure; S-OCR and S-LAYOUT gate this).

Phase 6: Inference, hardware probing and embeddings.
- Rationale: LLM use needs resource governor, measured footprints and quality evals first; Persian retrieval depends on S-EMBED and normalizer.
- Delivers: hardware probe recorded from probe-loads (not inference); role registry with model_eval and hardware_check records; resource broker with one heavy model resident, admission control, typed OOM; LLM and embedding adapters in utility processes; token budgets with real tokenizer; embedding pipeline (bge-m3 or challenger) with (model_id, dim, normalizer_version) per vector; index.db with FTS5 and VectorIndex interface (flat BLOB scan in worker first; sqlite-vec only if benchmark demands); hybrid retrieval with RRF; E-LANG harness operational; plain-language recommendations.
- Uses: node-llama-cpp (llama.node if S-RUNTIME requires), onnxruntime-node for small models, bge-m3.
- Addresses: MODEL-1, MODEL-2, MODEL-4, MODEL-6; LESSON and KNOW retrieval groundwork.
- Avoids: P7, P10, P27, P28, Anti-Pattern 8.
- Research flag: NEEDS SPIKE and research (S-RUNTIME, S-EMBED, E-LANG; constrained decoding; GPU backends per OS; footprint measurement).

Phase 7: Knowledge synthesis.
- Rationale: concepts depend on retrieval and stable block IDs; merge and prerequisite quality must be measured before lessons depend on them.
- Delivers: map-reduce candidate extraction; hybrid candidate matching; LLM adjudication (merge, attach, new) with evidence; concept, concept_evidence, concept_definition, concept_relation, concept_lineage, disagreement, unresolved_prerequisite, glossary_entry; knowledge-delta applied in one transaction; staleness evaluator; hierarchical curriculum as derived projection; KNOW-6 overrides surviving re-synthesis; integrity tests (no cycles, no dangling evidence, every concept has source block, stable IDs across identical reruns).
- Addresses: KNOW-1..7, D-4, D-5, DOC-10 full flow. Avoids: P13, Anti-Pattern 6.
- Research flag: NEEDS research (merge and prerequisite precision eval design before implementation).

Phase 8: Translation, normalization and summarization.
- Rationale: first pass is per-block and does not need concepts; can run parallel with Phase 7 once Phase 6 exists; glossary seeded from Phase 7 afterwards.
- Delivers: segment-ID-keyed translation with protected spans (code, math, numbers, units, URLs, citations, glossary terms); two-stage translate then constrained normalize with diff gate; deterministic fidelity checks (number/identifier equality, length ratio, negation/quantifier cues, script mix); per-block fidelity status (LANG-6); glossary as versioned data with stale marking on override; summarization as separate artifact with essential-points list and coverage/omission report; resumable source-wide jobs; READ-11 bilingual toggle.
- Addresses: LANG-1..6, READ-11, D-7, D-8. Avoids: P5, P15 (omission eval), Anti-Pattern 4.
- Research flag: NEEDS research (Persian translation model choice gated by E-LANG; TranslateGemma 2K context and gating).

Phase 9: Grounded lessons.
- Rationale: consume concepts, translations, retrieval and verifier; cannot ship before citations are mechanically verified.
- Delivers: on-demand generation with streaming and cancel; retrieval, then model selects block IDs from closed set, then verifier checks quotes and entailment, one re-ask then downgrade to supplemental; lesson_segment and citation schema with DB trigger enforcing grounded-needs-verified-citation; supplemental labeling; disagreement sections; section-granular fingerprints and stale flags; cache with version and provenance; LESSON-6 and LESSON-7; prompt-injection fixtures.
- Addresses: LESSON-1..7, D-6. Avoids: P6, P5 (supplemental channel), P23, P29, Anti-Pattern 3.
- Research flag: standard verification pattern; citation-accuracy eval design is remaining work.

Phase 10: Audio.
- Rationale: depends on normalized translations and lessons and on S-TTS outcome, which must be complete before this phase starts (spike runs early). Persian voice choice is a product-licensing decision.
- Delivers: speech-text front-end (number/date/unit expansion in Persian grammar; script-span segmentation to English or Persian voices; code and formula read-out policy; user pronunciation lexicon); TTS adapter on sherpa-onnx pinned 1.13.x or own VITS runner; sentence chunking with prefetch; composite cache key (normalized_speech_text_hash, frontend_version, voice_hash, model_hash) with speed applied at playback; playback controls, sentence highlight, seek; voice picker with license and resource notes; listening protocol in eval harness; storage manager integration.
- Addresses: AUDIO-1..7, D-9, UX-3 numerals. Avoids: P16, P21 (voice and phonemizer licenses), Anti-Pattern 1.
- Research flag: NEEDS SPIKE (S-TTS gates voice selection; ezafe and homograph handling; listening rubric).

Phase 11: Learning (retrieval, FSRS, signals).
- Rationale: retrieval items need grounded content and citations. Learning core (review log, FSRS replay, signal separation as pure TS) can be built in TDD earlier, in parallel with Phase 4 or 7, as it has no AI dependency.
- Delivers: recall_item authoring from lessons with source references; closed-book, hinted and open-book evidence types; graded feedback with progressive hints; assessment_attempt and immutable review_log with fsrs_params_version; ts-fsrs wrapped in domain/learning with replay tests and DST/clock-rollback simulations; three signals in three tables; concept fade indicator with non-color cue and uncertainty bands; passive review suggestions with soft daily cap and leech handling; LEARN-8 controls; manual correction kept out of review_log.
- Addresses: LEARN-1..10, D-10, D-11, LESSON-2 feedback, UX-10. Avoids: P14, P30, Anti-Patterns 5 and 6.
- Research flag: light (confirm ts-fsrs ReviewLog fields and optimizer packaging; keep optimizer out of v1).

Phase 12: Opt-in web research.
- Rationale: architecturally independent, but consent-gate skeleton and default-deny egress belong in Phase 1 so no earlier phase opens a socket.
- Delivers: WEB-1..5; per-send query preview with exact text and provider; redaction screen flagging text copied from private blocks; separate web_evidence namespace with no FK into concept evidence; labeled online evidence with URL and date; explicit save as labeled source type (pending product decision); egress log as T0 and user-visible; tool schemas for search, open, read; zero-egress test with research disabled.
- Addresses: WEB-1..5, D-13. Avoids: P19, P20.
- Research flag: light; provider choice needs ADR.

Phase 13: Hardening and release.
- Rationale: release gates, large-book reliability, accessibility and installers must be proven on real machines, not CI.
- Delivers: large-book soak (RSS flat over repeated jobs; nightly failure on growth) with 500+ page fixtures; crash-injection and migration-upgrade matrix across released schemas; accessibility pass (keyboard, focus, screen-reader lang, axe on packaged app); eval gates enforced against recorded baselines; signed and notarized installers (Windows signing per eligibility; macOS Developer ID and notarization) with codesign verification; clean-machine matrix including Persian-named profile and no-network run with real model load, OCR, TTS; licensing and NOTICE audit; opt-in update check (UX-9); LEARN-9 policy confirmed; UX-7 export and UX-8 diagnostics finalized; "untested" platform statement published.
- Addresses: PLAT, UX-4, UX-9, UX-10, DOC-11 completion, UX-7, UX-8, licensing.
- Avoids: P8, P10, P11, P18, P19, P21, P31, P32; "looks done but isn't" items.

### Phase Ordering Rationale
- Packaging and licensing before features: Phase 1 settles native packaging and license gates.
- Kernel before PDF: Phase 2 precedes Phase 3 so import is born resumable.
- Identity before reader, knowledge and lessons: stable block IDs and provenance (Phase 3) precede Phases 4, 7, 9 because citations, stale detection, re-extraction and learning history depend on them.
- Engine spikes before consuming phases: S-PDF before Phase 3; S-OCR and S-LAYOUT before Phase 5; S-RUNTIME and S-EMBED before Phase 6; S-TTS before Phase 10. The brief's order would place S-RUNTIME after the phase that needs it and S-TTS within the consuming phase.
- Model manager split: asset store (Phase 5) before OCR; hardware probing and evals (Phase 6) before LLM use.
- Parallelism: Phase 4 with Phase 5; Phase 7 with Phase 8; Phase 11 learning core (TDD) earlier than its UI; Phase 12 any time after Phase 6.
- Pitfall avoidance: normalizer and bidi tests land in Phases 3-4 so search, embeddings, TTS and translation share one implementation; eval harness starts Phase 1 with first gold set in Phase 3, not Phase 5.

### Research Flags
Needing deeper research or spike during planning (/gsd-plan-phase --research-phase N):
- Phase 1: native binding + tiny GGUF in utilityProcess on packaged Win/mac; better-sqlite3 vs node:sqlite; helper signing; Electron 44 Node version.
- Phase 3: PDF engine for Persian logical order (pdf.js vs MuPDF per license vs PDFium); alignment and text-health thresholds (set from spike data).
- Phase 5: Persian OCR engine choice; layout reading order on Persian two-column; table structure; formula verification.
- Phase 6: LLM runtime (one vs two bindings; vision); GPU backends per OS; constrained decoding; Persian LLM and embedding quality; token budgeting.
- Phase 7: merge and prerequisite precision eval design.
- Phase 8: Persian translation model under E-LANG; TranslateGemma gating and context.
- Phase 10: Persian TTS naturalness (S-TTS); per-voice license; ezafe and homographs; sherpa-onnx Persian configuration (no published Node example).

Standard patterns (skip research-phase or keep light): Phase 2 (durable queues, migrations, VACUUM INTO, CAS); Phase 4 (reader, virtualization, RTL, validated by torture-page tests); Phase 9 (verifier pattern; citation-accuracy eval design remains); Phase 11 (FSRS with immutable logs); Phase 12 (consent-gated egress; privacy tests matter more); Phase 13 (installer process; verification is the work).

## Confidence Assessment
| Area | Confidence | Notes |
| Stack | MEDIUM | App shell/storage/UI/test tooling HIGH (npm registry and official docs, 2026-10-09). Engine layers shortlists with no public Persian head-to-head evidence; Persian quality claims self-reported or secondary (LOW-MEDIUM). Model-card figures summarized; re-read before ADRs. |
| Features | MEDIUM | Competitor features from vendor pages and reviews (MEDIUM; some 2023-era). Persian typography/OCR/TTS claims domain knowledge or thin sources (LOW-MEDIUM). Table stakes partly inferred by analogy. |
| Architecture | MEDIUM | utilityProcess, MessagePortMain, node:sqlite facts HIGH from fetched docs. Topology, job system, identity, learning model are established practice and synthesis (MEDIUM). Native addon behavior in utilityProcess and sqlite-vec vs flat scan unverified (LOW/SPIKE). |
| Pitfalls | MEDIUM | Unicode, bidi, PDF font, Electron process, SQLite semantics HIGH for mechanism. Persian extraction failure modes from single-provider web searches, tagged [verify]. Thresholds intentionally absent (spike outputs). |

Overall: MEDIUM. Roadmap structure and foundation decisions are plannable; engine choices and Persian quality bar are not, so each engine is spike-gated.

### Gaps to Address
- D-LICENSE: repo has no LICENSE. Gates MuPDF (AGPL-3.0 or commercial), espeak-ng (GPL via sherpa-onnx), Persian voice choice. Handle: product decision as ADR in Phase 1, before Phases 3 and 10. Design permissive by default; copyleft engines as optional adapters.
- D-COMMERCIAL: most Persian-capable voices and some models non-commercial (pocket-tts-farsi-v2 CC-BY-NC-4.0; ParsVoice-XTTS CPML; Aya Expanse believed CC-BY-NC, unverified). Handle: product decision before Phase 10; default commercial-safe only.
- Persian quality of every engine/model: no Persian numbers for Gemma 4, Qwen 3.5/3.6, TranslateGemma, EmbeddingGemma 2, Qwen3-Embedding, PP-DocLayoutV3, PaddleOCR-VL. Handle: S-PDF, S-OCR, S-LAYOUT, S-RUNTIME, S-EMBED, E-LANG, S-TTS spikes with pass policies written before running.
- Persian TTS naturalness unproven; Mana-Persian-Piper license-clean but no published listening eval. Handle: S-TTS; "listed as Persian" never counts.
- Vision in Node LLM runtime: node-llama-cpp none; llama.node has image input but no documented Electron packaging. Handle: S-RUNTIME decides.
- Electron/Node version discrepancy: STACK.md says Electron 44.7.0 bundles Node 24.18.1; ARCHITECTURE.md cites 24.21.0. Handle: verify process.versions.node at scaffold before pinning.
- Vector backend disagreement: ARCHITECTURE recommends flat BLOB scan first, sqlite-vec later; STACK recommends sqlite-vec with flat fallback. Both agree on VectorIndex interface. Handle: flat scan first, benchmark both at ~20k and ~100k chunks before Phase 6 commits.
- node-llama-cpp process placement: its Electron guide says main process; topology places it in utility process. Handle: S-RUNTIME confirms; fall back only if it fails.
- Persian text-layer health and extraction quality: no authoritative per-producer data. Handle: fixture suite across generators (Word, LibreOffice, XeLaTeX, InDesign if available, Chromium printToPDF from RTL HTML, legacy-font samples, scans) with hand-verified ground truth.
- Persian Pixel dataset license ("openly licensed" only); ParisaOCR recognizer in Kraken format (offline conversion gray area under no-Python; ADR needed). Handle: license check; reference point only unless converted and ADR-approved.
- Platform scope: Intel Mac (no GPU inference) and Windows arm64 (no sherpa or sqlite-vec packages) incomplete. Handle: product decision; report untested.
- Distribution for Persian-first users: access to Hugging Face, release hosts, CDNs, signing services may be restricted (assumption, unverified). Handle: decide mirrors, sideload, credential holders before Phase 5; document unsigned prerelease fallback.
- Signing eligibility: Windows Artifact Signing reportedly limited to US/Canada individuals (MEDIUM). Handle: check team eligibility; decide OV or HSM fallback in Phase 13 planning.
- Feature decisions for requirements step:
  1. Scoped grounded Q&A in contextual panel (recommended) vs global chat home (anti-feature). Needs confirmation.
  2. Minimal bookmarks/highlights without notes (table stakes in Reader/RemNote; brief excludes notes).
  3. Whether self-graded recall counts as FSRS evidence (recommend yes, distinct evidence type, conservative weight).
  4. Ratify Audio Overview and generative re-narration as Out of Scope.
  5. Whether a web snippet can be saved as non-PDF reference source (WEB-4 implies; brief PDF-only).
  6. User-editable extraction text (recommend corrections as versioned overlays, deferred).
  7. Update check: opt-in or manual only (recommend opt-in, disclosed).
  8. Non-ASCII profile paths: default ASCII-safe, user-selectable, non-synced storage (pending Phase 1 path test).
- Evaluation policy: no pass/fail thresholds defined yet; define before first run, relative to recorded naive baseline (raw text-layer extraction plus single LLM pass). No thresholds asserted here.

## Sources

Primary (HIGH; official sources or npm registry, checked 2026-10-09):
- Electron utilityProcess API: https://www.electronjs.org/docs/latest/api/utility-process
- Electron 44 release post: https://www.electronjs.org/blog/electron-44-0; security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Node.js node:sqlite docs: https://nodejs.org/api/sqlite.html
- npm registry (npm view) for versions, peers, optional deps, licenses (electron, electron-vite, electron-builder, vite, plugin-react, typescript, typescript-eslint, better-sqlite3, sqlite-vec, node-llama-cpp, sherpa-onnx-node, @fugood/llama.node, onnxruntime-node, @huggingface/transformers, pdfjs-dist, mupdf, ts-fsrs, vitest, playwright, playwright-bdd)
- node-llama-cpp Electron guide and issues #88, #562: https://node-llama-cpp.withcat.ai/guide/electron ; https://github.com/withcatai/node-llama-cpp/issues
- Model/dataset cards (re-read before ADRs): Gemma 4 E4B https://huggingface.co/google/gemma-4-E4B-it ; TranslateGemma https://huggingface.co/google/translategemma-12b-it ; WMT24++ https://huggingface.co/datasets/google/wmt24pp ; bge-m3 https://huggingface.co/BAAI/bge-m3 ; FaMTEB https://arxiv.org/abs/2502.11571 ; Mana-Persian-Piper https://huggingface.co/MahtaFetrat/Mana-Persian-Piper ; Mana-TTS https://huggingface.co/datasets/MahtaFetrat/Mana-TTS ; piper-voices amir card https://huggingface.co/rhasspy/piper-voices/blob/main/fa/fa_IR/amir/medium/MODEL_CARD ; Kokoro https://huggingface.co/hexgrad/Kokoro-82M
- sherpa-onnx issue #3731: https://github.com/k2-fsa/sherpa-onnx/issues/3731
- MuPDF.js: https://github.com/ArtifexSoftware/mupdf.js

Secondary (MEDIUM):
- sqlite-vec https://github.com/asg017/sqlite-vec ; ts-fsrs https://github.com/open-spaced-repetition/ts-fsrs
- PaddleOCR PP-OCRv5 and PaddleOCR-VL docs; PaddleOCR-VL-1.5-GGUF card
- Anki forum threads (FSRS defaults, optimizer thresholds, workload) cited in PITFALLS.md
- Competitor pages (NotebookLM, Readwise Reader, RemNote, Khanmigo, Quizlet, Speechify, LM Studio, Jan, AnythingLLM)
- Docling arXiv 2501.17887 (vendor-reported benchmarks; directional)
- Persian Pixel arXiv 2607.20385 ; IDPL-PFOD https://aclweb.org/anthology/2021.nsurl-1.4.pdf
- llama.cpp multimodal docs https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md ; llama.node https://github.com/mybigday/llama.node
- electron-builder notarization docs https://www.electron.build/docs/notarization ; https://www.electron.build/docs/mac

Tertiary (LOW; leads only):
- Persian/Arabic PDF extraction reports (DEV Community; PDF Association OctoberPDFest 2020; LibreOffice bug 151788; PDFium/MuPDF comparisons via GitHub PRs/issues; one small single-author Arabic benchmark, indicative only)
- Persian TTS/OCR landscape (replicate, Hugging Face, arXiv 2510.10774; ParisaOCR https://github.com/givia/ParisaOCR; Essex study https://repository.essex.ac.uk/37448/)
- Low-resource Persian LLM studies: arXiv 2412.13375, 2507.22720, 2509.21104, 2507.23399
- Windows Artifact Signing eligibility (press, Microsoft Learn Q&A)
- SQLite WAL copy-corruption notes https://scottspence.com/posts/sqlite-corruption-fs-copyfile-issue
- Domain knowledge without URL (confirm by spike): Unicode Arabic blocks and NFKC; UAX #9; PDF ToUnicode/ActualText; Windows narrow-path behavior; Chromium spellcheck download; GPU TDR; engine license families.

Companion files: .planning/research/STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

---
*Research completed: 2026-10-09*
*Ready for roadmap: yes, with D-LICENSE and D-COMMERCIAL product decisions and Phase 1 spike outcomes flagged as gates.*

