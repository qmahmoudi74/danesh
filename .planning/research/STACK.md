# Stack Research

**Domain:** Local-first, Persian-first (RTL) desktop learning environment: Electron + React + TypeScript, PDF semantic reconstruction, embedded local LLM/VLM/embedding inference, local Persian+English TTS, FSRS scheduling. Windows + macOS, no Python, no Docker, no localhost AI servers.
**Researched:** 2026-10-09 (all versions below checked against the npm registry on this date unless marked otherwise)
**Overall confidence:** MEDIUM. The app-shell, storage, UI and test layers are HIGH. The engine layers (PDF parser, OCR, inference runtime, VLM, TTS, models) are MEDIUM-LOW *by design*: no public Persian head-to-head evidence exists for most of them, so they are shortlist + spike, not final picks.

## How to read confidence in this file

The GSD confidence seam (`classify-confidence`) rates every web-search/web-fetch provider as LOW, even cross-checked. I therefore only use HIGH for machine-verifiable facts (npm registry versions, licenses, peerDependencies, optionalDependencies, publish dates) and for statements read directly from a primary page (official docs, model cards, release notes). Page content was summarised by a small model, so exact numbers on model cards should be re-read by a human before they go into an ADR. Claims resting on a single secondary source or on training knowledge are labelled MEDIUM/LOW or "unverified".

## Two cross-cutting decisions that must be made before the engine ADRs

These are product/legal decisions, not engineering ones. The brief makes licensing a requirement but does not pick Danesh's own license.

**D-LICENSE: Danesh's own license (permissive vs AGPL/GPL).** Two best-in-class engines in this domain are copyleft:
- **MuPDF (`mupdf` 1.28.1) is AGPL-3.0-or-later** (or Artifex commercial license). Covers the JS wrapper and the WASM binary.
- **espeak-ng is GPL-3.0-or-later** and is pulled in by `sherpa-onnx` for Piper-style and Kokoro phonemization today. The sherpa-onnx maintainers opened issue #3731 (2026-07-08) to remove espeak-ng/piper-phonemize in a breaking **2.0.0** precisely because it conflicts with their Apache-2.0 license. A redistribution-safe-build PR (#3931) was closed unmerged.
- Recommendation: **design for the permissive path by default** (pdf.js/PDFium for parsing, own phonemization adapter for TTS) so engines stay replaceable, and treat MuPDF and espeak-ng as *optional adapters* that are only enabled if Danesh is released under AGPL-3.0/GPL-3.0 (which would make both compliant) or an Artifex license is bought. Flag to product review before Phase 2 (PDF) and Phase 8 (audio).

**D-COMMERCIAL: Is Danesh commercial or free/non-commercial?** Most Persian-capable *voices* and several Persian-relevant models are **non-commercial** (see TTS section: pocket-tts-farsi-v2 CC-BY-NC-4.0, ParsVoice-XTTS CPML). If Danesh may ever be sold, only CC0/MIT/Apache voices are usable. Default in this file: **commercial-safe licenses only**.

## Recommended Stack

### Core Technologies (app shell, HIGH confidence)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Electron | 44.7.0 (2026-10-07) | Desktop shell | Current stable line (44.0 released 2026-08-25; bundles Chromium 152, V8 15.2, **Node 24.18.1**). 43.x and 42.x are the other supported lines; 45 is in beta (do not use). Electron 44 requires **macOS 13+** and ships **no win32-ia32** builds. Node 24 satisfies `pdfjs-dist` (>=22.13), `better-sqlite3` and Vitest 5 requirements. License MIT. |
| React | 19.3.0 | UI | Current; works with React Aria / Radix RTL tooling. MIT. |
| TypeScript | **6.0.3 (pin to 6.0.x)** | Language | `latest` on npm is 7.0.2 (native Go compiler, GA July 2026), but 7.0 has **no stable programmatic API until 7.1**; `typescript-eslint` 8.71.1 peers `typescript <6.1.0` and ts-morph/ts-jest-style tooling breaks on 7.0. Pin 6.0.x for tooling; optionally add the 7.x `tsc` for fast CI type-check only. Revisit after TS 7.1. Apache-2.0. MEDIUM (ecosystem state from secondary reports; peerDeps verified). |
| Vite | **7.3.x** (7.3.7) | Bundler | `latest` is 8.3.4, but `electron-vite@5.0.0` peers `vite ^5 \|\| ^6 \|\| ^7`. Vite 8 support exists only in `electron-vite@6.0.0-beta.7` (beta). Stay on Vite 7 until electron-vite 6 is stable. MIT. HIGH. |
| electron-vite | 5.0.0 | Main/preload/renderer build with HMR, ESM main, externalize-deps | The scaffold node-llama-cpp's own Electron docs recommend ("prefer Electron Vite over Webpack"). Native deps must be marked external. MIT. HIGH. |
| @vitejs/plugin-react | **5.2.0** | React transform | 6.x requires Vite 8 (peer `^8.0.0`); 5.2.0 supports Vite 4-8. MIT. HIGH. |
| electron-builder | 26.x (26.17.0 is newest in the v26 line; npm `latest` tag still says 26.15.3, so **pin explicitly** and re-check at scaffold time) | Packaging: NSIS/MSI (Win), DMG/zip (mac), signing, notarization hooks, `asarUnpack`, fuses config, auto-update (electron-updater 6.8.9) | Most common choice for apps with heavy native `node_modules` (node-llama-cpp's template uses it). Do **not** use 27.0.0-alpha. MIT. |
| @electron/fuses | 2.1.3 | Flip security fuses at package time | Required hardening; see Security section. MIT. HIGH. |
| @electron/notarize | 3.1.2 | macOS notarization | MIT. HIGH. |

Code signing (note, not blocking for development):
- **Windows:** Microsoft **Artifact Signing** (renamed from Trusted Signing, GA January 2026): about $9.99/month, but individuals must be in the **US or Canada**; certificates are 24-hour, signatures are timestamped; **not EV**. SmartScreen reputation is not instantly granted by EV any more (reports from 2024-2026); plan for an "unrecognized app" warning on early releases. Alternative: OV certificate with cloud HSM (SignPath etc.). MEDIUM.
- **macOS:** Apple Developer ID (paid program) + hardened runtime + notarization. Every `.node`, `.dylib` and helper from node-llama-cpp, sherpa-onnx, onnxruntime-node, sharp must be signed with the same identity (electron-builder does this for files outside asar; verify with `codesign --verify --deep --strict` in the packaging smoke test). `utilityProcess.fork({ allowLoadingUnsignedLibraries })` exists as an escape hatch but needs special entitlements: avoid it by signing everything. MEDIUM.
- **Auto-update:** not required for v1. If added later: `electron-updater` (needs signed builds on both platforms; Electron 44.7 improved macOS autoUpdater resume/deltas).

### Process and worker architecture (HIGH for primitives, MEDIUM for specific placement)

| Primitive | Use for | Notes |
|-----------|---------|-------|
| `utilityProcess.fork()` (Electron API) | **One process per heavy engine**: `pdf-worker`, `vision-worker` (ORT layout/OCR), `llm-worker` (llama.cpp), `tts-worker` (sherpa/ORT), `db-worker` | Crash isolation (`exit` / `child-process-gone` events), OOM of one engine cannot take down the UI, `kill()` for cancellation, memory accounting via `app.getAppMetrics()`. Native N-API addons work in utility processes (the experimental `@electron/llm` 1.2.0 hosts node-llama-cpp in a utilityProcess). `stdin` must be `ignore`. |
| `MessageChannelMain` + `process.parentPort` | Main <-> worker RPC; optionally hand a port straight to the renderer for progress streams (audio chunks, token streams) | Main stays a thin broker and validator. Define one typed RPC contract package shared by all processes. |
| `worker_threads` / Piscina 5.3.2 (MIT) | Pure-JS CPU work (bidi reordering, normalization, hashing, chunking) *inside* a utility process | Do not put N-API model runtimes in worker_threads inside the main process. |
| Native child process (spawn) | Only if an engine has no N-API binding and is a one-shot CLI over stdio | **Never** a long-running HTTP server (`llama-server`, Ollama, LM Studio): violates the no-localhost-AI-server constraint. |
| p-queue 9.3.3 (MIT) | In-process concurrency limits inside a worker | Job state lives in SQLite, not in memory. |

Architecture rules that fall out of the research:
1. **Single model-residency manager** (in main or its own process): at most one large model resident at a time; unload before loading another; surfaces OOM as a typed error. Matches MODEL requirement "avoid loading unnecessary concurrent models".
2. **Never load two ONNX Runtimes in the same process.** `onnxruntime-node` and `sherpa-onnx` each bundle their own `onnxruntime` shared library; same-named DLL/dylib collisions are a known class of crash (Windows also ships a system `onnxruntime.dll`; LOW, from training knowledge, must be tested). Put them in separate utility processes and load by absolute path.
3. `better-sqlite3` and `node:sqlite` are **synchronous**: own the connection in a `db-worker` (single writer, WAL), or keep main-process queries strictly tiny. FTS5/vector scans over large libraries can take hundreds of ms.
4. **Network egress is not governed by Electron's `session` inside utility processes** (they use Node's `fetch`/`net`). Enforce "no hidden transfer" by (a) a single `net-gateway` module as the only importer of network APIs (lint rule), (b) allow-list (huggingface.co for explicit model downloads; search provider only after consent), (c) an E2E test that runs the whole happy path with the network blocked. MEDIUM.

### Database and search (HIGH for components, MEDIUM for Persian FTS behavior)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| better-sqlite3 | 13.0.3 (2026-08-05; SQLite 3.53.4 bundled) | Primary store | v13 is the first **N-API** release (no `prebuild-install`, ABI-stable across Electron versions, so no per-Electron rebuild). Electron 42/43 prebuild issues were fixed in v12.x. Includes FTS5, backup API. Needs Node >=22 (Electron 44 = Node 24). MIT. HIGH. |
| Kysely | 0.29.6 | Typed SQL query builder with built-in better-sqlite3 dialect | SQL-first: the canonical model needs STRICT tables, JSON columns, triggers, FTS5 and `vec0` virtual tables that ORMs cannot model. Use Kysely's `Migrator` with **hand-written, forward-only, numbered SQL migrations** plus `PRAGMA user_version`. MIT. MEDIUM (judgement call). |
| sqlite-vec | 0.1.9 (last published 2026-05-18) | Vector search (`vec0`, float32/int8/binary) | Loads as an extension into better-sqlite3; prebuilt optional packages for **windows-x64, darwin-arm64, darwin-x64** (no Windows arm64). Pre-v1 ("expect breaking changes"), brute-force scan: fine for a personal library (<~500k chunks at 1024-d, use int8/binary quantization or Matryoshka truncation beyond that). Hide behind a `VectorIndex` interface with a flat-Float32 fallback. MIT OR Apache-2.0. MEDIUM. |
| FTS5 (built into SQLite) | n/a | Keyword/lexical search | See Persian note below. |

Persian FTS5 (MEDIUM, must be spike-validated with Persian queries):
- FTS5 tokenizers (`unicode61`, `porter`, `trigram`) cannot be written in JS with better-sqlite3, so **normalize at write time** into a derived `search_text` column and index that (external-content FTS5 table), never the canonical text.
- Normalization: NFKC (kills Arabic presentation forms U+FB50-FDFF/FE70-FEFF), map Arabic yeh/kaf (ي ك) to Persian (ی ک), strip tatweel and harakat, **unify digits** (Arabic-Indic, Persian, ASCII) to one form, decide a ZWNJ (U+200C) policy once (`unicode61` treats it as a separator; either map it to a space for tokens or strip it, and apply the same function to queries).
- Run **two indexes**: `unicode61 remove_diacritics 2` (word search) and `trigram` (substring/prefix, compensates for ZWNJ/compound-spacing variance). Fuse results with RRF alongside vector search.
- Do not use `@sqlite.org/sqlite-wasm`, `libsql` (0.5.29/0.18 client) or LanceDB 0.40.0 as the primary store: they add a second engine without solving a stated problem. LanceDB is the contingency only if a measured scale test fails.
- `node:sqlite` is **Stability 1.2 (release candidate)** in Node 24 (extension loading via `allowExtension: true` is supported). Keep the DB behind an adapter so you can swap when it goes stable.

### PDF parsing and layout (shortlist + spike; MEDIUM-LOW on Persian behavior)

| Candidate | Version | License | Platforms | Evidence/notes |
|-----------|---------|---------|-----------|----------------|
| **pdfjs-dist** | 6.4.299 (2026-10-03) | Apache-2.0 | Pure JS; Node >=22.13 or >=24 | Default candidate. `getTextContent()` returns positioned items + font style info; outline; encryption; v6.3 improved non-embedded CID glyph mapping. Reported weaknesses on RTL: reads ToUnicode text **in content-stream order**, ignores ActualText, spacing at backward jumps, mirrored brackets (one secondary PR report; MEDIUM-LOW). Needs `@napi-rs/canvas` 1.0.10 (MIT, prebuilt N-API) for rasterization in Node. |
| **mupdf** (mupdf.js) | 1.28.1 (2026-09-06) | **AGPL-3.0-or-later or commercial** | WASM, ESM-only; Win/mac | `page.toStructuredText().asJSON()` gives blocks/lines/fonts/bboxes; `walk()` to chars; render to PNG; outline. One small single-author Arabic benchmark: MuPDF 88% sentence recovery on Chromium-generated PDFs vs PDFium 37%; on Word PDFs PDFium 90% vs MuPDF 80% (indicative only). Adopt only per D-LICENSE. |
| **PDFium via @hyzyla/pdfium** | 2.1.13 | MIT wrapper; PDFium BSD-3/Apache-2.0 (not re-verified) | WASM; Win/mac | Rendering confirmed; character-box/font APIs not confirmed from the README. Pairs with `sharp` 0.35.5 (Apache-2.0) for bitmaps. Single maintainer (about 190 stars): keep behind the adapter. |
| unpdf 1.8.1 (MIT) | | | | Convenience wrapper over pdf.js; no advantage over using pdf.js directly. Skip. |

**What every parser does wrong on Persian (design implication, MEDIUM):** PDFs from different producers store Persian as presentation forms, in visual order, with missing/wrong ToUnicode, or with lam-alef ligatures reversed; extractors differ in whether they return logical or visual order, and a second "fix" double-reverses text. Therefore:
1. Persist the **raw glyph stream** (char, bbox, font, page) as evidence, plus the normalized text; the canonical block text is *derived* and re-derivable when the algorithm version changes.
2. Reconstruct logical order from **geometry + Unicode Bidi (UAX #9)** using `bidi-js` 1.1.0 (MIT), after NFKC of presentation forms, rather than trusting any library's ordering. Detect "already logical" vs "visual" per run before reordering.
3. Run **dual-extractor arbitration** during the spike: extract with two parsers and compare against each other and against OCR of the rasterized region; disagreement lowers block quality status (matches the DOC requirement to mark low confidence instead of guessing).
4. Born-digital tables: geometry clustering of text-layer boxes first (deterministic, testable). Models only where that fails.

**Spike S-PDF (decides parser + order algorithm):** 40-60 PDFs across producers (Word, LibreOffice, LaTeX/XeLaTeX with Persian, Chromium `printToPDF` from Vazirmatn RTL HTML, InDesign-style books, scanned) with hand-verified ground-truth text. Score: exact-match of logical-order paragraphs, digit fidelity, ligature (لا/الله) correctness, bracket mirroring, mixed fa/en run order, table cell recall, wall time and peak RSS on a 500-page book, crash/hang behavior on the broken-PDF set. Pass policy defined before running.

### Layout analysis, tables, equations (shortlist; MEDIUM-LOW)

| Candidate | Role | License | Runtime / Node story | Notes |
|-----------|------|---------|----------------------|-------|
| **PP-DocLayoutV3** | Region detection + **reading order in one pass** (handles skewed/curved), 25 region types | Apache-2.0 (upstream card); community ONNX export (`phungpx/PP-DocLayoutV3-ONNX`) license unconfirmed | onnxruntime-node; pre/post-processing must be ported (npm `ppu-doclayout` 1.0.0, MIT, is an early wrapper for V2/V3) | Best fit for "layout without Python". RTL reading order quality unknown: must be evaluated on Persian two-column fixtures. |
| Docling "heron" layout models | Layout detection | License not confirmed | Python-only ONNX packaging found (`docling-onnx-models`); no Node port | Do not plan on it. |
| **PaddleOCR-VL-1.5** (0.9B VLM) | Text/table/formula/chart/seal recognition per cropped region via prompt prefixes (`OCR:`, `Table Recognition:`, `Formula Recognition:`) | Apache-2.0 (official GGUF repo card) | llama.cpp (mtmd) with separate `mmproj` GGUF; official `PaddlePaddle/PaddleOCR-VL-1.5-GGUF`. **Needs a binding with vision support, see inference section.** | Docs claim 109 languages incl. Persian (FAQ groups Persian with Arabic); no Arabic/Persian-specific accuracy published. Use `--temp 0`. |
| DocLayout-YOLO, Surya, Marker, MinerU | | AGPL / GPL / mixed | Python | Excluded (license and Python). |

Equations: PaddleOCR-VL formula prompt to LaTeX is the only no-Python candidate found; **fallback is mandatory**: keep the cropped region image + a "formula not reconstructed" flag (never invent LaTeX). Do not use pix2tex/texify (Python/PyTorch).

**Spike S-LAYOUT:** run PP-DocLayoutV3 (ORT) and PaddleOCR-VL-1.5 (llama.cpp) on the multi-column, table, math and scanned fixtures; measure reading-order accuracy (Kendall tau vs hand order), region IoU, table TEDS-style cell F1, formula exact-match, seconds/page and RAM on Windows x64 and macOS arm64.

### OCR for Persian + English (shortlist + eval; evidence is thin)

| Candidate | Version | License | Platforms | Persian evidence |
|-----------|---------|---------|-----------|------------------|
| **tesseract.js** (`fas`/`eng` traineddata) | 7.0.0 | Apache-2.0 | WASM; Win/mac | The ParisaOCR project self-reports Tesseract `fas_print` at **1.19% char error / 7.3% word error** on 750 printed Persian book lines, and 71.1% words found on a hard 74-page benchmark (self-reported, small; LOW-MEDIUM). Cheap baseline: use `tessdata_best`, hOCR/TSV output (formats are off by default since v6: request explicitly). |
| **PP-OCRv5 Arabic-script recognizer** (`arabic_PP-OCRv5_mobile_rec`) + PP-OCR detector via onnxruntime-node | ort 1.30.0; `ppu-paddle-ocr` 6.6.1 (MIT) | PaddleOCR is Apache-2.0 (model page states none) | Win x64/arm64 (CPU/DirectML), mac (CPU) | Covers Arabic, **Persian**, Uyghur, Urdu, Pashto, Kurdish... 81.27% on Paddle's own mixed Arabic-script set. v3 and v5 detector/recognizer must be paired consistently. ~7.7 MiB model. |
| **PaddleOCR-VL-1.5** via llama.cpp | see above | Apache-2.0 | Win/mac via llama.cpp | Heavier (~1.2 GB incl. projector at Q4/BF16 per one guide), but also gives tables/formulas. |
| ParisaOCR (Persian-specific PP-OCR detector + Kraken recognizer) | 0.1 preview | Apache-2.0 | Python/PyTorch for the recognizer | Self-reported 0.39% CER, 22 MB, printed Persian only, no tables/math. Recognizer is Kraken format: usable only if converted to ONNX (one-time offline conversion tooling is a gray area under "no Python": ADR needed). Treat as a reference point for what a Persian-tuned recognizer can reach. |
| Cloud/VLM APIs (Gemini etc.) | | | | Excluded (privacy). |

Selective OCR (requirement DOC): OCR only pages/regions where the text layer is absent, undecodable (no ToUnicode/Private Use Area), or arbitration-disagrees. **Spike S-OCR:** line crops at 150/200/300 DPI from (a) the Persian fixtures rendered from known text, (b) real scans, (c) a sample of the **Persian Pixel** synthetic set (343k pairs; license only described as "openly licensed": check before redistributing), with mixed Persian/English/digits/ZWNJ. Report CER, WER, ZWNJ error rate, digit error, ms/line and memory per engine on both OSes. Gate: no engine ships without this.

### Local LLM / VLM inference (runtime shortlist; models by eval)

**Key finding (verified from the node-llama-cpp issue tracker): node-llama-cpp has NO vision/multimodal (mmproj) support.** Issue #88 ("Pass an image as part of evaluation") has been open since Nov 2023, labelled roadmap/v4.0.0; #562 "Support multi-modal processing" was closed as a duplicate on 2026-02-24. Docs/feature list do not mention images. So VLM-based OCR/table/formula recognition cannot run through it.

| Runtime | Version | License | Windows / macOS | Role / verdict |
|---------|---------|---------|-----------------|----------------|
| **node-llama-cpp** | 3.22.1 (2026-09-28) | MIT | win-x64 (CPU, **Vulkan**, **CUDA** + `cuda-ext`), win-arm64, mac-arm64 (**Metal**), mac-x64 (CPU only). Prebuilt N-API optional packages; no CUDA/Vulkan toolchain needed at runtime | **Default for text generation, JSON-schema constrained decoding, function calling, embeddings, reranking** (`LlamaRankingContext`), Gemma 4 support since 3.19. Docs: run in the main process, mark as **external**, keep native binaries out of asar (`asarUnpack`), build each OS package on that OS's runner; arm64-on-x64 packaging works, x64-on-arm64 does not. Must be spiked inside a **utilityProcess** (the Electron docs only mention main; `@electron/llm` demonstrates utilityProcess). |
| **@fugood/llama.node** | 1.7.15 (2026-10-05) | MIT | mac arm64 (Metal), mac x64 (CPU), win x64/arm64 (CPU, Vulkan; CUDA x64 only) | The **only Node binding found with `initMultimodal()` image input** (libmtmd). Small community (about 21 stars) but actively published by BRICKS. Candidate VLM path (PaddleOCR-VL-1.5, Gemma 4 vision, Qwen-VL). Electron packaging not documented. |
| onnxruntime-node | 1.30.0 | MIT | Win x64/arm64 CPU + **DirectML**; mac x64/arm64 CPU (docs list no CoreML for Node); CUDA is Linux-only | Use for **small ONNX models** (layout, OCR, G2P, embeddings fallback), not for LLM chat. |
| @huggingface/transformers (Transformers.js) | 4.3.1 | Apache-2.0 | via onnxruntime-node | Good for small encoder models/embeddings/G2P T5; supports Qwen2.5/3-VL, SmolVLM, Florence2 architectures; LLM decoding is slower than llama.cpp and there is no Metal path in ORT Node. |
| onnxruntime-genai | no official npm package found (`npm view` empty) | | | **Not viable** for Node/Electron as of today. |
| MLC / WebLLM, Ollama, LM Studio, vLLM, llama-server | | | | **Excluded**: WebGPU-in-renderer breaks process isolation; the rest are localhost servers. |
| In-house N-API addon over libmtmd | | | | Last resort only if llama.node fails the spike (C++ code; conflicts with TypeScript-only intent). |

**Spike S-RUNTIME (decides one vs two llama.cpp bindings):** In a packaged build on clean Windows x64 (NVIDIA + non-NVIDIA/Vulkan) and macOS arm64: load GGUF in a utilityProcess, stream tokens over MessagePort, JSON-schema output, embeddings, VLM image prompt, cancel mid-generation, forced OOM, unload/reload cycle, signing/notarization of binaries. Prefer *one* binding if `@fugood/llama.node` reaches parity for text+embeddings; otherwise node-llama-cpp (text/embeddings) + llama.node (VLM only), each in its own utility process.

**Candidate model families (quality is NOT established: every row needs the Persian eval below):**

| Model | Sizes | License | Persian evidence found | Role |
|-------|-------|---------|------------------------|------|
| **Gemma 4** (2026-03-31; 12B Unified added 2026-06-03) | E2B, E4B, 12B, 26B-A4B (MoE), 31B | **Apache-2.0** (E4B card) | "35+ languages out of box, pre-trained on 140+"; Persian not named; E4B MMMLU 76.6%; multimodal image (+audio on E2B/E4B), 128K/256K ctx. One third-party multi-language test found Gemma 4 cleaner than Qwen3.5 on translation, Persian not shown. | Default general/extraction/lesson/translation candidate; also vision. |
| **TranslateGemma** (2026-01-15, Gemma 3 base) | 4B, 12B, 27B | **Gemma Terms of Use** (not Apache; gated on HF) | Evaluated on WMT24++ whose 55 pairs include **en->fa_IR** (verified on the dataset card); no Persian-specific score found; **2K token context**, fixed one-text prompt format with `source_lang_code`/`target_lang_code` | Translation specialist candidate (sentence/paragraph chunks). EN->FA only on paper: verify FA->EN and mixed-script. |
| **Qwen3.6** (Apr 2026) / Qwen3.5 | 27B dense, 35B-A3B MoE | Apache-2.0 | No Persian numbers found. One community test reported a larger Qwen followed instructions embedded in text being translated (prompt-injection risk, relevant to PDFs). | Alternative for extraction/synthesis at 24 GB+ machines. |
| Persian fine-tunes (e.g. PersianML Gemma-3n), Aya Expanse | | licenses unverified (Aya Expanse believed CC-BY-NC: **verify before any use**) | Mixed published Persian results (MELAC, Persian MMLU studies from 2025; none on 2026 models) | Evaluate only if base models fail. |

Hardware tiers (starting hypotheses; validate): 8 GB RAM -> Gemma 4 E2B/E4B Q4; 16 GB -> Gemma 4 12B Q4_K_M (reported to fit 16 GB); 24-32 GB+ -> Gemma 4 26B-A4B / Qwen3.6 35B-A3B (MoE is fast per token but memory-heavy); dense 27-31B only on 32 GB+ or 24 GB VRAM. Role registry in the app must record GGUF sha256, quant, llama.cpp/binding version and prompt version per eval result.

**Eval harness E-LANG (gate for the model registry):** human-referenced Persian technical-domain set (EN->FA and FA->EN, paragraph-level, with code/formula/number/identifier spans); deterministic checks (numbers, code, URLs, identifiers preserved; glossary term consistency; omission/addition detection via sentence alignment) + chrF++ implemented in TS + calibrated LLM-judge + native-speaker review on a sample. Include **document-embedded prompt-injection** cases ("ignore previous instructions" inside the source text): the model must translate it, not obey it. Never infer quality from "fits in memory".

### Embeddings (shortlist; HIGH on facts, MEDIUM on Persian ranking)

| Model | Dim / ctx | License | Evidence | Verdict |
|-------|-----------|---------|----------|---------|
| **BAAI/bge-m3** | 1024 / 8192; dense + sparse + multi-vector | **MIT** | **FaMTEB (Persian MTEB, EMNLP 2025 Findings) overall 59.1**, retrieval 43.4, STS 76.4; ONNX available; llama.cpp-compatible (XLM-R) | **Default candidate**: best-documented Persian evidence + permissive license. |
| Qwen3-Embedding-0.6B | up to 1024 (32-1024 MRL) / 32K | Apache-2.0 | MTEB multilingual mean 64.33; instruction-aware (put English instruction on queries); no FaMTEB figure found | Strong challenger; test. |
| EmbeddingGemma 2 (released **2026-10-06**) | 768 (MRL 512/256/128) / 8192 | Apache-2.0 (card) | 740M total (270M text backbone), "100+ languages", MTEB-multilingual v2 61.36; Persian not named; **3 days old** | Too new to adopt; re-check in 1-2 months. |
| jina-embeddings-v3 | | believed CC-BY-NC (unverified) | FaMTEB 59.28 | Excluded pending license check. |
| ParsBERT sentence models | | | FaMTEB 37.9 | Not competitive. |

Runtime: prefer GGUF through the same llama.cpp binding (no extra runtime); ONNX via Transformers.js is the fallback. Store embedding model id + version + sha256 with every vector (model switch must never destroy source data: re-embed lazily). **Spike S-EMBED:** Persian retrieval set over fixtures (fa->fa, fa->en cross-lingual, technical terms, numbers), nDCG@10/recall@20 for hybrid (FTS5 + vector) vs each alone.

### Text-to-speech (runtime shortlist + voice license/eval table; Persian naturalness is UNPROVEN)

Runtimes:

| Runtime | Version | License | Windows / macOS | Verdict |
|---------|---------|---------|-----------------|---------|
| **sherpa-onnx-node** | 1.13.8 (2026-09-10) | Apache-2.0 | win-x64, win-ia32, darwin-arm64, darwin-x64 (optional deps verified). **No Windows arm64 package.** N-API, ships its own onnxruntime | Default runtime candidate: supports VITS/Piper, Kokoro, Matcha, KittenTTS, Supertonic, Pocket-TTS(en), ZipVoice in Node. Node examples cover English/Chinese/German only: Persian config is unproven. **espeak-ng (GPL) dependency** today; upstream plans to remove it in 2.0.0: **pin 1.13.x**, do phonemization in our own adapter, test 2.0 when released. Also ships **Persian NeMo CTC ASR models (1.13.5)**: usable for automated round-trip intelligibility checks. |
| onnxruntime-node (own VITS runner) | 1.30.0 | MIT | see above | Fully license-clean fallback: feed phoneme IDs from the voice's `.onnx.json` yourself; more code, total control over G2P. |
| Transformers.js + kokoro-js | 4.3.1 / 1.2.1 (Apache-2.0) | | | English only; phonemizer dependency to check. |
| Piper binary / piper1-gpl | | GPL-3.0 (active fork) | | Excluded (child process + GPL); use the voice models, not the app. |

Voices (licenses must be recorded per voice in the NOTICE/registry):

| Voice / model | Language | License | Evidence / risk | Verdict |
|---------------|----------|---------|-----------------|---------|
| **Mana-Persian-Piper** (`MahtaFetrat`, `fa_IR-mana-medium.onnx`, 63.5 MB, LFS sha256 `e390c0e74ba7...f126`) | fa | **MIT** model; training data Mana-TTS **CC0** (114+ h, single speaker, 44.1 kHz) | No listening evaluation published. Card advises context-aware G2P + **ezafe** disambiguation for good pronunciation. | **Primary Persian candidate** (license-clean). |
| rhasspy/piper-voices `fa_IR`: `amir` (CC0 data from datacula, 22.05 kHz, fine-tuned from lessac), `ganji`, `ganji_adabi`, `reza_ibrahim` | fa | CC0 for amir (card); others not checked | Voices are real named people (podcast host, Ahmad Ganji) | Consent/provenance review needed before bundling. |
| `gyro` voice | fa | n/a | **Described as based on Microsoft Edge "Farid" voice** | **Exclude** (derivative of a commercial TTS output). |
| pocket-tts-farsi-v2 (110M; ONNX ports exist) | fa | **CC-BY-NC-4.0** | Best *measured* so far: mean WER 0.58 vs 2.05 for v1 (Whisper floor 0.27), UTMOS 3.11, blind listening test favored v2; but needs separate Persian G2P (Homo-GE2PE T5, MIT) **and digit spelling** (digits are silently dropped), chunks <=~16 tokens, 0-1/300 runaways, no punctuation/pauses, voice prompts <=5 s, cloning | Technically promising; **license blocks commercial use** (D-COMMERCIAL). |
| ParsVoice-XTTS (XTTS-v2 fine-tune) | fa | Coqui CPML (non-commercial) | Self-reported MOS 3.6/5; PyTorch, no ONNX | Exclude (license + Python). |
| MMS-TTS `fas` | fa | CC-BY-NC (training knowledge, unverified) | | Exclude. |
| SadeghK/persian-text-to-speech | fa | Apache-2.0 label | Voices of identifiable individuals; datasets not stated | Provenance review. |
| **Kokoro-82M v1.0** | en (8 languages, **no Persian**) | **Apache-2.0** (54 voices; trained on permissive/public-domain/synthetic data per card) | Widely regarded as the best small English voice; English G2P path in sherpa-onnx uses espeak-ng today | **English default candidate**. |
| Supertonic (66M, ONNX) | en only | code MIT, **model OpenRAIL-M** | RTF about 0.012-0.015 on M4 Pro CPU | Alternative/fast path; OpenRAIL use restrictions must be surfaced in NOTICE. |
| Pocket TTS (Kyutai, 100M) | en/fr/de/pt/it/es | CC-BY-4.0, gated; use restrictions on cloning/impersonation | ~6x real time on 2 M4 cores | Alternative English; no Persian. |
| Piper English voices | en | per-voice (check each MODEL_CARD) | | Fallback only. |

Required Persian TTS front-end (own TypeScript, TDD-able, no Python): normalization of digits/dates/units/symbols to spoken words (`@persian-tools/persian-tools` 4.0.4, MIT, provides number-to-words; wrap and unit-test), Arabic/Persian letter unification, ZWNJ handling, formula/code read-out templates, **script-span segmentation** (Persian spans -> Persian voice, Latin technical terms -> English voice or transliteration lexicon, joined with short crossfades), sentence chunking sized to the model, and a G2P adapter (espeak-style rules or Homo-GE2PE via ONNX; **ezafe is the main quality limiter**). `arabic-reshaper` (npm) is **GPL-3.0**: do not use (reshaping is also the wrong direction for TTS input).

**Spike S-TTS (decides runtime + voices):** 60-sentence blind set (technical terms fa+en, numbers/years/percent, code identifiers, long paragraphs, ezafe-heavy sentences). Automatic: ASR round-trip CER using sherpa-onnx's Persian CTC model; real-time factor, first-chunk latency, RAM on both OSes. Human: at least 3 native listeners, blind A/B + 5-point naturalness + "mispronounced term" counts. Pass/fail thresholds written first; "listed as Persian" never counts as evidence (PROJECT requirement).

### UI, typography, i18n (HIGH)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Tailwind CSS (+ `@tailwindcss/vite`) | 4.3.3 | Styling with **logical properties** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `text-start`) | Set `<html lang="fa" dir="rtl">`; never use `left/right` utilities. MIT. (`@tailwindcss/vite` peers Vite ^5.2-^8.) |
| React Aria Components | 1.22.0 | Accessible primitives with first-class RTL/i18n (`I18nProvider`, `fa-IR`, Persian calendar via `Intl`) | Apache-2.0. Chosen over Radix (`radix-ui` 1.7.0, needs `DirectionProvider`) for keyboard/focus/a11y depth (UX requirement). |
| @fontsource-variable/vazirmatn | 5.3.0 (Vazirmatn font v33.0.3) | Persian UI/reader font, bundled locally (no CDN) | **OFL-1.1**: include license in NOTICE. Vazirmatn includes Latin and Persian digits; test Persian vs Latin digit rendering. |
| KaTeX | 0.19.0 | Equations | MIT; fast, synchronous, bundle its fonts; render inside `dir="ltr"` islands; emit MathML for a11y. |
| MathJax | 4.1.3 (`@mathjax/src`) | Fallback for LaTeX coverage KaTeX lacks | Apache-2.0; only load on demand. |
| Shiki | 4.5.0 (`@shikijs/rehype` 4.5.0) | Code blocks | MIT; code is always `dir="ltr"` with `unicode-bidi: isolate`. |
| react-markdown 10.1.0 + remark-math 6.0.0 + rehype-katex 7.0.1 | | Render **LLM output**; canonical document blocks render from structured data via React elements, **not HTML strings** | MIT. Avoid `dangerouslySetInnerHTML`; DOMPurify 3.4.16 only if HTML is unavoidable. |
| @tanstack/react-virtual | 3.14.13 | Windowing for long reflowable chapters | MIT. Test scroll-anchor stability with RTL. |
| zustand 5.0.15 + @tanstack/react-query 5.104.1 | | UI state; IPC-backed server-state cache | MIT. |
| i18next 26.4.2 + react-i18next 17.0.16 | | Persian-first UI strings, ICU plurals via `Intl.PluralRules` | MIT. (Lingui 6.9.1 is an equally valid compile-time alternative.) |
| bidi-js 1.1.0 | | UAX #9 in TS for PDF visual-order reconstruction | MIT. |

Bidi rules for the reader: wrap each block in `dir="auto"` (or the block's stored base direction), isolate inline Latin/code with `<bdi>`/`unicode-bidi: isolate`, keep numbers/units attached with U+200E/U+200F marks only in *derived* render text, and never mutate canonical text for display.

### Spaced repetition (HIGH)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| **ts-fsrs** | 5.4.2 (published 2026-10-09) | FSRS-6 scheduler (`fsrs()`, `createEmptyCard`, `repeat`, `next`) | MIT, Node >=20, ESM+CJS. Store the **immutable review log** and treat card state as a replayable pure function of (log, parameters, algorithm version): enables TDD, re-optimization and "predicted recall" (retrievability) display with honest uncertainty. Parameter optimizer is a separate package (`@open-spaced-repetition/binding`; native, untested here): ship default parameters in v1, defer optimization. |

### Testing and evaluation (HIGH for tools, MEDIUM for Electron-E2E caveat)

| Tool | Version | License | Use |
|------|---------|---------|-----|
| Vitest | 5.0.3 | MIT | Unit/integration/TDD (needs Node ^22.12/^24; Vite ^6.4-8). Domain cores (job state machine, provenance, ordering transforms, FSRS, migrations) live in plain TS packages with no Electron imports. |
| Playwright (`@playwright/test`) | 1.64.0 | Apache-2.0 | Electron E2E via `_electron.launch` (**still marked experimental**). It requires the `EnableNodeCliInspectArguments` fuse **not** to be disabled, so E2E runs against a *test build* with that fuse on; the production fuse set is verified separately by a packaging smoke test (inspect fuses with `@electron/fuses`). Native dialogs are not intercepted: stub in main via `electronApp.evaluate`. |
| playwright-bdd | 9.2.1 | MIT | Gherkin ATDD on the Playwright runner (single runner, traces/videos). Preferred over Cucumber.js 13.3.0 (separate runner, no Playwright traces). |
| @amiceli/vitest-cucumber | 8.0.0 | ISC | Optional: Gherkin scenarios for non-UI acceptance (pipeline, recovery, cancellation) inside Vitest. |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | Automated a11y checks (not a substitute for manual keyboard/screen-reader review). |
| fastest-levenshtein | 1.0.16 | MIT | CER/WER primitives for OCR/TTS-ASR evals; implement chrF/term-consistency in TS. |
| promptfoo | 0.124.1 | MIT | Optional LLM-judge/matrix runner; disable telemetry; keep the harness runnable fully offline. Default is a small in-repo TS eval runner so results (model sha256, prompt version, fixture hash, metric) are stored with provenance. |

Fixtures: Git LFS; license-clean/redistributable only; generate Persian PDFs deterministically with `webContents.printToPDF` from RTL HTML (Chromium/Skia producer) plus real Word/LibreOffice/XeLaTeX exports; hand-verified ground truth stored beside each PDF. Playwright E2E for the packaged installer on clean Windows and macOS VMs is a release gate, separate from CI unit runs.

### IPC validation and security (HIGH)

| Item | Choice | Notes |
|------|--------|-------|
| Schemas | **zod 4.6.5** (MIT) in a shared `contracts` package; valibot 1.5.0 is a smaller alternative | Validate *every* IPC payload in main (never trust renderer types) and every worker RPC. Version contracts; derive TS types from schemas. No generated-RPC framework (electron-trpc 0.7.1 is unmaintained-looking: skip), use a ~100-line typed channel registry. |
| Renderer | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, minimal preload exposing a few typed methods | Electron security checklist. |
| Origin | Serve the UI from a custom `app://` protocol (`protocol.handle`), not `file://`; validate `event.senderFrame` origin on every `ipcMain.handle`; block `will-navigate`, deny `setWindowOpenHandler`; permission request/check handlers deny by default | |
| CSP | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'` via `onHeadersReceived`; no `unsafe-eval`/`unsafe-inline` (verify KaTeX/Shiki output works under it) | Loosen `connect-src` only in the explicit web-research window. |
| Fuses | `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off (prod), `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `GrantFileProtocolExtraPrivileges` off | `RunAsNode` off means workers must use `utilityProcess`, not `ELECTRON_RUN_AS_NODE`. |
| Untrusted content | PDF text and web pages are **untrusted prompt input**: never let model output call tools with side effects; constrained JSON schema outputs; the web tool process has no DB or file access | PDF-borne prompt injection is a first-order risk for this product. |

### Model download and integrity (MEDIUM-HIGH)

- Implement a **first-party downloader** (Node 24 global `fetch`/undici 8.11.2): HTTP `Range` resume into `<file>.part` + sidecar JSON (etag, bytes), streaming SHA-256 (`crypto.createHash`), atomic rename, disk-space precheck, per-host allow-list, retry with backoff, cancellation via `AbortController`.
- **Pin by commit, verify by embedded hash:** registry JSON (versioned, shipped in the app) lists `repo`, **commit SHA**, file, size and **sha256**, with the URL `https://huggingface.co/<repo>/resolve/<commit>/<file>`. Do not trust a hash fetched at runtime from the same host. Hub tree API (`/api/models/<repo>/tree/<rev>`) exposes `lfs.oid` (SHA-256) for LFS files (verified on the Mana voice: only the `.onnx` has an LFS oid; small JSON files need a registry-embedded hash too). `@huggingface/hub` 2.17.6 (MIT) is optional tooling for registry authoring.
- Many valuable repos are **gated** (TranslateGemma, Pocket TTS require accepting terms/contact info): either choose ungated mirrors (third-party GGUF re-uploads: record provenance + hash) or host project-owned copies if redistribution terms permit; gated flows need a user token/consent UX. Decide per model in the registry ADR.
- node-llama-cpp's `ipull`-based downloader (ipull 4.0.3) is a fallback for GGUF only; it does not remove the need for hash pinning.
- Downloads are user-initiated and disclosed (they reveal an IP to huggingface.co): consistent with the privacy constraint if explicit.

## Native dependency support matrix (Windows x64/arm64, macOS arm64/x64)

| Dependency | Win x64 | Win arm64 | mac arm64 | mac x64 | Basis |
|------------|---------|-----------|-----------|---------|-------|
| better-sqlite3 13 (N-API) | yes (Electron prebuilds) | unverified | yes (assumed prebuild) | yes (assumed) | release notes (Win/Electron fixes); arm64/mac not individually verified |
| sqlite-vec 0.1.9 | yes | **no** | yes | yes | npm optionalDependencies |
| node-llama-cpp 3.22.1 | yes (CPU/Vulkan/CUDA) | yes (CPU) | yes (Metal) | CPU only | npm optionalDependencies |
| @fugood/llama.node 1.7.15 | yes (Vulkan/CUDA) | yes (Vulkan) | yes (Metal) | CPU only | repo README |
| onnxruntime-node 1.30.0 | yes (CPU/DirectML) | yes (CPU/DirectML) | yes (CPU) | yes (CPU) | official ORT docs |
| sherpa-onnx-node 1.13.8 | yes | **no** (Rust arm64 only) | yes | yes | npm optionalDependencies |
| sharp 0.35.5 / @napi-rs/canvas 1.0.10 | yes | assumed | assumed | assumed | not re-verified here |
| mupdf, pdfjs-dist, tesseract.js, PDFium-wasm | yes | yes | yes | yes | WASM/JS |

Recommended v1 support statement: **Windows 11 x64** and **macOS 13+ on Apple Silicon (arm64)**. Windows arm64 and Intel macs are "best effort / untested, reported as such" (Intel mac has no GPU inference and sherpa/sqlite-vec arm gaps on Windows arm64). Confirm with product: dropping Intel macs and Windows arm64 is a scope statement. Each OS must be built and smoke-tested on its own runner (node-llama-cpp does not support cross-packaging).

## Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| ESLint + typescript-eslint | 10.12.0 + 8.71.1 | Lint incl. type-aware rules (`no-floating-promises`, essential in async/IPC code) | Requires TS <6.1: this is why TypeScript stays on 6.0.x. Biome 2.5.15 is the alternative if type-aware lint is dropped. |
| @electron/rebuild | 4.2.1 | Only if a dependency lacks N-API prebuilds | Avoid needing it: prefer N-API packages (all primary deps above are). |
| Git LFS | | Fixtures and eval corpora | |
| GitHub Actions matrix | windows-latest, macos-latest (arm64) | CI per OS, packaging job per OS | CI green is not proof of installer behavior: keep the clean-VM smoke test. |

## Installation

```bash
# Runtime (illustrative pins; resolve with exact versions in the lockfile)
npm install electron@44.7.0 react@19.3.0 react-dom@19.3.0 zod@4.6.5 kysely@0.29.6 \
  better-sqlite3@13.0.3 sqlite-vec@0.1.9 pdfjs-dist@6.4.299 @napi-rs/canvas@1.0.10 bidi-js@1.1.0 \
  node-llama-cpp@3.22.1 onnxruntime-node@1.30.0 sherpa-onnx-node@1.13.8 tesseract.js@7.0.0 \
  sharp@0.35.5 ts-fsrs@5.4.2 @persian-tools/persian-tools@4.0.4 piscina@5.3.2 p-queue@9.3.3 \
  react-aria-components@1.22.0 @fontsource-variable/vazirmatn@5.3.0 katex@0.19.0 shiki@4.5.0 \
  react-markdown@10.1.0 remark-math@6.0.0 rehype-katex@7.0.1 @tanstack/react-virtual@3.14.13 \
  zustand@5.0.15 @tanstack/react-query@5.104.1 i18next@26.4.2 react-i18next@17.0.16

# Spike-only / conditional (do NOT add until the spike decides)
#   @fugood/llama.node@1.7.15   (VLM path)       mupdf@1.28.1   (only per D-LICENSE)
#   @hyzyla/pdfium@2.1.13       (PDFium option)  ppu-paddle-ocr@6.6.1, ppu-doclayout@1.0.0 (ORT OCR/layout wrappers)
#   @huggingface/transformers@4.3.1 (small ONNX models: G2P, embeddings fallback)

# Dev
npm install -D typescript@~6.0.3 vite@^7.3.7 electron-vite@5.0.0 @vitejs/plugin-react@5.2.0 \
  tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 electron-builder@26.17.0 @electron/fuses@2.1.3 \
  @electron/notarize@3.1.2 vitest@5.0.3 @playwright/test@1.64.0 playwright-bdd@9.2.1 \
  @axe-core/playwright@4.13.0 eslint@10.12.0 typescript-eslint@8.71.1 fastest-levenshtein@1.0.16
```

Native modules must be `external` in electron-vite's main/utility builds and listed in `asarUnpack` (node-llama-cpp docs: never bundle it, keep binaries outside asar).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| electron-vite 5 + electron-builder 26 | Electron Forge 8.0.1 (+ `plugin-vite`) | Forge's Vite plugin is still labelled **experimental**; choose Forge only if you want its maker/publisher ecosystem and accept churn. |
| Vite 7 / electron-vite 5 | Vite 8 / electron-vite 6.0.0-beta.7 | After electron-vite 6 is stable (beta now, Rolldown-based config bundling). |
| better-sqlite3 | `node:sqlite` | When it leaves RC (Stability 1.2 now) and you want zero native dependency; keep behind the DB adapter. |
| Kysely + SQL migrations | Drizzle ORM 0.45.4 (stable) / 1.0 RC | If the team wants schema-first codegen; 1.0 is still RC (beta.22/rc.4 tags) and virtual tables need raw SQL anyway. |
| sqlite-vec | LanceDB 0.40.0 | Only if measured vector scale exceeds brute-force budgets. |
| pdf.js (permissive default) | MuPDF 1.28.1 | If Danesh is AGPL-3.0 (D-LICENSE) and the spike shows better Persian order/geometry. |
| node-llama-cpp (+ llama.node if needed) | Transformers.js / ORT for generation | Only for small ONNX-native models; slower, no Metal. |
| bge-m3 | Qwen3-Embedding-0.6B, EmbeddingGemma 2 | If the Persian retrieval eval ranks them higher. |
| sherpa-onnx | Own ORT VITS runner | If espeak-ng/GPL cannot be accepted or sherpa 2.0 breaks Piper Persian. |
| playwright-bdd | Cucumber.js 13.3.0 | If non-UI BDD must run without Playwright. |
| zod 4 | valibot 1.5.0 | If renderer bundle size matters more than ecosystem/tooling. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Anything Python (Docling, Surya, Marker, MinerU, pix2tex/texify, Kraken/PyTorch at runtime, PaddlePaddle runtime, PyMuPDF, XTTS/Coqui) | Constraint: no Python | ONNX Runtime / llama.cpp / WASM engines behind TS adapters |
| `llama-server`, Ollama, LM Studio, vLLM, any HTTP AI sidecar | Constraint: no localhost AI servers; port exposure and lifecycle risk | node-llama-cpp / llama.node in a utilityProcess |
| WebLLM / MLC / WebGPU inference in the renderer | No process isolation, GPU-process stalls, harder resource bounds | Utility-process engines |
| `onnxruntime-genai` for Node | No official JS/Node package found on npm | llama.cpp (LLM), ORT (small models) |
| TypeScript 7.0 with typescript-eslint/ts-morph tooling | No stable API until 7.1; peer range `<6.1.0` | TypeScript 6.0.x (7.x `tsc` for CI type-check only) |
| Vite 8 / `@vitejs/plugin-react` 6 with electron-vite 5 | Peer-dependency mismatch | Vite 7.3.x + plugin-react 5.2.0 |
| electron-builder 27 alpha | Alpha | 26.x |
| electron-store/JSON files for domain data | No migrations, no integrity | SQLite |
| pdf-lib (last release 2022), pdf2pic (needs GraphicsMagick/Ghostscript) | Stale / external binaries | pdf.js + `@napi-rs/canvas`, or PDFium-wasm |
| `arabic-reshaper` (GPL-3.0) and any GPL/AGPL lib before D-LICENSE | License contamination | Own normalization + `bidi-js` |
| Persian voices/models under CC-BY-NC/CPML or derived from commercial voices (`gyro`, pocket-tts-farsi-v2, ParsVoice-XTTS, MMS) in a commercial build | License / provenance | Mana-Persian-Piper (MIT/CC0) unless D-COMMERCIAL says non-commercial |
| edge-tts and other online TTS/OCR/LLM APIs | Hidden data transfer | Local engines |
| `nodeIntegration`, `remote`, `file://` origin, disabled `webSecurity`, `ELECTRON_RUN_AS_NODE` | Security constraint | Sandboxed renderer + typed IPC + utilityProcess |
| Trusting a library's text order or one extractor's output as ground truth | Persian PDFs break every extractor differently | Raw glyph evidence + geometry/bidi reconstruction + cross-check |
| Quality claims from "fits in memory", "listed as Persian", or vendor benchmarks | Violates MODEL/AUDIO requirements | Per-task evals on own fixtures |

## Stack Patterns by Variant

**If Danesh is released under a permissive license:**
- pdf.js (+ optional PDFium) only; no MuPDF; no espeak-ng-based phonemizer: own G2P/lexicon adapter, sherpa-onnx pinned to 1.13.x with phonemes supplied by us (or own ORT VITS runner), watch sherpa-onnx 2.0.
- Because the espeak-ng-free Persian pipeline is the least-proven part, make S-TTS an early spike (before the Audio phase).

**If Danesh is released under AGPL-3.0/GPL-3.0:**
- MuPDF and espeak-ng become compliant options; still keep them behind adapters so a license change does not force a rewrite. Ship source + notices in-app.

**If a machine has <=8 GB RAM or no discrete GPU:**
- Gemma 4 E2B/E4B Q4, sequential model residency, OCR with Tesseract/PP-OCR only (skip the VLM), TTS on CPU (Piper-class models run faster than real time), embeddings with a 0.6B model and int8 vectors.

**If a model/voice download is gated or requires acceptance:**
- Surface terms in the model manager, store acceptance record, and never bundle the weights in the installer (keeps installer small and license-clean).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| electron@44.7.0 (Node 24.18.1, Chromium 152) | `@types/node@^24`, better-sqlite3 13 (N-API), pdfjs-dist 6.4 (needs Node >=22.13), Vitest 5 (Node ^22.12/^24) | Electron 44 needs macOS 13+; no win32-ia32. |
| electron-vite@5.0.0 | vite ^5/^6/^7, Node ^20.19 or >=22.12, optional `@swc/core` | Vite 8 only with electron-vite 6 beta. |
| @vitejs/plugin-react@5.2.0 | vite 4-8 | 6.x needs vite ^8. |
| vitest@5.0.3 | vite ^6.4/^7/^8 | |
| @tailwindcss/vite@4.3.3 | vite ^5.2-^8 | |
| typescript@6.0.x | typescript-eslint@8.71.1 (`>=4.8.4 <6.1.0`), eslint ^8.57/^9/^10 | TS 7.x breaks API-dependent tools until 7.1. |
| node-llama-cpp@3.22.1 | Node >=20, Gemma 4 (>=3.19) | Must be external + unpacked from asar. |
| sherpa-onnx-node@1.13.8 | pin `~1.13`; 2.0.0 will be breaking (espeak-ng removal) | Own onnxruntime inside; isolate in its own process. |
| @huggingface/transformers@4.3.1 | onnxruntime-node 1.30.0, sharp ^0.35.4 | Keep one ORT per process. |
| playwright-bdd@9.2.1 | @playwright/test >=1.44 (1.64.0 current) | Electron support experimental; test builds keep `EnableNodeCliInspectArguments`. |

## Open items for roadmap and ADRs

1. D-LICENSE and D-COMMERCIAL decisions (above) gate MuPDF, espeak-ng, and every voice choice.
2. All **engine ADRs need spikes** (S-PDF, S-LAYOUT, S-OCR, S-RUNTIME, S-EMBED, S-TTS, E-LANG); none of them has public Persian head-to-head evidence. The brief's phase order is consistent with this if spikes are scheduled at the *start* of the phase that consumes them (S-TTS earlier than Phase 8; S-RUNTIME before Phase 4 because VLM-based layout/OCR depends on it).
3. Verified gaps, stated plainly: no Persian-specific numbers found for Gemma 4, Qwen3.5/3.6, TranslateGemma, EmbeddingGemma 2, Qwen3-Embedding, PP-DocLayoutV3, PaddleOCR-VL on Persian; pdf.js/MuPDF/PDFium Persian behavior rests on indirect Arabic-script reports; sherpa-onnx has no published Persian Node example; Windows arm64 and Intel mac coverage is incomplete; `onnxruntime-genai` JS and CoreML-in-Node were not found (absence of evidence, not proof).
4. Packaging smoke test must check on clean VMs: all native binaries load from `app.asar.unpacked`, signatures/notarization valid, GPU backend selection (Vulkan/CUDA/Metal/DirectML) works or degrades gracefully, no network traffic without consent.

## Sources

Registry-verified on 2026-10-09 (`npm view`, HIGH): electron 44.7.0 (+ publish times), electron-vite 5.0.0 / 6.0.0-beta.7 peerDependencies, electron-builder dist-tags, @electron-forge 8.0.1, vite 8.3.4/7.3.7, @vitejs/plugin-react 6.1.2/5.2.0 peers, TypeScript dist-tags and typescript-eslint peers, better-sqlite3 13.0.3 engines, sqlite-vec optionalDependencies, node-llama-cpp 3.22.1 optionalDependencies, sherpa-onnx-node 1.13.8 optionalDependencies, @fugood/llama.node 1.7.15, onnxruntime-node 1.30.0, @huggingface/transformers 4.3.1, pdfjs-dist 6.4.299 engines, mupdf 1.28.1 license, ts-fsrs 5.4.2, vitest 5.0.3 peers, playwright 1.64.0, playwright-bdd 9.2.1, and all other versions/licenses listed.

Primary pages read (MEDIUM-HIGH):
- Electron 44 release post https://www.electronjs.org/blog/electron-44-0 ; utilityProcess https://www.electronjs.org/docs/latest/api/utility-process ; security checklist https://www.electronjs.org/docs/latest/tutorial/security ; Playwright Electron https://playwright.dev/docs/api/class-electron ; Forge Vite plugin https://www.electronforge.io/config/plugins/vite
- node-llama-cpp Electron guide https://node-llama-cpp.withcat.ai/guide/electron ; guide index https://node-llama-cpp.withcat.ai/guide/ ; releases https://github.com/withcatai/node-llama-cpp/releases ; issues #88/#562 https://github.com/withcatai/node-llama-cpp/issues?q=is%3Aissue+vision+OR+multimodal+OR+mmproj
- llama.cpp multimodal docs https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md ; @fugood/llama.node https://github.com/mybigday/llama.node
- onnxruntime Node https://onnxruntime.ai/docs/get-started/with-javascript/node.html ; Transformers.js https://huggingface.co/docs/transformers.js/en/index
- Node sqlite https://nodejs.org/docs/latest-v24.x/api/sqlite.html ; better-sqlite3 releases https://github.com/WiseLibs/better-sqlite3/releases ; sqlite-vec https://github.com/asg017/sqlite-vec
- pdf.js releases https://github.com/mozilla/pdf.js/releases ; mupdf.js https://github.com/ArtifexSoftware/mupdf.js ; @hyzyla/pdfium https://github.com/hyzyla/pdfium ; tesseract.js https://github.com/naptha/tesseract.js
- PaddleOCR PP-OCRv5 multilingual https://www.paddleocr.ai/main/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html ; PaddleOCR-VL https://www.paddleocr.ai/latest/en/version3.x/algorithm/PaddleOCR-VL/PaddleOCR-VL.html ; GGUF card https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5-GGUF ; PP-DocLayoutV3 https://huggingface.co/PaddlePaddle/PP-DocLayoutV3 ; ParisaOCR https://github.com/givia/ParisaOCR ; Persian Pixel https://huggingface.co/papers/2607.20385
- Gemma releases https://ai.google.dev/gemma/docs/releases ; Gemma 4 E4B https://huggingface.co/google/gemma-4-E4B-it ; TranslateGemma https://huggingface.co/google/translategemma-12b-it ; WMT24++ dataset card https://huggingface.co/datasets/google/wmt24pp ; EmbeddingGemma 2 https://huggingface.co/google/embeddinggemma-2 ; Qwen3-Embedding https://huggingface.co/Qwen/Qwen3-Embedding-0.6B ; bge-m3 https://huggingface.co/BAAI/bge-m3 ; FaMTEB https://arxiv.org/abs/2502.11571
- TTS: Mana-Persian-Piper https://huggingface.co/MahtaFetrat/Mana-Persian-Piper ; Mana-TTS https://huggingface.co/datasets/MahtaFetrat/Mana-TTS ; piper-voices amir card https://huggingface.co/rhasspy/piper-voices/blob/main/fa/fa_IR/amir/medium/MODEL_CARD ; pocket-tts-farsi-v2 https://huggingface.co/mehdi-hf/pocket-tts-farsi-v2 and ONNX port https://huggingface.co/mrfakename/pocket-tts-farsi-v2-ONNX ; ParsVoice-XTTS https://huggingface.co/MohammadJRanjbar/ParsVoice-XTTS ; Kokoro https://huggingface.co/hexgrad/Kokoro-82M ; Supertonic https://huggingface.co/Supertone/supertonic ; Pocket TTS https://huggingface.co/kyutai/pocket-tts ; sherpa-onnx releases https://github.com/k2-fsa/sherpa-onnx/releases and issue #3731 https://github.com/k2-fsa/sherpa-onnx/issues/3731 ; sherpa Node examples https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-addon-examples
- ts-fsrs https://github.com/open-spaced-repetition/ts-fsrs

Secondary / lower confidence (WebSearch; LOW per seam, used only as leads): Arabic-PDF extraction comparisons (PDFium/MuPDF/pdf.js reports) via GitHub PRs/issues; TypeScript 7 ecosystem coverage (InfoQ, linuxiac, DEV posts); Windows Artifact Signing coverage (devclass, Microsoft Learn Q&A); Gemma 4/Qwen3.6 comparisons and licensing summaries; Persian OCR/LLM benchmark searches (no head-to-head found).

---
*Stack research for: local-first Persian-first Electron learning environment*
*Researched: 2026-10-09*
