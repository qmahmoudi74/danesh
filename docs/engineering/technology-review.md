# Technology review: database layer and AI orchestration

Date: 2026-10-10. Short recommendations, not decisions. Nothing here was installed or migrated.

## Database: Drizzle ORM on better-sqlite3

State today: one 29-line `packages/storage/src/db.ts`, one init migration, one probe table. SQL used to leak into a Core
check; it now lives only in `packages/storage` (dependency-cruiser rule `sql-only-in-storage`).

Recommendation: **adopt Drizzle with the existing better-sqlite3 connection when Phase 2 adds the first real tables**
(documents, blocks). Reasons: typed queries and row types from one schema file, no second engine, raw SQL still
available through its `sql` template for FTS5, `vec0`, PRAGMAs and migrations.

Constraints to keep:

- Keep our hand-written, forward-only, checksummed SQL migrations and the pre-migration backup. Use Drizzle for the
  query layer and schema types only; do not let it generate or apply migrations.
- Keep `openLibraryDb` as the single place that opens the database (one writer, Core).
- Migrate incrementally: new tables first; existing tables only when touched. No data migration is involved.
- Verify the then-current stable Drizzle version, its better-sqlite3 support and license at adoption time (the stack
  notes list 0.45.x stable and a 1.0 RC; not re-verified here).

## AI orchestration: Mastra and Vercel AI SDK

State today: node-llama-cpp 3.22.1 runs inside an isolated utility process (`packages/engines/llm-probe`), reached
through the engine client and host protocol in Core. Durable jobs (Phase 1, plan 01-13) own retries, resume and
checkpoints.

Recommendation: **do not adopt either now.** There is no lesson, agent or tool-calling feature yet, and both would
sit on top of work that is still being decided.

- Phase 4 (model runtime): define one small provider interface (`generate` with streaming and an `AbortSignal`,
  JSON-schema-constrained output, embeddings) implemented by the node-llama-cpp engine host. Everything above it
  depends on the interface, not on node-llama-cpp.
- Phase 8 (grounded lessons, scoped Q&A): run a short spike to evaluate the Vercel AI SDK core as the typed
  tool-calling and structured-output layer *above* that interface, with a local provider adapter. Adopt it only if
  the adapter is thin, cancellation passes through, and the bundle and license fit.
- Mastra: not recommended for this app. It brings its own workflow, storage and server concepts that would duplicate
  the durable job kernel and the process isolation we already have. Revisit only if multi-step agent workflows
  become a core feature and the kernel cannot express them.

Not verified here: these are design-level judgments from the documented architecture, not benchmarks. The Phase 8
spike must measure memory, cancellation, streaming and packaging before anything is installed.
