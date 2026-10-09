# Pitfalls Research

**Domain:** Local-first, Persian-first (RTL) Electron + React + TypeScript desktop learning environment: PDF reconstruction, embedded local LLM/OCR/embedding/TTS, grounded lessons and translation, knowledge map, FSRS review.
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall

Confidence method. Unicode/bidi/PDF-encoding facts, Electron/native packaging mechanics, SQLite semantics and FSRS design are established engineering knowledge (HIGH for the mechanism, but every item must still be confirmed by a spike on the real fixtures and platforms). Web searches done for this file were single-provider (`classify-confidence` returns LOW for an un-cross-checked WebSearch result and MEDIUM when cross-checked). Items backed only by a search snippet are tagged `[verify]`. Quantitative claims (TDR timings, token-inflation ratios, error rates) are NOT asserted here; they are measurement tasks for the spikes listed in the phase table.

Phase numbers refer to the brief's order in PROJECT.md: 1 Foundation, 2 Document pipeline, 3 Semantic reader, 4 Document intelligence quality, 5 Local inference/model manager, 6 Knowledge synthesis, 7 Lesson/content production, 8 Audio, 9 Learning, 10 Research, 11 Hardening/release.

---

## Top Roadmap-Shaping Findings (read first)

1. **The brief's order puts risky unknowns late.** Phase 4 (formula/table/VLM OCR) needs the inference runtime that Phase 5 delivers, and Persian TTS viability (Phase 8) is the likeliest "v1 requirement we cannot meet" item. Recommend: a packaged-app spike in Phase 1 that loads a tiny GGUF through the chosen native binding inside an Electron utility process on both OSes, plus a Persian TTS listening spike in Phase 2. Start the eval harness and fixture collection in Phase 1/2, not Phase 4.
2. **One shared, test-first Persian text-normalization module** (yeh/kaf/digits/tatweel/ZWNJ/presentation forms/bidi controls) must exist before the reader, search, embeddings, TTS and translation each grow their own incompatible versions. It belongs in Phase 2 with raw text always preserved next to normalized text.
3. **Citations, block IDs and concept IDs are identity problems, not generation problems.** They must be assigned and verified by code (stable IDs, programmatic quote checks), never produced as free text by an LLM, and must survive re-extraction and source updates. Decide the identity/remapping scheme in Phase 2 or every later phase inherits the debt.
4. **Silent omission is the dominant failure mode** of PDF reconstruction, translation and summarization. Every stage needs an accounting step ("what in the input is not in the output?") and evals that measure omission, not fluency.
5. **Distribution realities for Persian-first users** (non-ASCII Windows profile paths, restricted access to model hosts, signing/notarization accounts) can break the "download a model, it works" promise. Needs explicit product decisions (sideload model import, mirror strategy, ASCII-safe storage) before Phase 5. `[verify]`

---

## Critical Pitfalls

### Pitfall 1: Trusting the PDF text layer for Persian/Arabic-script text

**What goes wrong:**
Extraction returns text that looks plausible but is wrong, and downstream stages treat it as verified source:
- Visual-order output: RTL runs come out word-reversed or character-reversed; some libraries already return logical order, so "fixing" by reversing again produces double reversal.
- Presentation-form codepoints (U+FB50-FDFF, U+FE70-FEFF) instead of base letters; text looks right on screen but fails search, embeddings, translation and TTS.
- Naive NFKC "fixes" presentation forms, but it also expands ligatures such as U+FDFA into a full phrase and maps Arabic-yeh presentation forms to Arabic yeh (U+064A) rather than Persian yeh (U+06CC). Apply folding only to the Arabic presentation-form blocks, then run a context-aware yeh/kaf fold.
- Missing or wrong ToUnicode maps (legacy Iranian fonts, custom encodings, Type0 fonts with no ToUnicode) yielding PUA codepoints, U+FFFD, or Latin-looking junk. Math fonts (Computer Modern symbol/math encodings) produce garbled symbols the same way.
- Mirrored brackets: in visual-order extraction `(` and `)` swap meaning inside RTL runs.
- ZWNJ (U+200C) does not exist in the PDF; it is just a small gap. Extractors either glue words ("میخواهم", "کتابها") or insert a space ("می خواهم"), both wrong. Orthographic ZWNJ cannot be recovered by extraction alone, only by gap analysis plus a lexicon/morphology heuristic.
- Arabic vs Persian letterforms (ي/ی, ك/ک, ه/ۀ/ہ) and digit sets (Arabic-Indic U+0660-0669 vs Persian U+06F0-06F9 vs Latin) are mixed within one document; digit runs inside RTL text are reordered by bidi, so "۱۲۳" or "2024" may be reversed by a visual-order extractor.
- Kashida/tatweel (U+0640) used for justification gets extracted as real characters.
- Multi-column Persian pages read right column first; XY-cut or "top-left first" reading-order heuristics assume LTR. RTL tables have the first column at the right, so extracted tables have reversed columns.
- Ligature and lam-alef glyphs, running headers/footers, footnote markers and page numbers (often Persian digits as superscripts) get interleaved into body text.

**Why it happens:**
Developers test on English PDFs and a couple of Word-exported Persian files whose fonts have good ToUnicode maps. Persian PDFs in the wild come from Word, InDesign (ME), XeLaTeX/bidi, LibreOffice, Chrome print, legacy desktop-publishing tools and scanners with a bad prior OCR layer, each with different failure modes.

**How to avoid:**
- Treat extraction as producing a *hypothesis with a quality score*, never as truth. Keep `raw_text` (exactly as extracted, with codepoints) and `normalized_text` as separate fields on every block.
- Build a per-document and per-font "text layer health" detector before anything else: share of PUA/U+FFFD chars, share of isolated/presentation-form-only letters, missing ToUnicode, letter n-gram plausibility (score both directions of each RTL run against a Persian character n-gram or word list and pick direction by evidence, never by a global flag), Arabic-vs-Persian letter ratios, spaces-per-word anomalies.
- Implement normalization as a pure, versioned, TDD'd pipeline with explicit stages: presentation-form mapping (Arabic blocks only) -> bracket un-mirroring -> bidi run re-ordering by evidence -> yeh/kaf fold (Persian target) -> digit policy -> tatweel strip -> ZWNJ restoration (flagged `heuristic`) -> whitespace. Property-test round trips on a corpus; each stage's version goes into the extraction version.
- Never silently "fix" semantics: an Arabic-Indic digit may be intentional in a quoted Arabic passage. Preserve original in raw text and display the normalized value only where the policy says so.
- Make reading order a layout-aware, direction-aware algorithm: detect page/column direction from dominant script, allow per-region override, test with Persian two-column, sidebars, footnotes and RTL tables. Record page furniture (headers, footers, page numbers) as `furniture` blocks, not deletions.
- If text layer health is below threshold, route that page/region to OCR rather than patching it (see Pitfall 2).

**Warning signs:**
Reversed sentences in the first manual look at an extraction; search for a known Persian word fails while the page "looks" fine; embedding similarity between the same sentence typed vs extracted is low; digits differ between reader and source; `U+FFFD` or PUA chars anywhere; words glued or split at half-space positions; tables where headers are on the wrong side.

**Phase to address:**
Phase 2 (normalization module, health detector, raw/normalized split, fixtures) with Phase 4 for OCR routing and adversarial fixtures. Fixtures must exist in Phase 1/2.

---

### Pitfall 2: OCR vs embedded-text decision made wrong, and "garbage" text layers trusted

**What goes wrong:**
- Scanned "searchable" PDFs carry a poor prior OCR text layer (often Arabic-trained, not Persian). The app sees "has text" and skips OCR, ingesting confident garbage.
- Conversely, OCR is run on whole documents "to be safe", multiplying time, memory and error surface, and replacing perfectly good embedded text with worse OCR output.
- Persian dots and diacritics are the weak point of OCR: dot patterns distinguish letters (ب پ ت ث share a skeleton), so a lost dot silently turns one word into another word; blur/noise removes dots first; Arabic-trained models perform poorly on Persian. Optional vowel marks add more difficulty. (Source: Persian Pixel dataset paper, ACL NSURL 2021; LOW-MEDIUM, `[verify]` with own measurements.)
- OCR engine confidence is not calibrated to dot/letter substitutions: a wrong-but-valid Persian word gets a high confidence.
- Low-DPI scans, skew, bleed-through, mixed Persian/Latin digits and Latin terms inside Persian lines; digits recognized as Arabic-Indic vs Persian variants inconsistently.
- WASM Tesseract builds are slow and leak memory over long jobs; traineddata variants (`fast` vs `best`) differ in quality; loading from a non-ASCII path fails on Windows (see Pitfall 17).

**Why it happens:**
OCR is treated as a binary switch and an OCR engine's output as ground truth. Nobody measures character/word error rate on real Persian scans before choosing an engine.

**How to avoid:**
- Decide OCR **per page region**, from the text-layer health score plus visual checks (render the page, compare layout of text bboxes to ink regions: ink with no text-layer coverage means OCR needed; text-layer coverage with garbled health means re-OCR and compare).
- When both embedded text and OCR exist and disagree materially, keep both, mark the block `conflict`, prefer the higher-evidence one, and surface low confidence. Do not overwrite.
- Pre-process deliberately (deskew, upscale to the engine's native DPI, binarization tuned to preserve dots) and measure whether each step helps on Persian.
- Build a small labeled Persian OCR benchmark before choosing the engine: clean, 150 DPI, 300 DPI, with and without vowel marks, Latin/Persian digits, mixed bidi, bad scans. Compare Tesseract `fas`, an ONNX detector/recognizer, and a VLM OCR on word error rate AND "dot-confusable substitution rate".
- Use a Persian lexicon/LM post-check only to *flag* suspicious tokens, never to silently rewrite them (silent correction is hallucination).
- Mark OCR-derived blocks with `source: ocr`, engine+version, per-word confidence; expose "OCR'd, low confidence" in the reader.

**Warning signs:**
Pages processed as "text" that contain no recognizable Persian words; OCR output that is fluent but differs from the image in a dotted-letter pair; throughput collapses on large scans; OCR memory grows monotonically.

**Phase to address:**
Phase 4 (selection policy, benchmark, adversarial scans); spike the OCR engine choice in Phase 2 so Phase 2's data model has `source`/`confidence` fields from day one.

---

### Pitfall 3: Silently dropping or fabricating equations, tables and figures

**What goes wrong:**
- Formula-OCR models (pix2tex/Texify/UniMERNet-class, Nougat-class) produce syntactically valid, plausible LaTeX that is *wrong* (wrong exponent, missing term, swapped subscripts), and the app presents it as the source.
- Math in the text layer is garbled glyphs from custom math fonts; pipeline treats it as ordinary text and the lesson generator "repairs" it.
- RTL context: LTR formula inside an RTL paragraph, equation numbers like "(۳)" on the left, formula and prose order swapped by extraction.
- Tables: merged/spanning cells, ruled vs borderless, RTL column order, multi-page tables, header repetition, footnotes in cells; table-structure models emit well-formed HTML with shifted cells. Flattening a table into paragraph text destroys meaning without any error.
- Figures dropped because "no text"; captions detached from figures; figure text (axis labels, diagrams) invisible to lessons. Page furniture removal deletes real content (e.g., short last lines mistaken for footers, side-notes).
- Content that fails extraction is simply absent: no error, no marker.

**Why it happens:**
Success is judged by "the output looks clean", not by accounting for the page. Models that emit LaTeX/HTML always emit something.

**How to avoid:**
- **Coverage accounting per page:** compare text-layer character count / ink-region area to extracted block coverage; any unaccounted region becomes an explicit `unsupported/missing` block with the cropped image attached. A page with unaccounted regions can never be "verified".
- **Formulas:** store (a) cropped image, (b) candidate LaTeX with model/version/confidence, (c) status `unverified | verified`. Verification = render candidate with the app's math renderer and compare to the crop (image similarity or token-level check) plus a self-consistency check (two models or two decodes agree). Below threshold, show the crop, not the LaTeX. Never feed unverified LaTeX into lessons as fact; if used, label it.
- **Tables:** store as a cell grid with spans and per-cell confidence, plus the crop; validate row/column counts against detected ruling lines or text alignment; RTL tables get an explicit column-direction attribute. Fallback to the image crop with the label "table could not be reconstructed".
- **Figures:** always extract as assets with caption linkage; any VLM alt-text/description is labeled `generated description`, not source.
- Treat page furniture removal as classification with logged decisions and a reversible flag.
- Adversarial fixtures: math-heavy Persian text, rotated tables, borderless tables, scanned tables, two-column equations.

**Warning signs:**
Page char counts in vs out differ without a recorded reason; formula outputs that always compile; tables that never have spans; lessons mentioning formulas that do not appear on the page.

**Phase to address:**
Phase 2 (data model supports `missing/unsupported` and assets, coverage accounting), Phase 4 (models, verification, adversarial fixtures), Phase 7 (lessons must respect `unverified` status).

---

### Pitfall 4: Parser and rasterizer treated as trusted code

**What goes wrong:**
PDFs are hostile input. Native parsers/rasterizers (PDFium, MuPDF, Poppler-class) have a history of memory-safety bugs; decompression bombs, pixel bombs (huge MediaBox rasterized for OCR), cyclic page trees, huge object streams, encrypted-with-owner-password-only files, and 2,000-page books can exhaust RAM or hang. A parser crash inside the main process takes down the app and the in-flight job.

**Why it happens:**
"Importing a PDF the user chose" feels safe. The app is local so security review is skipped.

**How to avoid:**
- Parse and rasterize only in a sandboxed utility/child process (never the main process, never the renderer) with per-page timeout, memory cap, max-pixel cap, and a kill-and-quarantine path: one corrupt page produces a `page_failed` record, not a failed document.
- Validate with page/size/object limits before deep processing; hash first (dedup), copy original to immutable storage, process the copy.
- Explicit user-facing statuses for encrypted (needs password vs owner-restricted), damaged (repaired? partial?), oversized. Decide product policy for copy-restricted PDFs (flag for product review rather than silently ignoring or bypassing).
- Never execute PDF JavaScript or follow PDF links/URIs automatically.
- Choose parsers with license compatibility in mind (see Pitfall 21).

**Warning signs:**
Whole-app crash on a malformed fixture; import of a 1,000-page book exceeds a few GB of RAM; UI freezes during import.

**Phase to address:**
Phase 2 (process isolation, limits, statuses); Phase 11 (fuzz/adversarial corpus, large-book soak).

---

### Pitfall 5: LLM hallucination, omission and "normalization drift" in translation and lessons

**What goes wrong:**
- Small local models translate or rewrite fluently while omitting a sentence, a constraint, an exception, a number, or a unit, and adding "helpful" connective explanation. Fluent Persian hides omissions from a non-expert reader.
- "Educational normalization" silently becomes simplification: nuance, hedges, quantifiers ("at most", "only if") and edge cases vanish. The brief explicitly forbids lowering academic level, and nothing in a standard pipeline enforces it.
- Persian quality of small models is uneven; low-resource-language hallucination rates are higher (cross-checked indirectly by multilingual hallucination studies; `[verify]` for the chosen model). Aggressive quantization (Q4 and below) tends to hurt non-English more than English; do not infer Persian quality from English benchmarks.
- Code, identifiers, formulas, numbers, citations, proper names, and URLs get "translated" or altered.
- Terminology drifts between chunks and sources (کامپیوتر / رایانه, different transliterations of the same English term); the glossary exists but is only a prompt hint.
- "Summaries" omit essential points and nobody notices; summary silently replaces canonical content.
- Reasoning-model "thinking" text or meta-commentary leaks into outputs; prompt-injection text inside a PDF ("ignore previous instructions") changes behavior.
- Mixed supplemental explanation is not visibly separated from grounded content and later gets cached as if it were grounded.

**Why it happens:**
LLM output is validated by reading a sample. There is no mechanical check that every input unit is represented in the output.

**How to avoid:**
- **Segment-aligned translation:** translate per block/sentence with IDs; the output schema is a list keyed by input segment IDs. Missing IDs = omission, caught by code.
- **Protected spans:** code, formulas, numbers, units, URLs, citation markers, and identified terms are replaced by placeholders before the model sees the text and restored after, with verification that every placeholder returns exactly once and unchanged.
- **Mechanical fidelity checks** on every segment: number/entity/identifier set equality, length-ratio bounds, negation/quantifier cue lists, placeholder integrity, script-mix sanity (no unexpected Latin/Chinese output), language-ID of output. Failed segments are retried with a different strategy or marked `unverified`, never silently accepted.
- **Two-stage with a diff gate:** faithful translation first (stored), then normalization as a constrained edit pass whose allowed operations are enumerated (term unification, tone, connective phrasing). Compute the diff between stages; any added or removed propositional content flags the segment. Store both stages and versions.
- **Glossary as data, not prompt text:** versioned domain glossary with first-use "Persian (English)" policy and a post-hoc term-consistency check (every glossary term's English occurrence maps to the chosen Persian form).
- **Summaries:** keyed coverage list of essential points extracted from the source first; summary is checked against that list; omissions are shown to the user; a summary is a derived artifact flagged `summary`, never overwriting canonical text.
- **Grounded vs supplemental:** two output channels in the schema; supplemental content carries a visible `model explanation` label and is excluded from "grounded" caches.
- Treat PDF text as data: wrap in delimiters, forbid tool calls driven by document content, strip/neutralize instruction-like content only for detection (log), never rewrite source.
- Model registry gate: a model is only offered for a role after passing the per-task eval (Pitfall 15), at a specific quant and backend.

**Warning signs:**
Output segments shorter than input by >X%; number sets differ; glossary terms inconsistent across chapters; reviewers find "improvements" that were not in the source; evals only report fluency/BLEU-like scores.

**Phase to address:**
Phase 7 (pipeline and checks), Phase 5 (model quality gate), Phase 2/4 (segment IDs and protected-span extraction come from the document model).

---

### Pitfall 6: Citation fabrication and misattribution

**What goes wrong:**
Lessons contain "[source 3, p. 12]" that the model invented, cite the right document but wrong block, quote text that is paraphrased, or cite after-the-fact (the model writes a claim, then attaches the nearest retrieved block). Disagreements between sources are blended into one claim with one citation.

**Why it happens:**
Citations are treated as generated text instead of verified links.

**How to avoid:**
- The model never writes a citation string. It selects `block_id`s from the retrieved set (closed-world IDs in the prompt); code resolves IDs to canonical blocks, page, and excerpt.
- Sentence-level claims carry `supports: [block_ids]`; verify mechanically (lexical/numeric overlap, entailment check with a local NLI/LLM judge as a *secondary* signal) and mark unsupported claims as `supplemental` or drop them.
- Quoted excerpts shown to the user come from the canonical blocks, never from model output. Quote checks are exact substring on normalized text.
- Multi-source disagreement is a structured output (`claims[]` per source), rendered side-by-side, not blended.
- Stale handling: citation targets reference block IDs plus extraction version, and remap on re-extraction (Pitfall 9).

**Warning signs:**
Citations pointing at IDs not in the retrieved set; excerpts that are not substrings; one citation covering several distinct facts; citation accuracy eval below baseline.

**Phase to address:**
Phase 7 (generation + verification), Phase 6 (retrieval returns IDs and spans), Phase 2 (stable block IDs).

---

### Pitfall 7: Context-window overflow, tokenizer inflation and non-deterministic structured output

**What goes wrong:**
- Persian and mixed-script text consumes many more tokens per word than English in most general tokenizers, so token budgets computed from character or English-word counts overflow; the runtime silently truncates or errors mid-job.
- KV-cache memory grows with context length; an auto-selected large context allocates gigabytes and triggers swap or OOM (Pitfall 11). `[verify]` for the chosen runtime's defaults.
- Whole-book "just put it in context" approaches fail; naive fixed-size chunking cuts across sections, tables and equations.
- Structured output (JSON) fails parse or violates schema; grammar-constrained decoding guarantees syntax, not truth, and can reduce quality; retry loops with temperature>0 produce different content each time, so "regenerate to check" is not a verification.
- Output is not reproducible across GPU backends/drivers even with a fixed seed; evals and caches assume determinism that does not exist.

**How to avoid:**
- Count tokens with the model's actual tokenizer for every budget decision; include prompt, retrieved context, output reserve, and KV cost; set context size explicitly per model/hardware profile.
- Hierarchical/map-reduce processing over *semantic* units (section/block boundaries from the document model), with stable intermediate artifacts persisted per unit so a failure resumes at the unit.
- Use schema-constrained output with a validator and bounded retries; a failure yields `unverified`, not a made-up default. Log model hash, quant, backend, sampling params, prompt version with every output.
- Temperature 0 (or low) for extraction/translation; cache outputs by `(input_hash, prompt_version, model_hash, params)`; never assume bit-identical regeneration. Evals use confidence intervals over multiple seeds/backends.
- Strip reasoning/thinking channels before validation; assert output language and schema.

**Warning signs:**
Jobs failing only on long chapters or Persian-heavy chapters; evals that flip on re-run; parse-failure retry rates climbing; memory spikes on long contexts.

**Phase to address:**
Phase 5 (budgeting utilities, profiles), Phase 6/7 (map-reduce pipelines).

---

### Pitfall 8: Native inference/OCR/TTS packaged wrongly in Electron (ABI, arch, asar, signing)

**What goes wrong:**
- **ABI mismatch:** modules built for system Node fail to load in Electron (and the reverse: tests under Node after an Electron rebuild fail). The same binary can satisfy only one ABI. Prefer N-API/ABI-stable bindings or per-Electron prebuilds; pin Electron and re-run rebuild in CI on every dependency change. better-sqlite3 is not an N-API module and needs per-Electron-ABI binaries. (Sources cross-checked at MEDIUM.)
- **asar:** native `.node`, `.dll`/`.dylib`, helper executables and model files inside `app.asar` fail to load or exec. They must be in `app.asar.unpacked`, and workers (utility processes, child processes) must resolve paths via `process.resourcesPath`, not `__dirname`. node-llama-cpp ships per-platform/per-GPU backend packages as optional dependencies; unpack rules must match those package paths (`@node-llama-cpp/*`). Verify in a *packaged* build; dev mode hides the problem.
- **Runtime download/build fallback:** node-llama-cpp falls back to downloading a llama.cpp release and building from source with CMake when no prebuilt binary matches; on a clean user machine this fails or phones home. It can be disabled via `NODE_LLAMA_CPP_SKIP_DOWNLOAD`. Packaged apps must never depend on a compiler or network at first run. (Verified from project docs.)
- **Architecture:** Apple Silicon vs Intel (and universal builds). Fat-merging native modules fails when a module ships single-arch; build per-arch natively in CI and use `singleArchFiles`/per-arch artifacts, or ship separate DMGs. Windows ARM64 is a third architecture many native engines do not ship; either explicitly support or explicitly exclude with a clear message.
- **Signing/notarization:** macOS hardened runtime requires every nested binary (each `.node`, dylib, helper exe) to be signed; one unsigned binary fails notarization with an opaque log; entitlements for JIT/unsigned executable memory vary by Electron version, so test rather than copy a blog. Windows: unsigned or low-reputation binaries trigger SmartScreen and Defender heuristics; llama.cpp-style binaries and large unsigned executables are frequent false-positive targets `[verify]`. Signing in CI needs secrets and sometimes an account the team may not be able to obtain (Pitfall 18).
- **Installer size:** CUDA runtime libraries and multiple backends can balloon the installer; NSIS has a hard installer size ceiling and slow install/uninstall on huge unpacked trees `[verify]`. Models must never be bundled; GPU backends should be optional downloads with integrity checks.
- **GPU availability:** Metal (Apple Silicon yes; Intel Macs with weak/AMD GPUs often worse than CPU), CUDA (needs NVIDIA driver version compatibility), Vulkan (driver quality varies, iGPU shared memory), DirectML (ONNX path). "Prebuilt binary exists" is not "works on this machine". Detection must be a *probe load* in a child process, with automatic fallback to CPU and a recorded outcome.

**Why it happens:**
Everything works in `npm run dev` on the developer's machine. CI is green on unit tests. The first clean-machine install is the first real test.

**How to avoid:**
- Phase 1 includes a **packaged smoke test on clean Windows and macOS VMs/machines**: install the signed-or-unsigned artifact, launch, load a tiny GGUF through the native binding in a utility process, run one OCR image, one TTS sentence, open SQLite. This is the acceptance gate for every dependency addition.
- CI matrix builds per OS/arch natively; include a "rebuild for Electron" step and a check that the packaged app does not reference `node_modules` outside unpacked paths.
- Keep one adapter interface per engine (`LlmAdapter`, `OcrAdapter`, ...) so a loader failure degrades the capability, not the app.
- GPU/accelerator support is recorded as measured facts in a hardware capability table ("tested on X, Y"), never inferred from OS/GPU vendor. GitHub-hosted runners generally lack real GPUs, so GPU support needs a manual or self-hosted hardware matrix; report untested combinations as untested.
- Pin and checksum every native binary; build provenance in the release notes.

**Warning signs:**
"Cannot find module", "was compiled against a different NODE_MODULE_VERSION", exec ENOENT for helper binaries only in packaged builds; notarization rejected; app works on dev laptop only; first-run network calls in logs.

**Phase to address:**
Phase 1 (smoke test with a native module and tiny model), Phase 5 (GPU probes, per-arch packaging), Phase 11 (signing, notarization, clean-machine verification).

---

### Pitfall 9: Blocking the main process; crash of native code taking down the app

**What goes wrong:**
- better-sqlite3 is synchronous; used in the main process it freezes the UI and the whole app for the duration of long queries or migrations.
- Inference/OCR/TTS in the main process or a renderer worker freezes UI; a segfault or GPU "device lost" in native code (llama.cpp, ONNX Runtime, Vulkan/DirectML driver reset, Windows TDR on long GPU workloads) kills the entire Electron app and unsaved state.
- Inference saturating the same GPU as Chromium's compositor makes the UI stutter, especially on integrated GPUs and laptops.
- Large payloads over IPC (full documents, embeddings, audio) cost serialization time and memory.

**How to avoid:**
- **All native engines run in supervised utility processes** (one per engine role, separate from the DB owner), with a supervisor that detects exit, restarts with backoff, resumes from the last checkpoint, and reports a typed error to the UI. A crashed engine must be a recoverable job event, not an app crash.
- A single **DB-owner process/service** (one writer, one connection pool policy) with an async request API; renderer and engines request via typed IPC. No second process opens the same SQLite file for writing.
- IPC carries IDs, small structured data, and pagination; bulk data moves via files or transferred buffers.
- Schedule heavy GPU jobs with a "UI-responsive" policy (lower priority, chunked, yield between units; offer CPU fallback when frame times degrade).
- Bounded concurrency: one heavy engine at a time by default (Pitfall 11).

**Warning signs:**
UI stalls during import or lesson generation; app exits with no error dialog when a model misbehaves; main-process CPU spikes in profiler.

**Phase to address:**
Phase 1 (process topology, supervisor, DB owner), Phase 5 (inference supervisor), Phase 11 (crash-injection testing).

---

### Pitfall 10: Memory/VRAM mismanagement and OOM

**What goes wrong:**
- "Fits in memory" decided from file size; ignores KV cache, activations, compute buffers, and other apps. On Apple Silicon unified memory the GPU working-set limit is a fraction of RAM; exceeding it causes swap thrash or system-wide freezes. On Windows, dedicated VRAM vs shared GPU memory and integrated GPUs are misreported by naive detection.
- Loading LLM + embedding + VLM + TTS concurrently "for responsiveness" exhausts memory.
- Long jobs leak memory (native contexts not disposed, WASM heaps never freed, rasterized page bitmaps held, embedding batches accumulated); the app degrades after hours.
- OOM in native code is a process kill, not a catchable exception.

**How to avoid:**
- A **resource broker** that owns model lifecycle: explicit load/unload, per-role memory estimate (measured, with context size), a policy of "one heavy model resident", LRU unloading, and admission control that refuses or downgrades (smaller quant/context/CPU) before loading.
- Measure real peak memory per (model, quant, context, backend) during model-registry testing and store it; use measured numbers plus a safety margin for estimates.
- Process-per-engine so the OS reclaims memory on unload; recycle workers after N units or when RSS exceeds a threshold (cheap and robust leak mitigation).
- Soak test: 500+ page book, repeated jobs, track RSS over time; fail CI nightly on growth.
- On OOM exit, mark the unit failed with reason, reduce context/batch automatically once, then ask the user.

**Warning signs:**
RSS growth across units; system freeze rather than app error on model load; different behavior on 8 GB vs 16 GB machines.

**Phase to address:**
Phase 5 (broker, estimates, registry measurements), Phase 11 (soak, low-memory machine testing).

---

### Pitfall 11: Durable jobs that lose verified output or corrupt on restart

**What goes wrong:**
- Job state lives in memory or in a table updated separately from the results, so a crash leaves "completed" without outputs or outputs without a status.
- Steps are non-idempotent: re-running a page appends duplicate blocks, regenerates different content, and overwrites a previously *verified* block with a lower-quality retry.
- Jobs marked `running` forever after a crash (no lease/heartbeat), or retried infinitely on a poison page.
- Cancellation leaves partial writes; pause/resume resumes from the wrong unit when parameters changed.
- SQLite pitfalls: two processes/threads writing the same WAL database; copying the `.db` file alone while WAL is active (inconsistent snapshot); relaxed `synchronous` settings trading durability; database on OneDrive/network or a folder synced by a client; WAL growth without checkpoints. (Mixed sources, MEDIUM.)
- **Migrations**: a failed migration half-applied; app downgraded against a newer schema; migration touching large tables blocks startup; user data lost with no backup.

**How to avoid:**
- Job model: `job -> units` with state machine and leases (`claimed_by`, `heartbeat_at`); on startup, requeue expired leases. Units write results and mark completion **in the same transaction**.
- Content-addressed, versioned outputs keyed by `(unit input hash, stage version, model hash, params)`; a retry creates a new version; promotion over a previously verified output requires equal-or-better verification status, never silent replacement. Never delete verified output on failure.
- Poison-unit quarantine with attempt counters and reason codes; surface in UI as "N pages need attention".
- SQLite policy: WAL, one owner process, explicit `synchronous` decision recorded in an ADR, periodic `wal_checkpoint`, backups via the SQLite backup API or `VACUUM INTO`, never raw file copy; database stored in a local, non-synced app-data directory; `PRAGMA integrity_check` available in a diagnostics path.
- Migrations: forward-only, each in a transaction, preceded by an automatic pre-migration backup, refuse to open a DB with a newer schema version than the app supports, migration tests on snapshots from every released schema version, and large data (audio, embeddings blobs, rasters) kept in content-addressed files rather than in the main DB where possible.
- Crash-injection tests (kill -9 at every step of a job) are part of TDD for the job state machine.

**Warning signs:**
Duplicate blocks after resume; job counts that never reach 100%; "database is locked" errors; user reports of progress lost after update.

**Phase to address:**
Phase 1 (storage topology, migration framework, backup), Phase 2 (job state machine, idempotency, quarantine), Phase 11 (crash-injection and migration-upgrade soak).

---

### Pitfall 12: Unstable block IDs and re-extraction orphaning everything

**What goes wrong:**
When extraction improves (new parser/OCR/normalizer version), blocks change; IDs derived from position or from a regenerated UUID change with them. Citations, highlights, reading position, lesson provenance, concept evidence, and learning history silently point at nothing or the wrong text.

**How to avoid:**
- Define stable block identity explicitly: IDs are assigned once; re-extraction runs an **alignment step** (page + geometry + normalized text similarity) mapping new blocks to old; matched blocks keep IDs and gain a new extraction version; unmatched new blocks get new IDs; unmatched old blocks become tombstones with `superseded_by` lists (split/merge).
- Never hard-delete blocks referenced by evidence; keep tombstones and an alias table; references resolve through the alias table.
- Store citation anchors as `(block_id, char_range_in_normalized_text, text_hash)` so drift can be detected and re-anchored by fuzzy match.
- Re-extraction is opt-in/background with a diff report and the ability to keep the old version until the user or a policy approves the switch.
- TDD this: identity, dedup, alignment and provenance are explicitly listed as deterministic cores in PROJECT.md.

**Warning signs:**
Reading position jumps after an extractor upgrade; lessons show "source not found"; anchors off by a few characters after normalization changes.

**Phase to address:**
Phase 2 (identity scheme and alignment), Phase 3 (anchors in the reader), re-verified in Phase 6/7 on source updates.

---

### Pitfall 13: Knowledge-graph over-merging, cycles, unstable concept IDs, erased history

**What goes wrong:**
- **Over-merging:** embeddings and LLM labels treat "stack (data structure)" and "stack (call stack/memory)", "binary tree" and "B-tree", "variance" in statistics vs signal processing, "regularization" across contexts as the same concept. Cross-lingual embeddings (Persian/English) over-merge near-synonyms and terminology variants. Merged concepts blend definitions and cause lessons that attribute one source's claim to another. Disagreements between sources get averaged away.
- **Under-linking** the other way: same concept under different Persian renderings never links, and the curriculum contains duplicates.
- **Cycles:** LLM-proposed prerequisite edges produce cycles (A needs B needs A); chapter order is mistaken for dependency; every concept "requires" a hallucinated generic prerequisite ("basic mathematics").
- **Unstable IDs:** re-running extraction/clustering regenerates concept IDs and names, orphaning reading history, assessments, lessons and recall state.
- **Source updates erase history:** adding a PDF triggers a rebuild that replaces rather than reconciles.
- Recommendation ordering jitters between runs (non-deterministic), which feels broken to users.
- Hierarchical list view requires a tree, but concepts form a DAG (a concept belongs under several parents).

**How to avoid:**
- **Conservative merge policy:** default is *do not merge*; link as `related`. Merge only with evidence: matching normalized label/alias AND compatible definition (judge over the actual source blocks, not labels) AND disjoint-or-consistent context; every merge records evidence, confidence, and is reversible (split with history reassignment rules).
- Preserve per-source definitions as `claims` attached to a concept; the concept is a container, not a blended text.
- Prerequisite edges are typed (`explicit_in_text`, `inferred`, `ordering_only`) with evidence blocks and confidence; use them as soft guidance. Enforce acyclicity by SCC condensation / dropping lowest-confidence edge; test for cycles as a graph integrity invariant.
- **Concept identity is assigned once** (UUID) and matched on re-run by evidence overlap + label/embedding similarity with a high threshold; matches keep IDs; splits/merges are explicit events with redirect tables. Learning evidence attaches to the finest durable level (the question/practice item and its source blocks) in addition to the concept, so a split can reassign history sensibly.
- Source addition = incremental reconcile: add evidence, propose merges/new nodes, mark affected lessons `stale`, never delete progress. Provide an "undo last graph update" via event log.
- Deterministic clustering/ordering (fixed seeds, stable sort keys, sticky previous placement) so re-runs do not reshuffle.
- Graph integrity tests: no cycles, no dangling evidence, every concept has >=1 source block, alias uniqueness, history preserved across merge/split.
- Embedding hygiene: store `(model_id, dim, normalizer_version)` with each vector; apply the same normalization at index and query time; respect model-specific query/passage prefixes (e.g., e5-family conventions) `[verify per chosen model]`; re-embed on model change without touching concept IDs. Measure Persian retrieval quality before trusting it.

**Warning signs:**
Concept cards whose definition mixes two meanings; prerequisite lists that contain the concept itself indirectly; IDs differ across two identical imports; review history disappears after adding a second PDF.

**Phase to address:**
Phase 6 (all of the above), with ID/alias scheme foreshadowed in Phase 2 and eval metrics (merge precision, prerequisite precision) built in Phase 4/6.

---

### Pitfall 14: Fake mastery, gamed "known", FSRS misuse, review overload

**What goes wrong:**
- Mastery % computed from reading progress, scroll, time-on-page or self-reports; users equate "opened" with "learned". "Mark as known" buttons inflate recall estimates (explicitly out of scope in the brief, but easily reintroduced as "skip", "I know this", or easy-rating).
- Self-grading bias: users press "Easy" to clear the queue; LLM-graded free responses are noisy and sometimes agree with plausible wrong answers; hints and open-book answers recorded as full success.
- Generated questions leak answers in their wording, can be answered by recognition, or repeat verbatim so the learner memorizes the question rather than the concept; questions that cannot be answered from the sources (ungrounded) corrupt the evidence.
- FSRS scheduling: optimizing parameters on sparse personal data is unreliable; community evidence shows re-optimizing on small histories can produce worse parameters than defaults (cross-checked at MEDIUM; the often-cited ballpark is hundreds to thousands of reviews before optimizing). Mixing item-level and concept-level cards confuses state. Default 90% desired retention produces large review loads for broad concept sets. Clock changes/time zones/day boundaries distort intervals. Library/algorithm version changes (FSRS version updates) change schedules for existing users if derived state was stored instead of raw logs.
- Retrievability displayed as a precise percentage or confident fade for cards with 1-2 reviews, overstating certainty.
- Review overload creates "endless obligation", violating the calm-product intent; leeches (items failed repeatedly) keep returning without intervention.

**How to avoid:**
- Keep three signals strictly separate in schema and UI: `coverage` (engagement, never feeds recall), `assessed understanding` (graded retrieval results with grader confidence), `predicted recall` (FSRS output with uncertainty). Only graded retrieval events call the scheduler. No code path from "mark as known" to stability.
- Store an **immutable review log** (item, timestamp, rating, evidence type: closed-book retrieval / hinted / open-book, grader, question variant, source blocks, scheduler version). Derive card state from logs so parameters or algorithm version can be recomputed and migrated.
- Ratings: derive from objective outcome where possible (correct/incorrect, hint count, response latency) with the user's self-rating as one input; hint use caps the rating; open-book retrieval is not counted as retrieval success.
- Question quality gates: must be answerable only from the cited source blocks, answer not contained in the stem (automatic leak check), multiple variants per item, rotate variants; low-confidence LLM grading routes to "self-check against source excerpt" instead of auto-grading.
- Use default FSRS parameters until a high review-count threshold with a hold-out comparison (accept new parameters only if they improve log-loss/RMSE on held-out reviews); expose no knobs in normal UI. Choose granularity (concept vs item) deliberately in an ADR.
- Show recall as coarse, uncertain bands with age-of-evidence ("last practiced"), minimum-evidence thresholds before fading begins, and never color-only encoding (brief requires accessibility).
- Review load policy: daily soft cap, prioritize by lowest retrievability and graph importance, load smoothing/fuzz, leech suspension with remediation (re-teach, new question variant), no calendar.
- Test scheduler with deterministic simulations (TDD): replay logs, DST jumps, clock rollbacks.

**Warning signs:**
Mastery numbers rise without any retrieval events; >80-90% of ratings are "Easy"/"Good" at constant speed; queue grows monotonically; schedule changes when the library is upgraded.

**Phase to address:**
Phase 9 (all), with Phase 3 for ensuring reading progress never feeds recall, and Phase 7 for question generation quality gates.

---

### Pitfall 15: Evaluation that cannot catch the failures that matter

**What goes wrong:**
- Fixtures are PDFs generated by the team's own tooling (the earlier Rust prototype's PDFs are explicitly insufficient) or synthetic text; they miss legacy fonts, missing ToUnicode, scans, multi-column Persian, RTL tables.
- References are produced by the same LLM that is being evaluated, or an LLM-as-judge (weak in Persian, same family bias) is the only metric; fluency/BLEU-type metrics reward fluent omissions.
- No baseline: pass/fail thresholds invented after seeing results; "95% accuracy" reported without a gold set; evals run once on one backend/quant and treated as universal.
- Evals not stratified by document type, so an average hides catastrophic failures on scans or math.
- Fixtures are copyrighted textbooks that cannot be committed to a public repo; so tests silently only run on the developer's machine.
- Evals do not test omission/extra-content detection, citation accuracy, or concept-merge precision, which are the product's trust claims.

**How to avoid:**
- Build the fixture suite as a **product asset from Phase 1/2**: legally redistributable documents (public-domain/CC Persian and English texts, Persian Wikipedia exports, self-authored documents) rendered by multiple generators (Word with B Nazanin/Vazirmatn/Times, LibreOffice, InDesign if available, XeLaTeX with Persian support, Chrome print-to-PDF, legacy-font samples) plus real-world private fixtures kept out of git and run locally with a manifest and hashes. Include scans at several DPIs, skew, stamps, mixed bidi with code/math, two-column RTL, RTL tables, broken/encrypted/huge PDFs.
- Hand-label a small but real gold set (page-level ground truth for text, structure, tables, formulas) and compute CER/WER, structure F1, table cell accuracy, formula exact/visual match, **coverage/omission rate** (aligned segment recall), **extra-content rate** (output segments with no input alignment), citation accuracy (verified substring + correct block), concept merge precision/recall, prerequisite precision, glossary consistency.
- Record the baseline (the naive approach: raw pdf.js text + single LLM pass) first; "pass" is defined relative to the baseline with an explicit policy written before running.
- Evals pin `(model hash, quant, backend, prompt version, seed)` and report variance. LLM judges only as secondary, calibrated against human labels on a Persian sample.
- Spoken-voice quality is a human listening protocol with a fixed script (numbers, dates, mixed English terms, ezafe-heavy phrases) and a rubric; record raters and results; never infer from "voice listed as Persian".
- Eval reports state verified/partial/blocked with evidence paths (project mandate).

**Warning signs:**
All fixtures pass on first attempt; thresholds chosen post hoc; eval cost dominated by LLM-judge calls; no failing test has ever come from a real user PDF.

**Phase to address:**
Phase 1/2 (fixture policy, first gold set, harness skeleton), Phase 4 (full regression harness), every later phase adds its own metrics; Phase 11 enforces gates.

---

### Pitfall 16: Persian TTS: normalization, homographs, mixed language, licensing, cache

**What goes wrong:**
- Persian text is normally written without short vowels, so TTS must disambiguate homographs and place ezafe correctly (e.g., کرد, علم, and ezafe chains in noun phrases); without a G2P/diacritization step, even a "natural" voice mispronounces technical prose.
- Numbers, dates (Jalali vs Gregorian), ordinals, decimals, fractions, percent, units, equations, abbreviations, and Latin digits in Persian text are read as digit-by-digit or in English, or the number grammar (و joiners) is wrong.
- Mixed English technical terms and code: engines switch languages poorly; identifiers and code blocks should not be read like prose.
- Voice licensing: Persian models with restrictive licenses (the Coqui public model license on XTTS and its Persian fine-tunes bars commercial use, including outputs `[verify]`), datasets with non-commercial terms, voices derived from real speakers' recordings; phonemizer dependencies with copyleft licensing (the espeak-ng phonemizer commonly used with Piper-style engines is GPL; check the engine variant's license against the repository's license) `[verify]`. Single-speaker Persian community voices may be MIT/CC0 but must be confirmed from primary model/dataset cards, not aggregator pages.
- Sentence chunking at bidi/ZWNJ boundaries causes prosody breaks; long text synthesized in one pass runs out of memory or latency budget.
- Cache invalidation: audio cache keyed only by text hash survives normalizer, voice, speed, or model changes and plays stale/mispronounced audio; or never reuses because the key includes volatile fields.
- Playback seek/speed on streamed chunks desyncs highlight/position.

**How to avoid:**
- Dedicated **speech-text frontend** (separate from display normalization): number/date/unit expansion in Persian grammar, abbreviation lexicon, code/formula verbalization policy (skip, announce "code block", or verbalize math), language-tagged spans so English terms go to an English G2P/voice, and a pronunciation override dictionary (user-visible only in settings, versioned). Evaluate ezafe/homograph handling explicitly; if the chosen engine has no diacritization, measure and disclose limits.
- Early **listening spike** (Phase 2) on 3-4 candidate engines/voices with a fixed technical script; decide feasibility before Phase 8 depends on it; recorded rater scores.
- License matrix for every engine, G2P, voice, and dataset in an ADR; block registry entries lacking verified licenses; ship accurate NOTICE data in-app.
- Cache key = `(normalized_speech_text_hash, speech_frontend_version, voice_id+hash, model_hash, speed-independent)`; apply speed at playback; store chunk boundaries to allow seek and highlighting.
- Chunk by sentence/semantic unit with overlap-free joins; pre-generate next chunk while playing; cap memory.

**Warning signs:**
Numbers read in English; frequent wrong stress on common words; same sentence sounds different after update with cached copy playing old audio; licensing text unknown for a shipped voice.

**Phase to address:**
Phase 8 (frontend, caching, evaluation), with a feasibility spike in Phase 2 and licensing ADR in Phase 5 (registry).

---

### Pitfall 17: Windows/macOS path, profile and storage assumptions that break native engines

**What goes wrong:**
- Persian (non-ASCII) Windows user names put app data under paths like `C:\Users\<Persian name>\AppData`; native libraries that use narrow-codepage file APIs (some C/C++ model loaders, tessdata lookup, ONNX paths, espeak data dirs) fail to open files, with errors that look like corrupt models. Spaces and very long paths compound this. Hypothesis from common Windows native-lib behavior; must be tested. `[verify]`
- Models/data placed in `Roaming` (synced by enterprise profiles), OneDrive-redirected Documents, or network drives; SQLite on synced folders corrupts or locks.
- Disk space not checked before multi-GB downloads; partial downloads treated as complete; no resume; filesystem full mid-write corrupts model cache.
- Downloaded model integrity unchecked; model formats that execute code on load (pickle-based) used.
- Uninstall/update removes or orphans multi-GB model storage; storage migration across disks unsupported.

**How to avoid:**
- Test every native engine with a Unicode (Persian) user-profile path and a path with spaces as a Phase 1/5 acceptance test. Where an engine fails, pass 8.3 short paths, relocate to an ASCII-safe data directory (user-selectable, defaulting to a local non-synced location), or load from memory/handle instead of path.
- Local app data (not Roaming), never inside OneDrive; warn when the chosen directory is on a network/cloud-synced location.
- Download manager: free-space precheck, `.partial` files, HTTP range resume, SHA-256 verification against pinned registry hashes, atomic rename, size reconciliation, and cleanup. Only load safe tensor/GGUF-type formats from the curated registry; never unpickle.
- Explicit storage management UI (sizes per model/voice, delete, move).

**Warning signs:**
"Model file corrupt" only on some users' machines; failures correlate with usernames or OneDrive users.

**Phase to address:**
Phase 1 (storage layout and path tests), Phase 5 (download manager, registry integrity), Phase 11 (clean-machine matrix incl. Persian-named profile).

---

### Pitfall 18: Distribution assumptions that fail for the target audience

**What goes wrong:**
The product is Persian-first; a significant share of likely users and the team may be in regions where access to model hosts (Hugging Face), GitHub release assets, CDNs, Apple Developer accounts or Windows code-signing services is restricted, throttled, or sanctioned. A model manager that only downloads from one host, an updater that depends on one CDN, or a signing pipeline that cannot be obtained from the team's location can block release. This is flagged as an assumption to confirm with the product owner, not a verified fact. `[verify]`

**How to avoid:**
- Model manager supports: multiple mirrors per registry entry (configurable), resumable chunked downloads, **sideload import from a local file/USB with hash verification**, and works fully offline after import.
- Decide early who holds Apple Developer ID and Windows signing credentials and how CI accesses them; document a fallback (unsigned prerelease artifacts clearly labeled, notarization pending) so release is not blocked at the end.
- Bundle all fonts and runtime assets; no CDN dependencies at runtime.
- Clearly state in the registry which items are small enough to bundle (e.g., OCR traineddata) vs downloaded.

**Warning signs:**
Download stalls only in some regions; release pipeline waiting on credentials in Phase 11.

**Phase to address:**
Product decision before Phase 5; implementation Phases 5 and 11.

---

### Pitfall 19: Hidden network egress and telemetry (including Electron defaults)

**What goes wrong:**
- Fonts, KaTeX/MathJax, icons, or analytics loaded from CDNs; `electron-updater` update checks; crash reporters; npm dependencies with telemetry or "phone home" install scripts; model libraries that try to download binaries or tokenizers at runtime (node-llama-cpp's source-build fallback, HF hub-style fetchers).
- Electron's spellchecker may download Hunspell dictionaries from Google servers on Windows/Linux unless configured otherwise `[verify]`. Chromium background services (component updater, Safe Browsing, DNS prefetch, Google API key warnings) may attempt network calls depending on build/flags.
- Model download requests leak IP, app version, and which model the user wants; URLs may embed identifiers.
- Logs and crash dumps persist document text or prompts on disk or upload them.

**How to avoid:**
- Default-deny network policy at the Electron session layer (`webRequest` allowlist, CSP `connect-src 'none'` in renderer, no remote content), network access only through a single main-side "network service" with an explicit allowlist (model hosts, web-research when enabled) and a user-visible log of requests.
- Egress test in CI and manual release checklist: run the packaged app with a firewall/proxy that records every outbound connection through a full scenario (import, lesson, TTS, review) with research disabled; expected egress is empty.
- Dependency audit: review install scripts, disable runtime downloads (`NODE_LLAMA_CPP_SKIP_DOWNLOAD`-style flags), vendor tokenizers/data, set spellcheck dictionaries to bundled/disabled, disable crash upload.
- Logging policy: no document text, prompts or file paths with user names in logs by default; redaction utility with tests; diagnostics export is explicit and reviewable.

**Warning signs:**
Any outbound DNS lookup during an offline-capable scenario; third-party hostnames in the built bundle; update check on startup without opt-in.

**Phase to address:**
Phase 1 (policy and egress test), Phase 5 (download allowlist), Phase 10 (web tools), Phase 11 (final audit).

---

### Pitfall 20: Web research that leaks private passages or poisons the knowledge base

**What goes wrong:**
The LLM builds search queries from private PDF passages or concept names that reveal the user's documents; fetched pages contain prompt injection steering the model; web content is quietly merged into the sourced knowledge map; search providers log queries; users cannot tell which claims are online vs uploaded.

**How to avoid:**
- Per-query consent surface: show the exact query text (and fetch URL) before sending; query construction restricted to short generic terms, with a redaction pass that blocks long quoted passages, names/emails/IDs from sources; session-level opt-in plus a visible indicator while research is active.
- Fetched content is rendered as `online evidence` with URL, retrieval date, and domain; stored in a separate namespace; promotion into the knowledge map requires explicit user action and creates a distinct source type.
- Treat all web text as untrusted instructions-free data: no tool chaining from page content, strict tool schemas, size limits, no auto-follow of links beyond a bounded depth, HTML sanitation.
- Provider abstraction with a "local SearXNG-style"/direct-fetch option considered in an ADR; privacy trade-offs documented.

**Warning signs:**
Queries longer than a short phrase; queries containing text copied from a PDF; online-derived text appearing in lessons without a label.

**Phase to address:**
Phase 10, with the egress allowlist from Phase 1/5.

---

### Pitfall 21: Engine and model licensing traps with a public repository and no-Python constraint

**What goes wrong:**
Copyleft or non-commercial components are adopted for quality and later conflict with the repository's license or distribution: AGPL/GPL PDF libraries (MuPDF-class), GPL phonemizers, AGPL layout detectors, non-commercial model weights (Nougat-class, some OCR/layout/TTS weights), research-only licenses on Persian fine-tunes. The no-Python constraint also rules out many reference implementations (Docling/marker-class pipelines), tempting teams to port code with incompatible licenses. The repo currently has no LICENSE file (removed at initial commit), so there is nothing to check candidates against. `[verify each at selection time]`

**How to avoid:**
- Choose and record the project's own license before engine selection (ADR), then maintain a machine-checkable license matrix (engine, version, license, model weights license, redistribution rights, notice text) as an acceptance criterion for every ADR.
- Prefer permissive engines (e.g., Apache/MIT/BSD-style) unless quality evidence justifies the cost; keep copyleft/NC components behind a download-time, user-initiated boundary only if legally reviewed.
- Models are downloaded assets, but redistribution via registry mirrors still has license obligations; display license and attribution in-app (brief requires accurate notices).

**Warning signs:**
A candidate engine is "best in the benchmark" but its license is unread; registry entries lacking license fields.

**Phase to address:**
Phase 1 (repository license ADR + matrix template), Phase 2/4/5/8 (each engine ADR), Phase 11 (notices audit).

---

### Pitfall 22: RTL and bidi UI bugs in React/Chromium

**What goes wrong:**
- Physical CSS (`margin-left`, `left:`, `text-align:left`, `float`) hard-coded; layout breaks or half-mirrors. Icons mirrored that should not be (play, media timeline, checkmarks, brand/logo, math) and not mirrored that should (back/forward, list indent).
- Inline English terms, code, numbers, URLs, citations and math inside RTL paragraphs are reordered by the bidi algorithm: trailing punctuation jumps to the wrong side, "C++" becomes "++C", parentheses mirror, number ranges flip, citation markers `[3]` move. Fixed by explicit isolation (`<bdi>`, `unicode-bidi: isolate`, `dir="ltr"` spans) rather than hoping `dir="auto"` works; `dir="auto"` on containers is decided by first strong character, which breaks for paragraphs starting with an English term.
- Code blocks and display math must be LTR islands inside RTL flow, with their own alignment and horizontal-scroll behavior; tables need an explicit column direction.
- Fonts: Persian font lacks math/Latin matching glyphs; fallback fonts change metrics and digit styles; mixing Persian digits (Vazirmatn-style variants) and Latin digits inconsistently; `lang` attribute missing so Chromium picks the wrong fallback; justified Persian text without kashida looks uneven (Chromium does not do Arabic-style kashida justification `[verify]`), so `text-align: justify` can look worse than start-aligned.
- Selection and caret: selection across bidi boundaries is visually discontinuous; DOM `Range` offsets are UTF-16 code units in logical order while the canonical text may be code-point/normalized; ZWNJ/combining marks complicate offsets; copy gives text in logical order but users select visually; double-click word boundaries break at ZWNJ. Selection-based learning actions that map `Range` to canonical block offsets break after normalization differences or when the reader renders transformed text (e.g., placeholders for math).
- Typing: Persian keyboards produce ZWNJ via layout-specific shortcuts (Windows Shift+Space; different on macOS); search boxes must fold yeh/kaf/digits/tatweel/diacritics and treat ZWNJ and space equivalently; SQLite FTS tokenizers may treat ZWNJ and Persian punctuation unexpectedly `[verify]`.
- Virtualized long documents: scroll restoration with dynamic heights, font swap layout shifts, find-in-page vs virtualization, and persisted reading position stored as pixel offsets (breaks on font-size/window changes).
- Accessibility: missing `lang` per span for screen readers, focus order in mirrored layouts, color-only recall fade.

**How to avoid:**
- Tooling: logical properties only (lint rule banning physical properties), RTL-aware design tokens, an icon registry with an explicit `mirror` flag, visual regression screenshots in RTL with mixed-content fixtures.
- Render pipeline: the renderer never emits raw inline runs; the semantic model marks `lang`/`dir` spans (term, code, math, number, url, citation) and the React renderer wraps them with isolates; paragraph `dir` is decided from block-level analysis stored in the model, not first-strong guessing.
- Selection model: define the canonical anchor as `(block_id, offsets in the *displayed canonical text*, grapheme-aware using `Intl.Segmenter`)`; keep a mapping layer for transformed spans; test with ZWNJ, combining marks, inline math, mixed English.
- Reading position stored as `(block_id, intra-block fraction)`, not pixels.
- Bundle fonts (Persian text, matching Latin, code, math); define font stacks per `lang`; verify digit style policy; KaTeX/MathJax fonts local.
- Dedicated RTL-bidi fixture page ("torture test") used in unit tests, screenshot tests, and manual review: parentheses, numbers, ranges, inline code, URLs, Latin term at paragraph start/end, ZWNJ words, equation numbers, table with RTL columns.

**Warning signs:**
Punctuation on the wrong end of mixed lines; arrows pointing the wrong way; copy/paste yields reversed or reordered text; highlights misaligned after font load.

**Phase to address:**
Phase 1 (RTL foundations, linting, fonts), Phase 3 (reader, selection model, bidi isolation, fixtures), Phase 9 (assessment UI, audio controls).

---

### Pitfall 23: Electron security shortcuts with untrusted, AI-generated and PDF-derived content

**What goes wrong:**
PDF-derived text and LLM output are rendered as HTML (or markdown->HTML) in the renderer; a malicious PDF or prompt injection produces script/URL payloads; `nodeIntegration` or loose `preload` APIs expose filesystem/native engines; custom protocol handlers allow path traversal; IPC channels accept unvalidated arguments (e.g., arbitrary file paths for `open`/`read`).

**How to avoid:**
- Context isolation, sandboxed renderer, no Node integration; preload exposes a minimal typed API; schema-validate every IPC payload on the receiving side (e.g., zod or similar); identify sender frames.
- Render from the semantic model with React components, not `dangerouslySetInnerHTML`; if any HTML is allowed (table cells), sanitize with a strict allowlist; strict CSP without `unsafe-inline`/`unsafe-eval`.
- File access by opaque handles/IDs held in the main/DB process; no renderer-supplied paths. Custom protocol serves only content-addressed assets with traversal checks.
- Navigation and `window.open` blocked; external links only through an explicit allowlisted opener with a confirmation.
- Treat model output as untrusted data everywhere (including for tool calls).

**Warning signs:**
Any renderer code path that sends a filesystem path to main; HTML strings stored in the DB from generation.

**Phase to address:**
Phase 1 (boundaries and CSP), re-audited in Phases 3, 7, 10 and 11.

---

## Moderate Pitfalls

### Pitfall 24: Heuristic ZWNJ restoration and normalization applied to the wrong content
**What goes wrong:** Persian normalizers run on code, URLs, English text, formulas, quoted Arabic (Quran, hadith), or other-language passages, corrupting them (e.g., folding Arabic yeh in a quoted Arabic passage; changing digits in code/data tables).
**Prevention:** Normalization is span-typed: only on spans identified as Persian prose; Arabic passages (detected by script/letters distribution) are preserved or handled by a separate policy; code/math/URL spans are protected. Unit-test with mixed-language fixtures.
**Phase:** 2.

### Pitfall 25: Hyphenation, line breaks and reflow damage
**What goes wrong:** Soft hyphens, end-of-line hyphenation in English fragments, and hard line breaks inside paragraphs from PDF text lines produce broken words or run-on paragraphs; Persian rarely hyphenates but justified PDFs insert kashida; list items and headings merged into paragraphs; code lines joined.
**Prevention:** Paragraph reconstruction using geometry (line spacing, indent, alignment), dehyphenation only for Latin hyphenation with dictionary verification and recorded raw text, code blocks detected by monospace font/indent and preserved line-for-line, tatweel stripped.
**Phase:** 2/4.

### Pitfall 26: Structure recovery errors (headings, outline, footnotes)
**What goes wrong:** Heading levels inferred from font size are inconsistent across chapters; PDF outline (bookmarks) ignored or trusted blindly; footnotes appended to paragraphs; running headers mistaken for headings.
**Prevention:** Combine bookmarks, font statistics, numbering patterns and position; keep original outline as a separate view (brief requirement); low-confidence structure flagged; verify with outline-vs-heading agreement metric.
**Phase:** 2/3/4.

### Pitfall 27: Embedding retrieval quality assumed for Persian
**What goes wrong:** Multilingual embedding models perform worse on Persian technical text, over-retrieve generic passages, or mis-handle cross-lingual queries; chunking ignores structure; missing prefixes; stale embeddings after normalizer/model change.
**Prevention:** Persian retrieval benchmark (recall@k on labeled question-passage pairs) before model selection; hybrid lexical (normalized FTS) + vector retrieval; version vectors; re-embed on change; chunk by blocks with context headers.
**Phase:** 5/6.

### Pitfall 28: Model registry claims untested combinations
**What goes wrong:** Registry lists models "supported" without testing the quant/backend/hardware; a smaller quant degrades Persian; entries lack license, checksum, memory measurements.
**Prevention:** Registry entry is a signed manifest with measured results (task evals, peak memory, speed per hardware class) and `tested_on` list; untested = hidden or labeled `experimental`.
**Phase:** 5.

### Pitfall 29: Stale lesson handling that either regenerates everything or never refreshes
**What goes wrong:** Source update triggers full regeneration (cost, churn, changed text the user already studied) or no invalidation (stale facts persist).
**Prevention:** Lesson provenance records `(block_ids, block versions, concept versions, prompt/model versions)`; stale determination by dependency diff; regenerate only affected sections; keep prior version accessible; hash-based cache keys.
**Phase:** 7.

### Pitfall 30: Reading progress treated as evidence
**What goes wrong:** Scrolling or opening counts as learned; progress inference is gameable and wrong (idle tab).
**Prevention:** Track engagement signals (visibility, dwell, scroll velocity, selection actions) only as `coverage`, with manual correction stored separately; never feeds FSRS (Pitfall 14).
**Phase:** 3/9.

### Pitfall 31: Auto-update or app update breaking user data
**What goes wrong:** Updates replace the app while jobs run, apply migrations without backup, or break compatibility with downloaded models/voices.
**Prevention:** Update only when idle; pre-migration backup; model/voice registry versioning; rollback instructions; test upgrade paths between released versions.
**Phase:** 11 (with migration framework from 1).

### Pitfall 32: Accessibility and keyboard handling neglected in RTL
**What goes wrong:** Keyboard navigation direction reversed incorrectly, focus traps in panels, screen-reader mispronounces Persian without `lang`, high-contrast mode ignored.
**Prevention:** Accessibility test pass per phase; `lang` attributes; keyboard map for RTL; automated axe checks in Playwright on packaged app.
**Phase:** 3/9/11.

---

## Minor Pitfalls

### Pitfall 33: Locale and calendar handling
**What goes wrong:** Jalali vs Gregorian dates shown inconsistently; `Intl` Persian digits behavior differs from the app's digit policy; sorting of Persian strings uses default collation.
**Prevention:** Central formatting module with explicit locale/numbering system options; tests; Persian-aware collation (`Intl.Collator('fa')`).
**Phase:** 1/3.

### Pitfall 34: Thumbnails/rasters and temp files accumulate
**What goes wrong:** Page rasters, OCR crops, audio chunks and partial downloads fill disk.
**Prevention:** Content-addressed cache with size quotas and GC; temp dirs cleaned on startup; storage UI.
**Phase:** 2/5/8/11.

### Pitfall 35: Window title/filename encoding and file dialogs
**What goes wrong:** Persian filenames mangled in imports/exports, duplicate detection by filename.
**Prevention:** Hash-based identity, Unicode-normalized display names, tests with Persian filenames.
**Phase:** 1/2.

### Pitfall 36: Overexposing technical plumbing
**What goes wrong:** Model names, context sizes, job IDs surface in normal UI contradicting UX principles; or, opposite, errors are opaque.
**Prevention:** Status layer with plain-language states and a diagnostics view; error taxonomy mapped to actionable messages.
**Phase:** 3/5/11.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Markdown as the stored document | Quick rendering/LLM prompts | Loses provenance, IDs, geometry, confidence; cannot remap citations | Never as source of truth; fine as a derived export/prompt view |
| Overwrite normalized text in place (no raw copy) | Simpler schema | Cannot re-run improved normalization, cannot audit mistakes | Never |
| Global RTL flag instead of per-run/per-block direction | Fast fix for demo PDFs | Breaks mixed docs; double reversal | Never |
| Position-based block IDs | Trivial to implement | All references break on re-extraction | Never |
| Single DB connection opened from several processes | Fewer IPC hops | Locking/corruption, hard-to-reproduce bugs | Never |
| LLM-written citations | Looks grounded in demos | Fabricated attribution erodes trust | Never |
| Using LLM judge as sole eval | Cheap, fast | Circular, weak on Persian, misses omission | Only as a secondary signal with human-calibrated sample |
| Dev-mode only testing of native modules | Fast iteration | Packaging failures discovered at release | Only until Phase 1 smoke test exists; then packaged tests are mandatory |
| Hard-coded model/prompt in code | Quick prototyping | Cannot version or evaluate; model switch breaks cache semantics | Prototyping spikes only, never merged to a shipped path |
| Store embeddings/audio blobs in main DB | Single file | DB bloat, slow backup/migrations | Small test fixtures only |
| Regenerate lessons wholesale on any source change | Simple stale logic | Costly, churns user-studied content | Never past MVP of Phase 7 |
| Copy a blog's notarization entitlements | Quick signing | Over-broad or failing entitlements | Only as starting point, verified by clean-machine test |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PDF parser (JS or native) | Assume logical-order text; reuse visual-order output | Detect direction per run with evidence; keep raw glyph runs with geometry |
| OCR engine | Single confidence threshold; ignore language/traineddata variant; run on full docs | Region-level routing; measure Persian CER; pin traineddata version/path |
| node-llama-cpp / llama.cpp-style runtime | Rely on first-run build/download; assume GPU works; auto context size | Prebuilt, unpacked, pinned binaries; probe-load per backend; explicit context/KV budgets |
| ONNX Runtime (OCR/TTS/embeddings) | One session per call; DirectML assumed present | Reuse sessions in a worker; execution-provider probe with CPU fallback |
| better-sqlite3 | Used from main process or multiple processes; rebuilt only for Node | DB-owner utility process; per-Electron ABI prebuilds; verify in packaged build |
| Hugging Face / model hosts | Single host, no resume, trust file names | Pinned URL+SHA-256, resume, mirrors, offline sideload |
| FSRS library | Store derived card state only; optimize on tiny history | Store immutable review logs; default params until large sample + hold-out check |
| KaTeX/MathJax | CDN fonts; LTR/RTL clashes | Bundled fonts, `dir="ltr"` isolates, RTL equation number layout |
| Web search provider | LLM-generated queries from private text | Consent preview, redaction, short-term queries only, separate evidence namespace |
| Electron updater/crash reporter | Enabled by default dependency behavior | Explicitly off/opt-in; allowlist session |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rasterizing every page at high DPI for OCR "to be safe" | Import takes hours, GBs of RAM | Region-level OCR routing; render only needed regions at needed DPI | Scanned books of ~300+ pages |
| Sequential per-page LLM calls with no batching/checkpoint | Hours-long jobs lost on crash | Unit checkpoints, bounded concurrency, resumable queue | Documents of 100+ pages |
| Loading all embeddings into JS arrays / brute-force search | High memory, slow queries | ANN or SQLite vector extension or chunked brute force with caps; per-model index | Tens of thousands of chunks; multiple books |
| Re-embedding or re-translating on trivial changes | Unnecessary compute | Content-hash caching keyed by input+version | Any source update |
| Giant IPC messages (full document JSON) | UI jank, memory spikes | IDs + pagination, file-backed bulk data | Documents with >10k blocks |
| Long DOM for a 500-page book | Scroll lag, memory | Virtualization by block with stable height estimates and anchored scroll restoration | ~1k+ blocks rendered |
| Synchronous SQLite in a UI-facing process | Frozen window | DB-owner process, async API, indexes reviewed | Large tables, migrations |
| KV cache oversized context | Swap storms, slow generation | Explicit context per profile; measured memory | 16K+ contexts on 8B-class models |
| TTS generating long text in one pass | Latency/memory | Sentence-chunk streaming with prefetch | Chapters / long lessons |
| Native memory never released | RSS climbs over a session | Worker recycling, explicit dispose, soak tests | Multi-hour jobs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Parsing PDFs in the main process | Parser exploit or bomb takes over/ crashes app | Sandboxed utility process, resource limits, kill-and-quarantine |
| Renderer-supplied file paths | Arbitrary file read/write | Opaque IDs, main-side resolution, validated IPC schemas |
| Rendering model/PDF-derived HTML | XSS inside a privileged shell | Render from semantic model; sanitize; strict CSP |
| Prompt injection via PDF/web content | Altered outputs, tool misuse, data exfiltration through search tool | Data-delimiting, tool schemas, no tool calls from document content, consent on network |
| Loading pickle/arbitrary-format model files | Arbitrary code execution on load | Curated registry with safe formats and pinned hashes |
| Unverified model/voice downloads | Tampered weights | SHA-256 pinning, HTTPS, optional signature on registry manifest |
| Logs with document text/paths | Privacy leak, support-bundle leaks | Redaction by default, opt-in diagnostics |
| Custom protocol path traversal | Local file disclosure | Content-addressed asset serving only |
| Native binaries unsigned/unpinned | Tampering, AV flags | Signed builds, pinned checksums, provenance in release notes |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw OCR/translation without quality markers | Learner trusts errors | Inline, calm quality status; excerpt inspection one click away |
| Hiding that a formula/table is unreliable | Wrong learning | Show source crop with "could not reconstruct reliably" label |
| Silent AI "improvements" to text | Distrust once noticed | Visible labels for supplemental/normalized/generated content |
| Progress bar that equals reading | False sense of mastery | Three separate signals; no single mastery number |
| Daily review pile-ups | Abandonment | Soft caps, prioritization, leech handling, no guilt UI |
| Model setup flow exposing jargon | Non-technical users stall | Hardware-aware recommendation with plain language and storage/time estimates |
| Long jobs without time estimates or resume | Fear of losing work | Progress by unit, resumable, plain-language status |
| TTS mispronounces terms with no recourse | Rejects audio feature | Report/override pronunciation, fall back to reading text |
| Mirrored-everything RTL | Broken media controls, math | Mirror flags per icon; LTR islands for code/math/timeline |
| Memory fade conveyed by color only | Inaccessible | Add shape/text/opacity+label alternatives |

## "Looks Done But Isn't" Checklist

- [ ] **PDF import:** Often missing coverage accounting and unsupported-region markers — verify every fixture page has `extracted + missing + furniture` regions covering all ink/text.
- [ ] **Persian extraction:** Often only tested on Word PDFs — verify legacy-font, no-ToUnicode, XeLaTeX, InDesign, scanned-with-bad-text-layer fixtures pass with reported health scores.
- [ ] **Search:** Often missing yeh/kaf/digit/ZWNJ folding — verify typing ي vs ی and Persian vs Latin digits finds the same block.
- [ ] **Reader:** Often missing bidi isolation for inline code/math/terms — verify the RTL torture page in unit + screenshot tests.
- [ ] **Selection actions:** Often break after normalization or with ZWNJ — verify offsets round-trip across normalization versions.
- [ ] **OCR:** Often no per-region provenance or confidence — verify blocks carry engine, version, confidence and show in UI.
- [ ] **Formulas/tables:** Often always "succeed" — verify failed/unverified paths exist and are exercised by adversarial fixtures.
- [ ] **Jobs:** Often not idempotent — verify kill -9 at each step then resume yields identical block set, no duplicates, verified outputs retained.
- [ ] **Migrations:** Often tested only forward from latest — verify upgrades from every released schema, plus refusal of newer schema.
- [ ] **Packaged app:** Often only dev-mode tested — verify clean Windows and macOS install with a Persian-named user, no network, running real model load, OCR, TTS.
- [ ] **GPU support claims:** Often inferred — verify each listed backend with an actual load/inference record per hardware class; otherwise "untested".
- [ ] **Model registry entry:** Often missing license/hash/memory/quality results — verify manifest completeness gate.
- [ ] **Citations:** Often free text — verify every citation resolves to a retrieved block ID and an exact excerpt substring.
- [ ] **Translation:** Often fluency-checked — verify segment-ID completeness, protected-span integrity, number/entity equality.
- [ ] **Normalization:** Often becomes simplification — verify diff gate and enumerated allowed edit types; reviewer sample checks.
- [ ] **Summarization:** Often silently replaces content — verify coverage list shown and canonical content untouched.
- [ ] **Concept merge:** Often tested on obvious pairs — verify polysemy and near-synonym negative fixtures; cycles prohibited by invariant.
- [ ] **Re-run stability:** Often unnoticed — verify identical input yields identical concept IDs and ordering across runs.
- [ ] **FSRS:** Often scheduler-only — verify review log immutability, replay reproducibility, no path from coverage/"known" to stability, review load caps.
- [ ] **TTS:** Often judged by a demo sentence — verify scripted listening test (numbers, dates, ezafe, English terms) with recorded ratings; cache invalidation on frontend/voice version.
- [ ] **Offline claim:** Often untested — verify zero outbound connections in a full scenario with research disabled.
- [ ] **Licensing:** Often only code deps checked — verify engine, model, voice, dataset and phonemizer licenses and in-app notices.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Visual-order/garbage extraction discovered after ingest | MEDIUM | Raw text kept; re-run improved normalization/OCR as new extraction version; alignment preserves IDs; stale flags on dependent lessons |
| Unstable block IDs shipped | HIGH | Introduce alias table; heuristic re-anchoring from stored text hashes; one-time migration with backup; may lose some anchors |
| Over-merged concepts discovered | MEDIUM | Split via event log; reassign evidence by source block; regenerate affected lessons; revise merge thresholds with new negative fixtures |
| Corrupted/lost DB after migration | HIGH (LOW if backup policy) | Restore pre-migration backup; replay from raw originals and logs; ship migration fix with tests from the failing snapshot |
| Fabricated citations in cached lessons | MEDIUM | Re-verify all lesson claims against block IDs; mark unverifiable lessons stale; switch to ID-only citation generation |
| Wrong FSRS parameters applied | LOW-MEDIUM | Because raw logs exist, recompute with defaults; keep optimizer behind hold-out check |
| Native module ABI/packaging break | MEDIUM | Pin Electron, rebuild in CI, add packaged smoke test; hotfix release; document manual repair |
| TTS license discovered incompatible | HIGH | Swap voice behind adapter; re-run listening eval; purge cached audio produced with restricted voice; update notices |
| Telemetry/egress discovered | MEDIUM | Remove dependency or patch; add egress test to CI; publish disclosure if shipped |
| OOM crashes in the field | MEDIUM | Lower default profiles; enforce admission control; add crash reports to local diagnostics export (opt-in) |
| Verified output overwritten by retries | MEDIUM | Versioned outputs let you restore the previous version; add promotion rule |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Persian text layer trust | 2 (+4) | Fixtures from each generator pass; text health scores recorded; reversed/double-reversed cases tested |
| 2 OCR vs embedded text | 4 (spike in 2) | Persian OCR benchmark; routing policy tests on bad-text-layer scans |
| 3 Equations/tables/figures | 2 (model), 4 (models) | Coverage accounting 100% on fixtures; unverified formula/table paths exercised |
| 4 Parser as trusted code | 2 (+11) | Malformed/bomb fixtures never crash main; per-page quarantine works |
| 5 LLM omission/hallucination/normalization drift | 7 (+5) | Segment completeness, protected spans, diff gate; human-labeled omission eval |
| 6 Citation fabrication | 7 (+6, 2) | 100% citations resolve to retrieved IDs; excerpt substring checks |
| 7 Context/tokenizer/determinism | 5, 6, 7 | Token-budget tests with Persian text; resume of long chapters; variance reported |
| 8 Native packaging | 1 (smoke), 5, 11 | Clean-machine packaged run on both OSes; signing/notarization logs |
| 9 Blocking/crash isolation | 1, 5, 11 | Kill engine process mid-job -> app survives and job resumes |
| 10 Memory/OOM | 5, 11 | Soak RSS flat; admission control refuses oversized loads; 8 GB machine run |
| 11 Durable jobs/SQLite/migrations | 1, 2, 11 | kill -9 matrix; migration upgrade tests; backup restore test |
| 12 Block ID stability | 2 (3, 6, 7 reverify) | Re-extraction preserves IDs for unchanged blocks; anchors survive |
| 13 Knowledge graph integrity | 6 | Merge precision/recall; zero cycles; ID stability across re-runs; history preserved on add-source |
| 14 Fake mastery / FSRS | 9 (3, 7) | No path from coverage to stability; replay determinism; load cap simulation |
| 15 Evaluation design | 1/2 (4, all) | Fixture manifest; gold set; baseline recorded; policy committed before run |
| 16 TTS | 8 (spike in 2, licenses in 5) | Listening protocol results; cache invalidation tests; license ADR |
| 17 Paths/profile/storage | 1, 5, 11 | Persian-named profile and spaced path matrix passes; download resume/checksum tests |
| 18 Distribution for target audience | Product decision pre-5; 5, 11 | Mirror + sideload import tested; signing credentials plan documented |
| 19 Egress/telemetry | 1, 5, 10, 11 | CI/manual egress capture is empty in offline scenario |
| 20 Web research privacy | 10 | Query preview/redaction tests; labeled separate evidence namespace |
| 21 Licensing | 1 (ADR), 2/4/5/8, 11 | License matrix complete; notices audit |
| 22 RTL/bidi UI | 1, 3, 9 | Bidi torture page unit + screenshot tests; selection round-trip tests |
| 23 Electron security | 1 (+3, 7, 10, 11) | IPC fuzz tests; CSP check; no raw HTML rendering |
| 24-36 Moderate/minor | As listed per item | Per-item tests listed in prevention |

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| 1 Foundation | Packaging | Native modules and tiny model load only work in dev | Packaged clean-machine smoke test with native binding + tiny GGUF + OCR + TTS + SQLite |
| 1 Foundation | Process topology | Main-process SQLite / engines in main | DB-owner process, utility process per engine, supervisor, typed IPC |
| 1 Foundation | Privacy | CDN fonts, updater, spellcheck, crash reporter egress | Default-deny session, bundled assets, egress capture test |
| 1 Foundation | Licensing | No repo license; engines adopted blindly | License ADR first; license matrix template |
| 1 Foundation | Eval | Fixture legal/availability | Fixture policy: redistributable public set + private local set with manifest |
| 2 Document pipeline | Identity | Position-based IDs | Stable ID + alignment + alias scheme before building anything on top |
| 2 Document pipeline | Text integrity | Visual-order/presentation forms/ToUnicode/ZWNJ | Raw vs normalized fields; health detector; TDD'd normalization module; fixtures from many generators |
| 2 Document pipeline | Jobs | Non-idempotent resume | Lease/unit state machine; versioned outputs; crash-injection tests |
| 2 Document pipeline | Spikes | Persian TTS feasibility and OCR engine unknown | Time-boxed listening spike; OCR benchmark on gold set |
| 3 Semantic reader | Bidi | Inline LTR content reordered; selection offsets | Span isolation from model; grapheme-aware canonical anchors; torture page |
| 3 Semantic reader | Progress | Scroll = learned | Separate coverage signal; block-anchored position |
| 4 Doc intelligence | OCR/formula/table | Plausible but wrong output | Verification via re-render, coverage accounting, unverified UI states |
| 4 Doc intelligence | Eval | Synthetic-only, no baseline | Gold set + baseline-first + stratified reporting |
| 5 Inference/models | Hardware | "Fits" != works/good; GPU claims | Probe-load, measured memory/quality in registry, CPU fallback |
| 5 Inference/models | Downloads | Region/host blocking, no resume, non-ASCII paths | Mirrors, sideload import, resume+hash, ASCII-safe storage tests |
| 5 Inference/models | Budgets | Tokenizer inflation for Persian | Real-tokenizer budgeting; explicit context per profile |
| 6 Knowledge synthesis | Merge/cycles/IDs | Over-merge, cyclic prerequisites, unstable IDs | Conservative merge, typed edges, SCC condense, ID matching + event log, integrity tests |
| 7 Lessons/translation | Fidelity | Omission, drift, fabricated citations | Segment-aligned outputs, protected spans, diff gate, ID-only citations, coverage list for summaries |
| 7 Lessons/translation | Injection | Instructions inside PDFs | Data delimiters, no tool calls from content, injection fixtures |
| 8 Audio | Persian speech frontend | Numbers/ezafe/English terms/licensing/cache | Speech-text frontend, listening protocol, license matrix, composite cache key |
| 9 Learning | Mastery honesty | Fake mastery; sparse FSRS; overload | Three signals, immutable logs, default params, hint-aware ratings, load cap |
| 10 Research | Privacy | Query leakage; web poisoning | Query preview/redaction, separate namespace, no silent ingest |
| 11 Hardening/release | Reality check | CI green != installers work; untested platforms | Clean-machine runs on both OSes incl. Persian-named profile; large-book soak; truthful "untested" reporting; notices audit |

## Sources

Web searches (single-provider WebSearch; findings are MEDIUM when corroborated by mechanism/other sources, otherwise flagged `[verify]`):
- Why Arabic text comes out backwards when extracted from PDFs (DEV Community) and related extraction-library notes: https://dev.to/support_confileo_ce7442eb/why-arabic-text-comes-out-backwards-when-you-extract-it-from-a-pdf-and-how-to-fix-it-548g
- PDF Association, "Support of complex scripts in PDF" (OctoberPDFest 2020): https://pdfa.org/wp-content/uploads/2020/06/OctoberPDFest-2020-Support-of-complex-scripts-in-PDF-Alexey-Subach.pdf
- LibreOffice bug discussion on NFKC and Arabic presentation forms: https://www.libreoffice.org/bugzilla/show_bug.cgi?id=151788
- node-llama-cpp project (prebuilt binaries, per-GPU optional packages, source-build fallback, `NODE_LLAMA_CPP_SKIP_DOWNLOAD`): https://github.com/withcatai/node-llama-cpp and https://www.npmjs.com/package/node-llama-cpp
- Electron asar/native module unpack guidance: https://packages.electronjs.org/packager/v20.3.0/interfaces/Options.html
- Electron native module ABI rebuild notes: https://unpkg.com/create-electron-foundation@1.2.0/cli/template/base/README.md, https://docs.triliumnotes.org/developer-guide/dependencies/updating-deps/bettersqlite-binaries
- SQLite WAL copy corruption and locking notes: https://scottspence.com/posts/sqlite-corruption-fs-copyfile-issue
- electron-builder notarization/universal/signing docs: https://www.electron.build/docs/notarization, https://www.electron.build/docs/mac, https://www.electron.build/v26/docs/architecture
- Notarization practicalities: https://httptoolkit.com/blog/notarizing-electron-apps-with-electron-forge, https://forasoft.com/blog/article/publishing-desktop-apps-on-macos-290
- FSRS optimizer sample-size discussions (Anki forums): https://forums.ankiweb.net/t/how-many-reviews-for-accurate-optimization/53320, https://forums.ankiweb.net/t/automatic-optimisation-of-fsrs-weights-after-400-reviews-threshold/42885
- Persian TTS licensing: https://huggingface.co/omid3098/dio-piper-fa, https://huggingface.co/MohammadJRanjbar/ParsVoice-XTTS, https://medium.com/@warisruzi/choosing-the-right-license-for-text-to-speech-what-every-builder-should-know-d72eb212b421 (secondary; primary model/dataset cards must be read before adoption)
- Persian OCR: "Persian Pixel" synthetic OCR dataset paper https://arxiv.org/pdf/2607.20385, IDPL-PFOD https://aclweb.org/anthology/2021.nsurl-1.4.pdf, Persian layout/Tesseract study https://repository.essex.ac.uk/37448/
- Low-resource Persian LLM quality/hallucination: https://arxiv.org/pdf/2412.13375, https://arxiv.org/pdf/2507.22720, https://arxiv.org/pdf/2509.21104, https://arxiv.org/pdf/2507.23399

Domain knowledge (no URL; confirm by spike): Unicode Arabic-script blocks and NFKC behavior, bidi algorithm and isolates (UAX #9), PDF font/ToUnicode/ActualText mechanics, Electron process model/security checklist, SQLite WAL semantics, FSRS design, Windows narrow-path behavior in C/C++ libraries, Chromium/Electron spellcheck dictionary download behavior, GPU driver reset behavior (TDR), engine license families (MuPDF AGPL, espeak-ng GPL, Coqui CPML). Items marked `[verify]` are specifically the ones not corroborated.

---
*Pitfalls research for: local-first Persian-first Electron document-learning desktop app*
*Researched: 2026-10-09*
