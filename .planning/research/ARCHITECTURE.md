# Architecture Research

**Domain:** Local-first, Persian-first (RTL) Electron + React + TypeScript desktop learning environment with a PDF semantic-reconstruction pipeline, embedded local AI (LLM / OCR / layout / embeddings / TTS), a concept knowledge model, grounded lesson generation, and FSRS learning evidence.
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall (see per-section tags)

Confidence tagging used below:
- **[HIGH]** Verified against official docs fetched during this research (Electron `utilityProcess`, Node `node:sqlite`).
- **[MEDIUM]** Established architecture practice and my synthesis; consistent with sources but not verified on Danesh's target platforms.
- **[LOW / SPIKE]** Tool-specific behavior I could not verify; must be settled by a hands-on spike before the owning phase commits. Note: the GSD confidence seam rates plain web search/fetch results as LOW unless cross-verified, so every tool-version claim below is marked with how it was checked.

---

## Standard Architecture

### The one-paragraph answer

Build a **modular monolith with a strict four-tier process topology**: a thin **Main** process (window lifecycle, security policy, process supervisor, port broker), a sandboxed **Renderer** (React UI, no Node), one long-lived **Core** `utilityProcess` that owns *all* domain logic, the **single SQLite writer**, the durable job scheduler and the resource governor, and a fleet of disposable **Engine Host** processes (PDF, OCR/layout, LLM, embeddings, TTS, and a separate network-egress broker) that are *pure compute*: they receive a request, return a result, and never touch the database. Every expensive operation is a **durable task row** in SQLite; results and the task's "done" flag are committed in one transaction, so a crash at any moment loses at most the in-flight task, never verified output. Data is split into **immutable evidence** (originals, raw extraction, review log, manual corrections), **versioned derived artifacts** (blocks, translations, concepts, lessons, audio) carrying a *producer snapshot* and an *input fingerprint*, and **rebuildable indexes** (embeddings, FTS). A model switch only changes a registry pointer; it can mark derived artifacts *superseded* but cannot reach the evidence tier.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ RENDERER (sandboxed, contextIsolation, no Node, strict CSP)                  │
│  React UI: Reader | Curriculum | Lesson | Practice | Library/Jobs | Models   │
│  TanStack Query cache  <── invalidation events ──  typed RPC client          │
└───────────────▲──────────────────────────────────────────────────────────────┘
                │ preload (contextBridge): window.danesh.{call, subscribe}
                │ MessagePort held PRIVATELY in preload (never exposed to page)
┌───────────────┴──────────────────────────────────────────────────────────────┐
│ MAIN (thin supervisor, no domain logic, no heavy work, no DB)                │
│  window/app lifecycle · CSP + permission handlers · will-navigate lockdown   │
│  spawns + restarts Core and Engine Hosts · brokers MessageChannelMain ports  │
│  native dialogs (file picker) · protocol handler for blob:// app assets      │
└───────┬───────────────────────────────────────────────┬──────────────────────┘
        │ MessagePortMain (brokered once)               │ utilityProcess.fork
┌───────▼───────────────────────────────────────────────▼──────────────────────┐
│ CORE (utilityProcess, long-lived, TypeScript, the only DB writer)            │
│  RPC server (zod-validated) · Domain services · Job scheduler + FSM          │
│  Resource governor (RAM/VRAM budgets, model slot) · Pipelines (import,       │
│  assemble, chunk/embed, synthesize, lesson, lang, tts, review)               │
│  Consent gate / egress policy · Migration runner · Blob store (CAS)          │
│  worker_threads (pure-TS CPU work only): assembly, alignment, vector scan    │
└───┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────────────┘
    │ typed engine-host protocol over MessagePort / parentPort (per host)
┌───▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼───┐ ┌────▼─────────────────┐
│ PDF   │ │ OCR +   │ │ LLM    │ │ Embed  │ │ TTS   │ │ EGRESS BROKER        │
│ host  │ │ layout  │ │ host   │ │ host   │ │ host  │ │ (only process allowed│
│ (pool)│ │ host    │ │(1 heavy│ │        │ │       │ │ outbound HTTP, plus  │
│       │ │         │ │ model) │ │        │ │       │ │ model downloader)    │
└───────┘ └─────────┘ └────────┘ └────────┘ └───────┘ └──────────────────────┘
   utilityProcess (Node addons / WASM) or child_process.spawn (native binaries)

┌──────────────────────────────────────────────────────────────────────────────┐
│ STORAGE (on disk, under a user-visible, relocatable "library" directory)     │
│  danesh.db  (WAL)  : evidence + derived artifacts + learning + jobs          │
│  index.db   (WAL)  : embeddings, FTS5 — fully rebuildable                    │
│  blobs/sha256/..   : immutable originals, figure crops, page rasters, audio  │
│  backups/ tmp/     : pre-migration copies; atomic-write staging              │
│  models/ (separately relocatable): GGUF/ONNX weights, voices                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Main** | App/window lifecycle, security policy, supervise child processes, hand out MessagePorts, native OS dialogs. Must stay idle and responsive. | Electron main; `utilityProcess.fork`, `MessageChannelMain`; ~500 LOC target |
| **Preload** | The only renderer-facing surface. Holds the Core port privately; exposes `call(method, args)` and `subscribe(topic)` that are type-checked at compile time and re-validated in Core. | `contextBridge.exposeInMainWorld`; schemas imported from `contracts` |
| **Renderer** | Presentation only: reader, curriculum, lessons, practice, job/model status. No business rules, no DB, no file paths. | React + TanStack Query (server-state from Core) + a small UI-state store |
| **Core** | Composition root. RPC server, domain services, job scheduler, resource governor, migrations, consent gate, the sole SQLite writer. Does no heavy compute itself. | `utilityProcess` entry; `better-sqlite3` (sync) behind a `Db` interface |
| **Engine Hosts** | Run one engine kind each behind a typed adapter. Stateless w.r.t. the app: input in, result out, progress events, abort signal. Disposable and restartable. | `utilityProcess` for Node addons/WASM; `child_process.spawn` (stdio/IPC, no sockets) for standalone native binaries |
| **Egress Broker** | The *only* component that opens outbound network connections (web research + model/voice downloads). Accepts only requests carrying a consent-gate grant. | Separate `utilityProcess`; allowlisted hosts for downloads; audit-logged |
| **Storage layer** | Typed repositories, forward-only SQL migrations, backups, content-addressed blob store with atomic writes. | `packages/storage`; SQL files + tiny in-house runner |
| **Domain packages** | Pure TS, no I/O: block model + alignment, job FSM, staleness evaluator, concept merge rules, coverage logic, FSRS wrapper, privacy policy. TDD targets per the project mandate. | Plain functions + zod schemas; 100% unit-testable |
| **Eval harness** | Runs engines/pipelines against the real fixture suite and records baseline metrics and pass/fail. Not shipped in the app, but built early. | `packages/eval`, CLI + CI job |

---

## Recommended Project Structure

pnpm workspaces monorepo; **dependency direction enforced by lint** (`eslint-plugin-boundaries` or `dependency-cruiser` in CI).

```
danesh/
├── apps/
│   ├── main/                 # Electron main: lifecycle, supervisor, port broker, security
│   ├── preload/              # contextBridge API; private Core port
│   ├── renderer/             # React UI (Persian-first, RTL, reader, curriculum, ...)
│   └── core/                 # utilityProcess entry: composition root, RPC server, scheduler
├── packages/
│   ├── contracts/            # zod schemas + inferred types: IDs, RPC methods, events,
│   │                         #   block/payload schemas, engine-host protocol. ZERO deps on others
│   ├── domain/               # PURE logic, no I/O
│   │   ├── docmodel/         #   block types, assembly rules, ID alignment, quality status
│   │   ├── jobs/             #   job/task FSM, retry/backoff policy, resource-need model
│   │   ├── provenance/       #   fingerprints, staleness evaluator, producer snapshots
│   │   ├── knowledge/        #   candidate matching, merge rules, relation rules, lineage
│   │   ├── learning/         #   coverage inference, FSRS wrapper, signal separation
│   │   └── privacy/          #   consent policy, query screening, egress rules
│   ├── storage/              # sqlite repos, migrations/*.sql, backup, CAS blob store
│   ├── engine-api/           # typed adapter contracts + conformance test suites (no impls)
│   ├── engines/              # one package per implementation; each exports an EngineHost entry
│   │   ├── pdf-*/  ocr-*/  layout-*/  llm-*/  embed-*/  tts-*/
│   ├── pipelines/            # orchestration steps (use storage + engine-api + domain)
│   │   ├── import/ extract/ assemble/ index/ synthesize/ lang/ lesson/ audio/ review/ research/
│   ├── models/               # registry manifest, asset store, snapshots, hardware probe, evals
│   └── eval/                 # fixtures runner, metrics, pass/fail policy
├── fixtures/                 # real PDF suite (Persian/English bidi, code, tables, scans, broken, ...)
├── docs/adr/                 # engine + trade-off decisions
└── tooling/                  # packaging, signing/notarization, CI, boundary rules
```

### Structure Rationale

- **`contracts` is the root of the graph.** Renderer, preload, Core and engine hosts all depend on it; it depends on nothing. Types and runtime validators come from the same zod schema, so IPC cannot drift.
- **`domain` is pure.** Alignment, staleness, FSM, FSRS replay, consent policy are the deterministic cores the brief wants TDD'd; keeping them I/O-free makes that cheap.
- **`engine-api` separate from `engines/*`.** Pipelines import only the interface; swapping an OCR or TTS engine is a new package plus a passing conformance suite, never a pipeline edit (satisfies "engine selection is open").
- **`pipelines` never import `apps/*`; `renderer` never imports `storage` or `engines`.** Boundary lint makes "no Node in renderer" a build failure, not a convention.
- **One composition root (`apps/core`)** wires interfaces to implementations, so tests can run the whole pipeline in-process with fake engines (fast, deterministic crash-injection).

---

## Process Model (Focus 1) [HIGH for Electron API facts, MEDIUM for topology]

### Where each thing lives

| Concern | Placement | Why |
|---------|-----------|-----|
| UI | Renderer (sandbox, context isolation, CSP) | Untrusted-by-default surface renders AI output |
| Lifecycle, security policy, supervision | Main | Must never block; has the `app` privileges |
| Domain logic, DB, scheduler | **Core `utilityProcess`** | Keeps Main idle; one place for a single-writer DB; restartable by Main |
| Pure-TS CPU work (block assembly, ID alignment, flat vector scan, FTS rebuild) | `worker_threads` inside Core | No crash isolation needed; keeps Core's event loop free; bounded with `resourceLimits` |
| PDF parsing, OCR, layout, LLM, embeddings, TTS | **Separate Engine Host processes** | OOM, segfault, GPU-driver crash, or infinite loop in a native engine must kill *only that host* |
| Outbound network | Egress Broker only | Makes "no hidden transfers" a structural property |

**Why a Core process rather than SQLite in Main:** the project constraint says heavy work must not block Main *or* renderer. Domain services, large transactions and migration runs are not "heavy" individually, but putting them in Main couples the OS-integration process to the domain's failure modes. A Core `utilityProcess` can crash and be restarted by Main with the renderer reconnecting, and all state is durable, so the user sees a "reconnecting" blip, not data loss. (Trade-off: one more process and one more port hop; accepted.)

### Electron facts used (official docs, fetched) [HIGH]

- `utilityProcess.fork(modulePath, args, options)` creates a Node.js child with message ports enabled, launched through Chromium's Services API; callable only after `app.ready`. Events: `spawn`, `message`, `exit` (with code), and experimental `error` for fatal V8 errors (`exit` still fires after). `stdio: 'pipe'` lets Main capture logs. `kill()` sends SIGTERM on POSIX.
- `MessagePortMain` objects are passed to the child via `child.postMessage(msg, [port])` and received on `process.parentPort`'s `message` event as `e.ports`.
- macOS-only options `allowLoadingUnsignedLibraries` and `disclaim` exist and default to `false`. This matters for packaging: every native dylib loaded by an Engine Host must be signed/notarized or explicitly handled (flag for the packaging phase).
- The docs page did **not** state which Node APIs/native addons are supported inside `utilityProcess`; native-addon loading inside it is validated by the Foundation packaging spike (below), not assumed.

### IPC design

```
Renderer page ──(contextBridge fn)──> Preload ──(private MessagePort)──> Core
                                                                    ▲
Main creates MessageChannelMain once per window, sends port1 to the │
verified frame's preload (webContents.postMessage w/ ports) and     │
port2 to Core (child.postMessage w/ ports). After that Main is out of the data path.
```

- **Two interaction shapes only:** (1) `call(method, input) -> Promise<output>` request/response; (2) `subscribe(topic) -> unsubscribe` for events (job progress, token streams, invalidations).
- **Contract:** `contracts/rpc.ts` is a map `method -> { input: ZodSchema, output: ZodSchema, errors: ... }`. Preload exposes only methods in this map; Core re-validates every input with zod (never trust preload types at runtime) and validates outputs in dev/test builds.
- **Sender validation:** Main hands the port only to the expected `webContents`/frame URL (the packaged app origin) and refuses any other frame or navigation.
- **Streaming:** LLM tokens and TTS audio chunks flow engine host -> Core -> renderer. Core **coalesces progress to <= 10 Hz** and batches tokens per animation frame to keep React cheap. Persisted state is always the DB; streams are best-effort UX.
- **Large payloads never ride IPC.** Page rasters, figure crops, audio and big OCR results are written to the blob/tmp directory by the producer and referenced by hash/path. Core returns *pages of IDs* with cursors, not whole documents.
- **Reactive reads:** after each committed transaction Core emits `invalidate({domain, ids})`; the renderer maps these to TanStack Query keys. No polling, no shared mutable state across the boundary.

```typescript
// packages/contracts/src/rpc.ts  (sketch)
export const rpc = {
  'library.importPdf':   { in: z.object({ filePath: AbsPath }),           out: z.object({ jobId: JobId }) },
  'doc.getBlocks':       { in: z.object({ sourceId: SourceId, cursor: Cursor.optional(), limit: z.number().max(200) }),
                           out: BlockPage },
  'lesson.get':          { in: z.object({ conceptId: ConceptId }),         out: LessonView },
  'review.submit':       { in: ReviewSubmission,                           out: ReviewOutcome },
} as const;
```

### Crash and OOM isolation matrix

| Failure | Detected by | Blast radius | Recovery |
|---------|-------------|--------------|----------|
| Engine host segfault / OOM-kill | `exit` event, watchdog timeout, heartbeat loss | Single in-flight task | Core marks attempt failed (reason code), respawns host, retries; same page failing twice -> **quarantine that page** and continue |
| LLM host OOM at model load | exit during `init` | Current model-load request | Governor lowers budget / picks smaller quant / falls back; user-facing "not enough memory" status, no crash loop |
| Core crash | Main `exit` handler | Renderer connection | Main respawns Core, re-brokers port; boot recovery pass requeues orphaned tasks |
| Main crash / force quit | Next launch | Nothing durable | Boot recovery pass (below) |
| Corrupt page in PDF | Task failure with parse-error class | One page | Page gets a `gap` block with reason; job ends `completed_with_issues`, never silently complete |

---

## Durable Job System (Focus 2) [MEDIUM — standard durable-queue pattern, SQLite-specific details are my design]

### Model: Job -> Tasks, all in SQLite

- **Job** = user-visible unit ("Import book X", "Normalize source Y", "Rebuild concepts for Z"). Has aggregate progress.
- **Task** = idempotent, resumable unit of work inside a job: *a page*, *a chunk*, *a sentence of audio*. All task rows are created up front (cheap), so progress is exact and the scheduler needs no lookahead logic.
- **Step outputs are written in the same transaction as the task's transition to `done`.** Large artifacts are written to the content-addressed blob store *before* the transaction (idempotent by hash), so a crash between blob write and commit only leaves a harmless orphan for the GC job.

```sql
CREATE TABLE job (
  job_id TEXT PRIMARY KEY,           -- ULID
  kind TEXT NOT NULL,                -- 'import.pdf' | 'lang.normalize' | 'synth.incremental' ...
  parent_job_id TEXT REFERENCES job(job_id),
  state TEXT NOT NULL CHECK (state IN
    ('queued','running','paused','blocked','failed','cancelled','completed','completed_with_issues')),
  priority INTEGER NOT NULL DEFAULT 50,       -- 0 = interactive
  idempotency_key TEXT UNIQUE,                -- e.g. 'import:'||sha256 or 'lesson:'||fingerprint
  input_ref TEXT NOT NULL,                    -- JSON: source_id, scope, pipeline_id@version
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,                        -- 'model_missing' | 'insufficient_memory' | 'needs_password'
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE task (
  task_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES job(job_id),
  kind TEXT NOT NULL,                         -- 'pdf.page' | 'ocr.region' | 'llm.chunk' | 'tts.sentence'
  unit_key TEXT NOT NULL,                     -- 'p:123' | 'chunk:<hash>'
  state TEXT NOT NULL CHECK (state IN ('queued','running','done','failed','quarantined','cancelled')),
  needs TEXT NOT NULL,                        -- JSON: {engine:'ocr', ramMB:900, exclusiveModel:null}
  attempt INTEGER NOT NULL DEFAULT 0,
  boot_id TEXT,                               -- Core boot that started it (orphan detection)
  error_class TEXT, error_detail TEXT,
  output_ref TEXT,                            -- evidence/artifact row or blob hash
  UNIQUE (job_id, kind, unit_key)             -- idempotent fan-out
);
```

### State machine (pure TS in `domain/jobs`, table-driven, exhaustively unit-tested)

```
queued ──start──> running ──all tasks done──────────> completed
  ▲  │               │ ├─ some tasks quarantined ───> completed_with_issues
  │  └─pause──> paused│ ├─ fatal / retries exhausted ─> failed ──retry──> queued
  │       resume──┘   │ ├─ resource unavailable ─────> blocked ──resolved──> queued
  └──── requeue ◄─────┘ └─ cancel ────────────────────> cancelled
```

- **Retry != redo:** `done` tasks are never re-run on retry/resume; only `failed`/`queued`/orphaned tasks. This is the "never silently lose verified output" guarantee.
- **`completed_with_issues` is a first-class state.** A 900-page book with 3 unreadable pages is useful *and honest*; the three `gap` blocks carry the reason.
- **Resumption after restart (boot recovery pass):** because there is exactly one scheduler, no distributed leases are needed. At boot: every `task.state='running'` with `boot_id != current_boot_id` is orphaned -> `queued` with `attempt+1`; tasks over `max_attempts` -> `quarantined`; tmp/ is swept; blob orphans are queued for GC; if the previous shutdown was unclean, run `PRAGMA quick_check`.
- **Cancellation:** cooperative first (`cancel_requested` + `AbortSignal` propagated over the engine protocol), then hard-kill of the Engine Host after a grace timeout. Because tasks are idempotent, a kill never corrupts state.
- **Pause:** finish-or-abort the in-flight task at a safe point; never hold a model hostage while paused (governor may unload).
- **Watchdogs:** per-task-kind timeout and heartbeat from hosts; hang == crash.

### Scheduler and resource governor

- **Resource classes:** `pdf-cpu`, `ocr`, `llm-heavy`, `embed`, `tts`, `db-light`. Each task declares `needs` (estimated RAM/VRAM, exclusive model key) derived from the model registry's measured footprint, not marketing sizes.
- **"One big model resident" rule:** `llm-heavy` is a mutex keyed on the model snapshot. Small models (embedding, voice) may co-reside only if the budget calculation allows; default is sequential.
- **Model-affinity batching:** among runnable tasks, prefer those needing the *currently loaded* model; model swaps are expensive (seconds to tens of seconds), so batch translation chunks, then concept chunks, rather than interleaving. Aging prevents starvation.
- **Priority lanes:** interactive (user clicked Explain/Lesson, priority 0) preempts background work at task boundaries; background LLM tasks are aborted and requeued (cheap because idempotent) only if the interactive request needs the same host.
- **Backpressure:** bounded pages-in-flight per source; rasters live on disk, not in queues; stage handoff is via DB rows, so a slow consumer simply leaves rows `queued`.
- **OOM adaptation:** repeated OOM on a model/task kind lowers concurrency or context size one notch and records it in the job (visible to the user as "using low-memory mode"), instead of retry-looping.

---

## Canonical Semantic Document Model (Focus 3) [MEDIUM]

### Two-stage reconstruction (the key structural decision)

```
Original PDF (immutable, CAS)
   └─ STAGE A  Evidence extraction  (expensive, engine-bound, per-page tasks)
        raw text runs w/ glyph boxes, font info, annotations, OCR lines/words + confidences,
        layout regions, rasters/crops  ->  `evidence_*` rows, tagged with engine+version
   └─ STAGE B  Assembly  (cheap, deterministic TS, whole-document, re-runnable)
        reading order, column resolution, bidi/logical-order repair, cross-page paragraph/table
        joins, footnote linking, outline, quality status  ->  `block_version` rows
```

Stage B being a deterministic pure function of stored evidence means **improving assembly rules never requires re-parsing or re-OCRing**, and assembly is unit-testable on frozen evidence fixtures. This is the biggest lever for both quality iteration and cost.

### Tables (sketch)

```sql
-- Immutable originals
CREATE TABLE source_file (sha256 TEXT PRIMARY KEY, size INTEGER, status TEXT,  -- ok|encrypted|damaged
                          first_imported_at INTEGER);              -- bytes live in blobs/sha256/..
CREATE TABLE source_import (id TEXT PRIMARY KEY, sha256 TEXT, original_name TEXT, original_path TEXT, imported_at INTEGER);
CREATE TABLE source (source_id TEXT PRIMARY KEY, sha256 TEXT REFERENCES source_file, title TEXT,
                     active_run_id TEXT);                           -- pointer, atomically swapped

-- Extraction runs (immutable once completed)
CREATE TABLE extraction_run (run_id TEXT PRIMARY KEY, source_id TEXT, pipeline_version TEXT,
                             engines TEXT /*JSON snapshot ids*/, config_hash TEXT, status TEXT, quality_summary TEXT);
CREATE TABLE evidence_page (run_id TEXT, page_no INTEGER, engine TEXT, status TEXT, payload_ref TEXT,
                            PRIMARY KEY (run_id, page_no, engine));

-- Stable identity vs per-run content
CREATE TABLE block (block_id TEXT PRIMARY KEY, source_id TEXT NOT NULL,
                    created_in_run TEXT, retired_in_run TEXT);      -- retire, never delete
CREATE TABLE block_version (
  block_id TEXT REFERENCES block, run_id TEXT REFERENCES extraction_run,
  seq INTEGER NOT NULL,                          -- reading order within source for this run
  kind TEXT NOT NULL,                            -- paragraph|heading|code|table|equation|figure|caption|footnote|list_item|gap
  parent_block_id TEXT,                          -- heading hierarchy, caption->figure, footnote->ref
  page_no INTEGER, regions TEXT,                 -- JSON [{page, bbox:[x0,y0,x1,y1]}] (PDF user space)
  text TEXT,                                     -- logical-order Unicode, NFC, ZWNJ preserved
  payload TEXT, payload_schema_version INTEGER,  -- discriminated-union JSON (table cells, math, code lang, figure crop hash)
  dir TEXT,                                      -- 'rtl'|'ltr'|'auto'; inline runs carry lang/dir
  content_hash TEXT NOT NULL,                    -- hash of normalized text+payload (drives staleness & alignment)
  quality TEXT NOT NULL,                         -- verified|ocr|low_confidence|missing|unsupported
  confidence REAL, evidence_refs TEXT,           -- links back to Stage A rows
  PRIMARY KEY (block_id, run_id));
CREATE TABLE block_lineage (new_block_id TEXT, old_block_id TEXT, relation TEXT /*same|split|merge*/, run_id TEXT);
CREATE TABLE outline_node (source_id TEXT, run_id TEXT, node_id TEXT, parent_id TEXT, title TEXT,
                           target_block_id TEXT, ord INTEGER);   -- the ORIGINAL outline, separate view
CREATE TABLE block_override (override_id TEXT PRIMARY KEY, block_id TEXT, field TEXT, value TEXT,
                             created_at INTEGER);                 -- user corrections; NEVER mutate block_version
```

Rules baked into the model:
- **Markdown is a render format only.** The reader renders from `block_version`; export-to-Markdown is a projection.
- **Math/figures/tables never invented:** an unreadable equation is `kind='equation', quality='missing'` with the page-region crop reference; downstream pipelines skip or flag blocks below a configurable quality floor and the UI says "not covered" rather than guessing.
- **Persian specifics:** store logical-order text (repair visual-order extraction in Stage B, mark when repair confidence is low), keep ZWNJ/ZWJ, normalize to NFC, keep a *separate derived* `search_text` (Arabic/Persian yeh/kaf unification, digit unification) in `index.db` only. Direction is explicit per block and per inline run.
- **User corrections are an overlay** (`block_override`) applied at read time and carried through re-extraction by block_id; they are evidence, not edits.

### Keeping IDs stable across re-extraction

1. `block_id` is a ULID minted once and **never reused**; `block_version` is the per-run content.
2. A new extraction run builds as a *candidate*. **Alignment** (pure function in `domain/docmodel`) maps new blocks to old: (a) exact `content_hash` match at same page order; (b) same page(+-1) with bbox IoU and normalized-text similarity above threshold; (c) a monotonic order constraint (LCS/DP over reading order) to avoid cross-matching repeated boilerplate.
3. Matched -> reuse `block_id`, add new `block_version`. Unmatched new -> new `block_id`. Unmatched old -> `retired_in_run` set (kept, never deleted). Splits/merges -> `block_lineage` rows.
4. **Citations are self-healing:** a citation stores `block_id` + a text-quote selector (exact, prefix, suffix) **and an excerpt snapshot**. If a block is split/merged/retired, resolve through lineage and re-anchor by quote; if that fails, the stored excerpt still satisfies "inspectable original excerpt" and the citation is flagged `needs_reanchor` rather than dangling.
5. **Promotion gate:** candidate becomes `source.active_run_id` only if it passes a quality comparison (coverage, gap count, confidence) against the active run; otherwise the user keeps the old run. The swap is a single transaction.

### Immutable originals

Content-addressed: stream-copy to `tmp/`, hash while copying, `fsync`, atomic `rename` into `blobs/sha256/ab/cd/<hash>`, mark read-only, then insert `source_file`. Duplicate import = hash hit -> new `source_import` provenance row only. Encrypted PDFs: store the original as-is with status `encrypted`, never persist the password or a decrypted copy; decrypt in-memory per session. Damaged PDFs: stored (the user's original must survive) with status and salvage attempts recorded as evidence.

---

## Data Domains and Dependency Direction (Focus 4) [MEDIUM]

### The domains and their tier

```
D1 Source files        ──►  D2 Extraction evidence  ──►  D3 Canonical document model
(immutable)                 (raw, per engine/run)         (blocks, outline, overrides)
                                                              │
                  ┌───────────────────────────────────────────┤
                  ▼                                           ▼
D4 Language outputs                                 D5 Concept & relationship model
(translation, normalization,                        (concepts, labels, evidence, relations,
 summary, glossary)                                  lineage, unresolved-prereq gaps)
                  │                                           │
                  └───────────────┬───────────────────────────┘
                                  ▼
                       D6 Generated lessons (immutable versions + citations)
                                  ▼
                       D7 Learning evidence (append-only)
                                  ▼
                       D8 Recall schedule (derived from D7 by replay)

   Cross-cutting (soft references only, never FK targets of D1-D8):
   D9 Model/job state: model_snapshot, model_registry, job, task, eval results
   D10 Online evidence (web): separate, never feeds D5
```

**Rule 1 (direction):** a domain may reference IDs from domains *above* it, never below. D3 knows nothing about concepts; D5 knows nothing about lessons; nothing upstream references learning evidence.
**Rule 2 (tiers):**

| Tier | What | Loss tolerance | Policy |
|------|------|----------------|--------|
| **T0 Irreplaceable** | D1 originals, D7 evidence (reading events, assessment attempts, review log), manual overrides/corrections, user settings | None | Append-only/immutable, `ON DELETE RESTRICT`, included in every backup, exportable |
| **T1 Expensive to regenerate** | D2 evidence, D3 blocks, D4 outputs, D5 concepts, D6 lessons, audio | Low (cost, not correctness) | Versioned, retained when superseded until user/GC policy says otherwise; never auto-deleted by a model switch |
| **T2 Cheap/derived** | embeddings, FTS, curriculum view projection, card_state cache, thumbnails | Free to drop | Rebuilt on demand; live in `index.db` or are clearly marked derived |

**Rule 3 (no hard deletes):** retire/tombstone with lineage. Nothing in T0/T1 is physically deleted except by an explicit, confirmed user action (matches the Authorization constraint).

### Every derived artifact carries provenance + a fingerprint

```typescript
interface Producer {            // immutable row in model_snapshot / pipeline registry
  pipelineId: string;           // 'lesson.compose'
  pipelineVersion: string;      // semver, bumped when logic changes
  promptHash: string;           // hash of the exact template files
  modelSnapshotId: string | null; // asset sha256 + runtime id/version + sampling params
  params: Record<string, unknown>;
}
interface ArtifactMeta {
  producer: Producer;
  inputFingerprint: string;     // hash(sorted [blockId@contentHash | conceptId@evidenceSetHash | glossaryVersion] + producer config)
  createdAt: number;
  staleness: 'fresh' | 'enrichable' | 'stale' | 'superseded_producer';
}
```

### Staleness propagation (pull + reverse index, not cascade rewrites)

- Each derived artifact stores its `inputFingerprint` **and** rows in `artifact_dependency(artifact_id, depends_on_kind, depends_on_id, depends_on_hash)`. That gives O(log n) answers to "which lessons/translations/concepts cite block X?".
- **Four distinct states, because "changed" is not one thing:**
  - `stale` — a *cited* block's `content_hash` changed or was retired (hard: cited evidence no longer says this). Re-anchor first via lineage; if the hash is unchanged after re-matching, remain `fresh`.
  - `enrichable` — the concept gained new evidence/relations from a new source but nothing cited was invalidated (soft: lesson is still true, may be richer). Never auto-regenerate; offer on view.
  - `superseded_producer` — a better model/prompt exists for this role (soft, optional). **This is the only effect a model switch has on existing artifacts.**
  - `fresh`.
- **Lessons are section-granular:** each lesson section has its own fingerprint, so a new source regenerates only sections whose evidence set changed ("avoid unnecessary full regeneration").
- Staleness is evaluated by a small background job triggered by a `knowledge_delta` or `extraction_promoted` event; it only flips flags, it never rewrites content.

### Adding a new PDF without losing history

```
import job -> D1/D2/D3 for the NEW source only
   -> chunk + embed new blocks (index.db)
   -> incremental synthesis job (scope = new source):
        candidates (embedding + lexical + glossary + unresolved-prereq terms)
        -> LLM adjudication with evidence (merge | attach | new)
        -> knowledge_delta { new concepts, evidence added, relation proposals, merges, gap resolutions }
   -> apply delta in ONE transaction; concepts never deleted, merges recorded in concept_lineage
   -> staleness evaluator marks affected lessons enrichable/stale
D7/D8 untouched: they reference concept_id/lesson_version/block_id, resolved through lineage.
```

---

## Knowledge Model (Focus 5) [MEDIUM]

**Storage: relational tables with recursive CTEs, not a graph database.** Scale is thousands to low tens of thousands of concepts per learner; the primary view is a hierarchical list; SQLite handles DAG traversal, cycle checks and transitive closure fine, and it keeps one transactional store with lineage, FKs, and backup. A visual graph can be a projection later.

```sql
CREATE TABLE concept (concept_id TEXT PRIMARY KEY, canonical_label TEXT, status TEXT /*active|merged|retired*/,
                      created_in_synth_run TEXT);
CREATE TABLE concept_label (concept_id TEXT, lang TEXT, label TEXT, source_id TEXT NULL, kind TEXT /*preferred|alias|source_term*/);
CREATE TABLE concept_evidence (                 -- INVARIANT: every active concept has >= 1 row
  concept_id TEXT, block_id TEXT, source_id TEXT,
  role TEXT /*defines|explains|exemplifies|mentions*/, quote_selector TEXT, confidence REAL, synth_run_id TEXT);
CREATE TABLE concept_definition (concept_id TEXT, source_id TEXT, block_id TEXT, text_snapshot TEXT);  -- multiple kept, attributed
CREATE TABLE concept_relation (
  from_id TEXT, to_id TEXT,
  type TEXT /*prerequisite|corequisite|part_of|related|alternative_to|conflicts_with*/,
  status TEXT /*proposed|accepted|user_rejected|user_confirmed*/, confidence REAL, synth_run_id TEXT);
CREATE TABLE relation_evidence (relation_id TEXT, block_id TEXT, quote_selector TEXT);
CREATE TABLE concept_lineage (from_id TEXT, to_id TEXT, event TEXT /*merge|split|rename*/, evidence TEXT, algo_version TEXT, at INTEGER);
CREATE TABLE disagreement (disagreement_id TEXT PRIMARY KEY, concept_id TEXT, summary TEXT, stance_a_evidence TEXT, stance_b_evidence TEXT);
CREATE TABLE unresolved_prerequisite (concept_id TEXT, term TEXT, lang TEXT, mention_evidence TEXT, resolved_by_concept_id TEXT NULL);
CREATE TABLE glossary_entry (concept_id TEXT, lang TEXT, term TEXT, version INTEGER, status TEXT);
```

Design rules:
- **Merge only with evidence, reversibly.** A merge is a recorded decision (`concept_lineage` + evidence + algorithm version + confidence). Same-name-different-meaning stays separate; user "split" reverses it. Other concepts' history resolves through `concept_lineage` redirects (union-find style) — learning evidence keeps the *original* concept_id and is resolved at read time.
- **Disagreements are data, not noise:** multiple `concept_definition` rows per concept with attribution; `conflicts_with` relations and `disagreement` rows feed lessons.
- **No empty topics, ever.** The "missing prerequisite" case is an `unresolved_prerequisite` row (a mention with evidence), shown inline where relevant; it is *not* a `concept` row (so no unsourced lesson can be attached). When a later PDF supplies it, incremental synthesis matches unresolved terms first and links `resolved_by_concept_id`.
- **Curriculum view is a derived projection** (topological order over `prerequisite`/`part_of` + coverage + recall signals) stored as T2 and recomputed after each delta; it never locks the user out (it is a recommendation, not a gate).
- **Hierarchy vs sequence:** `part_of` edges give the topic tree; the original source outline remains the separate `outline_node` view.

### Retrieval (embeddings + lexical)

- **Chunking at block boundaries, structure-aware:** a `retrieval_chunk` is a contiguous run of blocks within a heading section, size-bounded by tokens, never splitting code/table/equation blocks; stored with `block_id` range and a `chunk_hash`.
- **`index.db`:** `chunk_embedding(chunk_id, embedding_snapshot_id, dim, vector BLOB)` + FTS5 over a Persian-normalized `search_text`. An embedding-model switch builds a *new* embedding set keyed by snapshot; the old set is dropped only after the new one is complete (search keeps working throughout). Everything in `index.db` is rebuildable from `danesh.db`.
- **Hybrid search** (BM25 + vector, reciprocal-rank fusion) for candidate retrieval; the LLM only ever sees retrieved chunks, never a whole book.
- **Vector backend behind a `VectorIndex` interface.** Recommendation: start with **vectors as BLOBs + flat scan in a `worker_thread`** (zero native-extension risk, trivial packaging, adequate for tens of thousands of chunks); adopt `sqlite-vec` only if benchmarks on real libraries demand it. Rationale: `sqlite-vec` is described by its own README as pre-v1 with expected breaking changes (Apache-2.0/MIT, sponsor-funded) and a loadable native extension adds signing/notarization and ABI packaging burden on macOS/Windows. **[LOW/SPIKE]** — benchmark flat-scan vs `sqlite-vec` at 20k and 100k chunks before Phase 5 commits.

---

## AI Layer (Focus 6) [MEDIUM; engine-specific points SPIKE]

### Adapter contracts (in `packages/engine-api`)

```typescript
interface EngineHost<Req, Res, Evt = never> {
  readonly capability: 'pdf'|'ocr'|'layout'|'llm'|'embed'|'tts';
  readonly implId: string; readonly implVersion: string; readonly license: string;
  init(ctx: { modelRef?: ModelAssetRef; budget: ResourceBudget }): Promise<EngineInfo>;
  run(req: Req, o: { signal: AbortSignal; onEvent(e: Evt): void }): Promise<Res>;
  dispose(): Promise<void>;
}
interface PdfParser { open(f: FileRef, pw?: Secret): Promise<DocInfo>; page(n: number): Promise<PageEvidence>;
                      rasterize(n: number, dpi: number, region?: BBox): Promise<ImageRef> }
interface OcrEngine { recognize(img: ImageRef, langs: Lang[]): Promise<OcrResult /*lines, words, per-word conf*/> }
interface LayoutAnalyzer { regions(img: ImageRef, hint?: PageEvidence): Promise<Region[]> }
interface LlmEngine { generate(r: { messages: Msg[]; jsonSchema?: JsonSchema; maxTokens: number; seed?: number }):
                      AsyncIterable<TokenEvent> | Promise<GenResult>; countTokens(t: string): number }
interface EmbeddingEngine { embed(texts: string[], kind: 'query'|'passage'): Promise<Float32Array[]>; readonly dim: number }
interface TtsEngine { synthesize(r: { text: string; voice: VoiceRef; lang: Lang }): AsyncIterable<AudioChunk> }
```

- **Conformance suites** live in `engine-api`; every implementation package must pass the same fixture-backed suite (including crash, abort and timeout behavior) before it can be selected. That is how "engines replaceable" is enforced and how ADR comparisons stay apples-to-apples.
- **Engine hosts never import `storage` and never receive a DB handle.** They return data; Core persists. This is what makes retries and crash recovery trivially safe.

### Model registry and snapshots (in `packages/models`)

- **Curated manifest** shipped with the app (versioned JSON): role (`reasoning`, `translation`, `multimodal`, `embedding`, `voice`, plus `ocr`/`layout` assets), source URL, sha256, size, license text/URL, runtime compatibility, measured footprint, and **linked eval results**. "Actually tested" is data (`model_eval` rows: suite version, metrics, hardware profile, date), not a claim in prose.
- **`model_asset`** (installed file, verified hash) -> **`model_snapshot`** (immutable: asset hash + runtime impl/version + sampling/context params + hardware backend actually used). Every artifact references a snapshot ID.
- **`role_binding(role -> asset)`** is the *only* mutable thing a "model switch" touches. Switching never rewrites or deletes any artifact; it can flag `superseded_producer`.
- **Hardware capability is recorded from execution**, not inference: `hardware_check(asset, backend, ok|oom|crash, peak_mem, tokens_per_s)` produced by a real smoke run.

### Chunked, retrieval-augmented processing (no giant contexts)

```
blocks -> structure-aware chunks (<= N tokens, overlap only at section seams)
   map:    per-chunk task (idempotent, checkpointed)  -> schema-validated JSON  (task row)
   reduce: per-section task over map outputs           -> section artifact       (task row)
   reduce: per-source / per-concept task               -> source/concept artifact (task row)
```
- Every stage's output is a persisted artifact; resume restarts at the first missing task. Large books are therefore *many small tasks*, never one long call.
- **Structured output is validated twice:** constrained decoding where the runtime supports it (grammar/JSON-schema), then zod validation; invalid -> bounded retry with the validation error, then quarantine the task (never persist unvalidated text as a result).
- **Prompts are code:** template files hashed into `promptHash`; changing a prompt bumps `pipelineVersion` and flips dependents to `superseded_producer`, not `stale`.

### Grounded vs supplemental in the schema

```sql
CREATE TABLE lesson_segment (
  segment_id TEXT PRIMARY KEY, lesson_version_id TEXT, section_id TEXT, ord INTEGER, lang TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('grounded','supplemental')),
  text TEXT NOT NULL, label_text TEXT);               -- label shown to the user for 'supplemental'
CREATE TABLE citation (
  citation_id TEXT PRIMARY KEY, segment_id TEXT, citation_kind TEXT CHECK (citation_kind IN ('source_block','web')),
  block_id TEXT, content_hash_at_cite TEXT, quote_selector TEXT, excerpt_snapshot TEXT, web_evidence_id TEXT,
  verified INTEGER NOT NULL DEFAULT 0);               -- set by the post-generation verifier
```
- **Invariant enforced in the domain service and a DB trigger:** a `grounded` segment needs >= 1 `source_block` citation that the **verifier** confirmed (quote present in block text or entailment check passed). `web` citations never satisfy it. `supplemental` segments carry model-snapshot provenance and a mandatory visible label.
- **Generation protocol:** retrieval -> model must output segments *with chunk/block references* -> verifier checks each grounded claim against cited text -> failures are re-asked once, then downgraded to `supplemental` with a label or dropped; never silently left as `grounded`.
- **Translation/normalization** is segment-aligned to blocks (`lang_segment(block_id, block_content_hash, target_lang, kind: translation|normalization|summary, glossary_version, producer)`), which makes staleness per-block and lets summarization carry an explicit coverage/omission report referencing the blocks it did and did not cover.

---

## Learning Layer (Focus 7) [MEDIUM; FSRS facts partly verified]

Three signals, three physically separate tables with **no shared score column**:

| Signal | Source of truth | Derived view | Never influenced by |
|--------|-----------------|--------------|---------------------|
| **Reading coverage** | `reading_event` (append-only: block visibility dwell, pointer/selection, explicit highlight) | `coverage(block_id)` projection by inference rules | opening/scrolling alone (rules require meaningful activity), FSRS |
| **Assessed understanding** | `assessment_attempt` (append-only: item, response, grader kind, rubric, hint count, grading model snapshot, outcome) | per-concept qualitative evidence summary | coverage, manual corrections |
| **Predicted recall** | `review_log` (append-only FSRS reviews) replayed by the scheduler | `card_state` cache, concept-level aggregate with an uncertainty band | coverage, manual corrections |

- **Schedule retrieval items, not concepts.** A `recall_item` (prompt, grounded answer key with citations, linked concept_ids, item version) is the FSRS card. Concept-level recall is an aggregate over its items, displayed as an uncertain fade indicator — which also isolates scheduling from concept merges/splits (items keep their own history; concept membership resolves through lineage).
- **`review_log` stores a full snapshot per row** (item_id, item_version, concept_ids at the time, rating, timestamp, elapsed, state-before, hints used, retrieval type, `fsrs_params_version`). `card_state` is a **rebuildable cache**: replaying the log under new parameters (after optimization or an FSRS upgrade) re-derives the schedule without touching evidence. `ts-fsrs` implements FSRS v6 and exposes an optimizer binding that trains parameters from review logs (docs fetched; exact `ReviewLog` field list not verified — confirm in Phase 9). Wrap it in `domain/learning` so the library is replaceable.
- **Only successful retrieval strengthens:** `review_log` rows can only be created by the `review.submit` path from an assessed attempt; there is no API that creates a review from "mark as learned". Hint-assisted successes are recorded as such and mapped to a rating by explicit policy (TDD'd).
- **Manual corrections are a separate table** (`manual_adjustment(kind: coverage|note|dismissed_suggestion, target, value, at)`), applied as an overlay on coverage only; they are structurally unable to enter `review_log`.
- **Append-only discipline:** no UPDATE/DELETE triggers on T0 evidence tables (enforced by `BEFORE UPDATE/DELETE ... RAISE(ABORT)` triggers and by repository APIs exposing insert-only methods). Corrections are new rows that reference the row they correct.
- **Not event sourcing everywhere.** Only learning evidence and provenance-bearing artifacts are append-only; operational state (jobs, UI position) uses ordinary mutable tables. Full event sourcing is overkill and hurts debuggability.

---

## Privacy Architecture for Optional Web Research (Focus 8) [MEDIUM; OS-level egress control SPIKE]

- **Default-deny network by construction:** renderer CSP `connect-src` limited to the app origin; all Electron sessions get a `webRequest` filter that cancels non-app origins; Main denies `will-navigate`/`window.open` to external URLs (links open via an explicit "open in browser" action that does not carry content).
- **Egress Broker is the single outbound process** (web tools and model/voice downloads). Engine hosts and Core never open sockets: enforced by lint (`no-restricted-imports` for `http/https/net/tls/dns/undici/fetch` in `engines/*`, `pipelines/*`, `domain/*`) and by a CI test that runs the full import->lesson flow with outbound traffic blocked and asserts zero connection attempts. **Caveat:** Electron session filters do not govern Node-level sockets in utility processes, so for engine hosts the guarantee is code-level + test-level, optionally hardened per-OS (macOS sandbox profile, Windows firewall rule) after a spike.
- **Consent gate (`domain/privacy` + Core service):** web tools are *off* until the user enables research; each outbound query is presented as the **exact string** and provider before sending (remembered per-session if the user chooses); an n-gram overlap screen flags queries that contain text copied from private blocks and requires explicit approval or redaction; passage text is never sent without a per-send confirmation. Downloads are separate, user-initiated, host-allowlisted and hash-verified.
- **Audit:** `egress_log(at, kind, host, payload_hash, payload_preview, consent_grant_id)` is T0, user-visible.
- **Separation of evidence:** `web_evidence(id, url, fetched_at, published_at, provider, snapshot_hash, text_snapshot)` lives in its own domain (D10). It has **no FK into `concept_evidence`** and `citation.citation_kind='web'` never satisfies the grounded invariant. v1 offers no "promote to knowledge map" path (out of scope: PDF-only), which makes silent ingestion impossible rather than merely discouraged. UI always labels online evidence with link and date.
- **LLM tool use is mediated:** the local model may *request* `search/open/read`; the request is a message to the broker through the consent gate, never a direct capability.

---

## Schema Versioning and Migrations (Focus 9) [MEDIUM]

- **Forward-only numbered SQL files** (`0001_init.sql`, ...) applied by an in-house ~100-line runner in Core before any service starts; `schema_migration(id, checksum, applied_at, app_version)` plus `PRAGMA user_version`. Checksum mismatch on an applied file = refuse to start (guards against edited history).
- **Backup before migrate:** if migrations are pending, create `backups/danesh-v{N}-{timestamp}.db` via `VACUUM INTO` (or the SQLite backup API) and `index.db` is simply marked for rebuild instead of backed up. Keep the last K backups; surface "updating your library" UI during the run.
- **Transactional DDL:** each migration runs in one transaction; `PRAGMA foreign_key_check` after; failure rolls back and the app starts in a read-only "recovery" mode offering the backup, never in a half-migrated state.
- **Downgrade protection:** a DB with `user_version` > app's known version is opened read-only/refused with a clear message.
- **Expand/contract:** prefer additive changes; avoid rewriting T0 tables. Large data migrations are written to be resumable (batched, keyed) and tested on a synthetic large DB.
- **JSON payload versioning:** `payload_schema_version` columns with **upcasters on read** (pure functions in `domain`) so block/lesson payload shape can evolve without table rewrites.
- **Derived artifacts are not migrated, they are re-fingerprinted:** a pipeline/prompt/schema change bumps `pipelineVersion`, making artifacts `superseded_producer`; T2 indexes are dropped and rebuilt.
- **Tests (TDD per project mandate):** golden DB files from every released schema version are migrated forward in CI on Windows and macOS and then run against the repository test-suite.
- **SQLite settings:** WAL, `foreign_keys=ON`, `busy_timeout`, `synchronous=FULL` (write rate is low; durability of review evidence matters more than throughput), single writer in Core, read-only connections for read-heavy paths, periodic `wal_checkpoint(TRUNCATE)` at idle.
- **Driver choice (architecture constraint, STACK.md decides):** synchronous API behind a `Db` interface. Default recommendation `better-sqlite3` (mature; backup/extension APIs) which needs `@electron/rebuild`-style ABI builds and `asarUnpack` for the `.node` file. Alternative `node:sqlite`: Node docs mark it Stability 1.2 (release candidate as of Node 25.7), with `loadExtension` gated by `allowExtension`, plus sessions/changesets. Electron 44.7.0 bundles Node 24.21.0 (releases page fetched); whether `node:sqlite` is enabled and stable inside Electron's Node build is **unverified [LOW/SPIKE]** — decide in the Foundation spike, keep the interface so either works.

---

## Architectural Patterns

### Pattern 1: Durable task with transactional output

**What:** Output rows and the task state flip commit atomically; heavy bytes go to the CAS first.
**When to use:** Every pipeline step (page evidence, OCR region, LLM chunk, TTS sentence).
**Trade-offs:** + exact resume, no duplicate work, trivial retry; - requires every step to be expressed as an idempotent function of declared inputs.

```typescript
async function runTask(t: Task, host: EngineHost<any, any>) {
  const out = await host.run(inputFor(t), { signal, onEvent });      // pure compute, may crash
  const blobHash = await blobs.putAtomic(out.bytes);                  // idempotent by hash
  db.transaction(() => {                                              // single writer, sync
    artifacts.upsert(t.unitKey, out.rows, blobHash);                  // UNIQUE(job, kind, unit_key)
    tasks.markDone(t.taskId);
  })();
}
```

### Pattern 2: Fingerprint + producer snapshot on every derived artifact

**What:** `inputFingerprint` (content hashes of inputs + producer config) and a `Producer` reference stored with each artifact.
**When to use:** D3-D6 artifacts and audio cache keys.
**Trade-offs:** + staleness is a cheap comparison, caching is correct by construction, model switches are harmless; - needs discipline to hash *all* real inputs (test: mutate each input in turn and assert the fingerprint changes).

### Pattern 3: Evidence stage / assembly stage split

**What:** Engines write raw evidence; a deterministic TS assembler builds blocks.
**When to use:** The PDF pipeline, and by extension any "engine output -> canonical form" step.
**Trade-offs:** + quality iteration without re-running engines, unit-testable; - evidence storage cost (mitigated: payloads are blobs, droppable for T1 only with explicit policy).

### Pattern 4: Supervisor with brokered ports

**What:** Main supervises and brokers; Core and hosts talk over direct ports.
**When to use:** All process wiring.
**Trade-offs:** + Main never on the hot path, crash domains clean; - more wiring and reconnect logic (write once in a shared `supervisor` module with fake-process tests).

### Pattern 5: Pure core, impure shell

**What:** All decisions (FSM transitions, alignment, merge rules, staleness, consent, coverage, FSRS replay) are pure functions in `domain/*`; Core/services only load, call, persist.
**When to use:** Anywhere the brief mandates TDD.
**Trade-offs:** + deterministic tests, replayability; - slightly more mapping code.

---

## Data Flow

### Request Flow (interactive)

```
[User selects text -> "Explain"]
   ↓
Renderer ─ call('lesson.explainSelection') ─> Preload ─port─> Core RPC (zod validate)
   ↓                                                              ↓
  (UI shows streaming state)                    LessonService: retrieve (index.db) ─> enqueue interactive job (priority 0)
   ↑ token events (<=10Hz coalesced)                              ↓
   └──────────── subscribe(topic) <── Core <── LLM host (model affinity, abort on cancel)
                                                  ↓
                          verifier -> persist lesson_version + citations (txn) -> invalidate(['lesson', id])
```

### Key Data Flows

1. **Import:** file dialog (Main) -> `library.importPdf` -> hash + CAS (T0) -> `import` job -> per-page `pdf.page` tasks (+ conditional `ocr.region` tasks for undecodable regions only) -> `evidence_*` -> assemble -> candidate `extraction_run` -> quality gate -> `active_run_id` swap -> enqueue chunk/embed -> `invalidate`.
2. **Synthesis:** chunks -> map tasks (concept candidates) -> candidate matching (hybrid retrieval over existing concepts) -> adjudication tasks -> `knowledge_delta` -> single-transaction apply -> staleness evaluation -> curriculum projection rebuilt.
3. **Language:** (scope: selection / concept / source) -> per-block `lang_segment` tasks with glossary -> verification of coverage/omissions -> persisted with producer + fingerprint. Summarization is a separate job kind that cannot overwrite normalization output.
4. **Audio:** normalized text -> sentence segmentation -> `tts.sentence` tasks keyed `hash(text, voice snapshot, params)` -> clips in CAS with timing -> playback queue; playback speed is a client-side concern so it never fragments the cache.
5. **Learning:** reading events (append) -> coverage projection; practice -> `assessment_attempt` -> (success) `review_log` -> replay -> `card_state` -> concept recall aggregate -> UI fade indicator. Three independent flows.
6. **Model switch:** `role_binding` update only -> `superseded_producer` flags on affected artifacts -> optional user-triggered regeneration jobs create *new versions*; old versions and all evidence remain.

### State Management (renderer)

```
Core (SQLite) ── invalidate events ──> TanStack Query cache ──> React components
React components ── call() mutations ──> Core ── (commit) ── invalidate
Local UI-only state (panel open, scroll, selection) ── small client store; reading position persisted via call()
```

---

## Scaling Considerations

The scale axis is **library size on one machine**, not users.

| Library size | Architecture adjustments |
|--------------|--------------------------|
| 1-5 books (~2k pages) | Everything default. Flat vector scan, brute-force candidate matching, single worker thread |
| ~50 books (~20k pages, ~100k chunks) | Paginated block APIs mandatory; FTS5 + flat scan in worker with int8/float16 quantized vectors if needed; concept-candidate matching uses ANN pre-filter; projection rebuild incremental per delta |
| 200+ books | Evaluate `sqlite-vec`/ANN index behind `VectorIndex`; lazy evidence pruning policy (T1 evidence blobs); separate heavy aggregation worker; consider read-replica connections |

### Scaling Priorities

1. **First bottleneck: LLM throughput/model swaps**, not storage. Fix with model-affinity batching, on-demand (lazy) generation, and caching by fingerprint.
2. **Second bottleneck: memory pressure** (model + OCR rasters + renderer). Fix with the resource governor, disk-backed rasters, and bounded pages-in-flight.
3. **Third: index size/time** for embeddings and concept matching; fix behind the `VectorIndex` interface.

---

## Anti-Patterns

### Anti-Pattern 1: SQLite (or heavy work) in the Main process
**What people do:** open the DB and run pipelines in Main "for simplicity".
**Why it's wrong:** a long transaction, migration, or native-engine crash stalls or kills the whole app, window and OS integration included.
**Do this instead:** Core `utilityProcess` owns the DB; Main only supervises.

### Anti-Pattern 2: Engines write to the database or hold app state
**What people do:** give the OCR/LLM worker a DB handle so it can "save as it goes".
**Why it's wrong:** crash mid-write, multi-writer lock contention, impossible idempotency, engines become non-replaceable.
**Do this instead:** engines return results; Core persists them with the task transition in one transaction.

### Anti-Pattern 3: Markdown (or one big text blob) as the source of truth
**What people do:** convert PDF -> Markdown -> feed everything downstream.
**Why it's wrong:** loses bbox/provenance/quality, no stable IDs, impossible citations, churn on re-extraction.
**Do this instead:** typed blocks with stable `block_id`; Markdown is an output projection.

### Anti-Pattern 4: Cascade-delete or in-place regeneration on change
**What people do:** when a source/model changes, delete and regenerate derived content.
**Why it's wrong:** destroys learning history references and prior lessons; violates the "never erase progress" requirement.
**Do this instead:** retire + lineage + immutable artifact versions + staleness flags; regenerate on demand into new versions.

### Anti-Pattern 5: One "mastery" number
**What people do:** merge reading, quiz success and schedule into a score.
**Why it's wrong:** unsupportable as ground truth; violates the product's core honesty constraint; makes fixes retroactively impossible.
**Do this instead:** three tables, three projections, no shared column; FSRS recomputed by replaying the immutable review log.

### Anti-Pattern 6: Scheduling concept IDs directly
**What people do:** attach FSRS state to concept rows.
**Why it's wrong:** concept merges/splits then silently corrupt or lose review history.
**Do this instead:** cards are `recall_item`s; concept recall is an aggregate resolved via `concept_lineage`.

### Anti-Pattern 7: Passing document-sized payloads over IPC / exposing raw ports or `ipcRenderer`
**What people do:** send full pages/books through IPC; expose generic `send(channel, ...)` from preload.
**Why it's wrong:** UI jank (structured clone cost) and a wide, unvalidated attack surface.
**Do this instead:** paged ID-based queries, blob references, and a closed typed method map re-validated in Core.

### Anti-Pattern 8: "Fits in RAM" == "supported"
**What people do:** pick a model by file size vs free memory.
**Why it's wrong:** violates MODEL requirements; produces OOM loops and poor quality.
**Do this instead:** recorded `hardware_check` smoke runs + per-task `model_eval` results gate the registry.

### Anti-Pattern 9: Unit-test-only confidence in crash recovery
**What people do:** test the FSM but never actually kill processes.
**Why it's wrong:** the brief requires surviving crashes/OOM.
**Do this instead:** crash-injection harness (kill host mid-task, kill Core mid-transaction, corrupt page, truncated blob write) as an acceptance suite from the day the job kernel exists.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Search/read providers (optional) | Egress Broker only, behind consent gate | Provider is user-visible; no passage text without per-send consent; results stored in D10 |
| Model/voice hosts (downloads) | Egress Broker downloader, host allowlist, resumable, sha256-verified | Only network use outside research; progress as a job (`blocked: model_missing` until done) |
| OS | Native dialogs, protocol handler, drag-and-drop, installers | Packaged-mode behavior verified on real Windows and macOS (project mandate) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Renderer <-> Core | Typed RPC + event subscription over a preload-private MessagePort | zod re-validation in Core; sender-checked port hand-off; invalidation events |
| Main <-> Core / Hosts | `utilityProcess` lifecycle events + brokered ports | Main never in data path; restart policy with backoff |
| Core <-> Engine Hosts | Engine-host protocol (request, progress events, abort, heartbeat) over `parentPort`/MessagePort | Blobs by reference; hosts have no DB and no network |
| Pipelines <-> Storage | Repository interfaces; sync transactions | Only Core imports `storage` |
| Pipelines <-> Engines | `engine-api` interfaces only | Conformance suites gate implementations |
| D3 <-> D5/D6 | By `block_id` + `content_hash` + quote selector, resolved via `block_lineage` | Never by array position or page number |
| D5/D6 <-> D7/D8 | By `concept_id`/`lesson_version_id`/`item_id`, resolved via lineage | D7 never FK-cascades; `ON DELETE RESTRICT` |
| Core <-> Egress Broker | Grant-carrying requests only | Policy decisions in `domain/privacy`, execution in the broker |

---

## Suggested Build Order (Focus 10)

### Dependency graph

```
[A] Foundation: monorepo, contracts, boundary lint, process topology skeleton
    (Main/Preload/Renderer/Core + ping RPC), security baseline, CI Win+mac
      │
      ├─► [B] Storage kernel: SQLite in Core, migration runner + backup, CAS blobs, logging
      │         │
      │         ├─► [C] DURABLE JOB KERNEL: FSM, scheduler, boot recovery, resource governor,
      │         │        engine-host protocol + fake engine, crash-injection harness
      │         │           │
      │         │           ├─► [D] PDF pipeline: import/CAS -> Stage A (text-layer) -> Stage B assembly
      │         │           │        -> block model, alignment/ID stability, outline, quality status
      │         │           │           │
      │         │           │           ├─► [E] Semantic reader (needs only D's blocks + fixtures)  ──┐ parallel
      │         │           │           ├─► [F] Doc intelligence: OCR/layout/tables/equations/figures ─┤ with E, G
      │         │           │           │        (needs model ASSET STORE from [G1])                    │
      │         │           │           └─► [L0] Learning core (pure TS): coverage events, review_log, │
      │         │           │                    FSRS replay, signal separation  (no AI needed)  ──────┘
      │         │           │
      │         │           └─► [G] Model manager: G1 asset store+registry+snapshots+download (early, needed by F);
      │         │                    G2 hardware probe, role selection, evals (before inference use)
      │         │                       │
      │         │                       └─► [H] Inference + embeddings adapters, chunking, index.db hybrid retrieval
      │         │                              │
      │         │                              ├─► [I] Knowledge synthesis (concepts, merge, relations, incremental)
      │         │                              │        │
      │         │                              │        └─► [K] Lessons (grounded/supplemental, verifier, section staleness)
      │         │                              │                 │
      │         │                              ├─► [J] Lang: translation + normalization + summary ──┐ (starts after H;
      │         │                              │        (glossary seeded from I, but pass 1 is independent) │ parallel with I)
      │         │                              │                                                      │
      │         │                              │            ┌── [M] Audio/TTS (needs J output + tts host)
      │         │                              └─► [N] Web research (needs H tool-use + consent gate)  (parallel, any time after H)
      │         │                                       
      │         └─► [L] Learning generation: item authoring + grading (needs K, H) on top of [L0]
      └─► [Z] Hardening/release: large-book reliability, a11y, eval gates, installers, licenses
```

### Ordering rules and rationale

1. **A -> B -> C before any PDF code.** Every later capability is "a job that writes artifacts"; building the job kernel and crash-injection harness first means PDF import is born resumable instead of retrofitted. The brief lists persistent jobs in Phase 2; recommend promoting the **kernel itself into the Foundation/early Phase 2** and the PDF pipeline right after.
2. **Packaging risk in Phase 1, not Phase 11.** The Foundation packaged smoke test must load `better-sqlite3` (or `node:sqlite`) **inside the Core `utilityProcess`** and spawn one dummy native engine host on both Windows and macOS (signing, `asarUnpack`, macOS entitlements/notarization for helper processes and dylibs). Discovering a native-module packaging blocker in the final phase would force architecture change.
3. **Fixtures + eval harness start with D**, not Phase 4. The fixture suite and metrics runner are needed to judge assembly rules and later OCR; build the skeleton alongside D and grow it.
4. **Split the model manager.** Asset store/registry/snapshot/download (G1) is needed by OCR/layout models in F; hardware probing, role selection UI and quality evals (G2) can follow before LLM use (H). The brief puts the whole manager in Phase 5; moving G1 earlier avoids F blocking.
5. **Reader (E), doc intelligence (F) and learning core (L0) can proceed in parallel** after D: E needs blocks only; F improves the same blocks via re-extraction using the alignment machinery from D; L0 is pure TS/TDD with no AI dependency.
6. **Lang (J) does not depend on concepts** for its first pass (per-block translation with the source's own term list); the cross-source glossary comes from I afterward. Start J in parallel with I once H exists.
7. **Engine spikes run as an early parallel track** (feed ADRs, not product code): Persian TTS naturalness listening tests, Persian translation model quality, Persian/mixed-script OCR, PDF engine bidi/ordering accuracy on real fixtures, `node-llama-cpp`-in-`utilityProcess`, and vector backend benchmarks. The adapters in `engine-api` are written against spike findings, so the riskiest, least-known quality questions (TTS, Persian OCR) are answered while the app skeleton is built.
8. **Research/web (N) is architecturally independent** but the **default-deny egress policy and consent-gate skeleton belong in Foundation (A)** so no later phase can accidentally open a socket.

### Research flags for phases (what needs deeper research/spikes)

| Phase | Flag | Reason |
|-------|------|--------|
| Foundation | **SPIKE** | Native addon (better-sqlite3 vs node:sqlite) inside `utilityProcess` on packaged Win+mac; signing/notarization of helper processes |
| Document pipeline | Deeper research | PDF engine choice for Persian bidi/logical-order repair, multi-column reading order; alignment thresholds need real data |
| Doc intelligence | Deeper research | OCR/layout/math engines for Persian + English; table structure recognition |
| Inference/models | **SPIKE** | `node-llama-cpp` docs say run in Electron **main** process (never renderer) and are silent on `utilityProcess`; GPU backend behavior per OS (a past llama.cpp macOS-without-Metal crash inside Electron was fixed upstream, so version-pin and test); constrained decoding support; footprint measurement |
| Knowledge | Deeper research | Merge adjudication precision and prerequisite inference quality need eval design before implementation |
| Audio | **SPIKE** | Local Persian TTS naturalness is unproven; plan for the adapter to survive an engine swap |
| Learning | Light | Standard FSRS; verify `ts-fsrs` `ReviewLog` fields and optimizer packaging (binding is native/WASM) |
| Research | Light | Standard patterns; privacy test design matters more than technology |

---

## Sources

- Electron `utilityProcess` API reference (fetched 2026-10-09): https://www.electronjs.org/docs/latest/api/utility-process — fork options, events, MessagePort passing, macOS options. **[HIGH]**
- Electron releases page (fetched): https://releases.electronjs.org/ — Electron 44.7.0 / Chromium 152 / Node 24.21.0 current stable at research time. **[MEDIUM, fetched summary]**
- Node.js `node:sqlite` docs (fetched): https://nodejs.org/api/sqlite.html — stability index, `allowExtension`/`loadExtension`, sessions. **[HIGH for stated fields; `backup()` and WAL sections not read]**
- node-llama-cpp Electron guide (fetched): https://node-llama-cpp.withcat.ai/guide/electron — main-process-only guidance, packaging constraints. **[MEDIUM; utilityProcess behavior unverified]**
- llama.cpp PR #9875 (search result): https://github.com/ggml-org/llama.cpp/pull/9875 — large-allocation crash inside Electron on macOS without Metal, fixed upstream. **[LOW, search summary]**
- sqlite-vec repository (fetched): https://github.com/asg017/sqlite-vec — pre-v1 status, licenses, sponsorship. **[MEDIUM]**
- ts-fsrs repository (fetched): https://github.com/open-spaced-repetition/ts-fsrs — FSRS v6, optimizer binding, Node >= 20. **[MEDIUM; ReviewLog fields unverified]**
- better-sqlite3 + Electron ABI/asar packaging notes (search results, e.g. https://docs.triliumnotes.org/developer-guide/dependencies/updating-deps/bettersqlite-binaries). **[LOW-MEDIUM]**
- Project constraints: `D:/workspace/AI/danesh/.planning/PROJECT.md`.
- Patterns (durable task queues with transactional outbox/idempotent steps, content-addressed storage, expand/contract migrations, W3C-style text-quote anchoring for citations, supervisor/port-broker process topologies) are established practice synthesized from the author's knowledge, not from a single source. **[MEDIUM]**

---
*Architecture research for: local-first Persian-first Electron learning environment with PDF semantic reconstruction and local AI*
*Researched: 2026-10-09*
