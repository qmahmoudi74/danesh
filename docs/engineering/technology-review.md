# Technology review: database layer and AI orchestration

Date: 2026-10-10. Implementation decisions for the user's handoff. No new dependencies installed.

## Database: Drizzle ORM on better-sqlite3

Committed storage owns the initial schema and probe table. Interrupted Plan 01-11 adds migrations, verified backups
and read-only recovery; it remains uncommitted and gated on Plan 01-10. SQL stays in `packages/storage`; only Core
opens the library (`sql-only-in-storage`).

Decision: **adopt Drizzle as the ordinary query layer when Phase 2 adds documents and canonical blocks**, with the
existing better-sqlite3 connection. Reasons: typed queries and row types from one schema file, no second engine, raw SQL still
available through its `sql` template for FTS5, `vec0`, PRAGMAs and migrations.

Constraints to keep:

- Keep our hand-written, forward-only, checksummed SQL migrations and the pre-migration backup. Use Drizzle for the
  query layer and schema types only; do not let it generate or apply migrations.
- Pass the existing Core-owned connection to Drizzle. No second database, connection pool, server or native driver.
- Use synchronous transactions inside Core. Measure real import batches when introduced; Drizzle performance and
  Electron compatibility have not been measured here.
- Migrate incrementally: new tables first; existing tables only when touched. No data migration is involved.
- Verify the then-current stable Drizzle version, its better-sqlite3 support and license at adoption time (the stack
  notes list 0.45.x stable and a 1.0 RC). Request approval for the exact pin and lockfile before installation.
  Do not install drizzle-kit or replace the migration runner.

The [official SQLite guide](https://orm.drizzle.team/docs/sqlite/get-started-sqlite) documents better-sqlite3 support
and reuse of an existing client.

## AI orchestration: Mastra and Vercel AI SDK

State today: node-llama-cpp 3.22.1 runs inside an isolated utility process (`packages/engines/llm-probe`), reached
through the engine client and host protocol in Core. Durable jobs (Phase 1, plan 01-13) own retries, resume and
checkpoints.

Decision: **keep isolated node-llama-cpp now; adopt Vercel AI SDK core for the Phase 8 lesson/tool layer;
reject Mastra for the current architecture.** There is no lesson or tool-calling feature to integrate today.

- Phase 4 (model runtime): define one small provider interface (`generate` with streaming and an `AbortSignal`,
  JSON-schema-constrained output, embeddings) implemented by the node-llama-cpp engine host. Everything above it
  depends on the interface, not on node-llama-cpp.
- Phase 8 (grounded lessons, scoped Q&A): introduce Vercel AI SDK core for typed tool calling and structured outputs
  above the isolated engine, with an in-process local provider adapter. Its [provider interface](https://ai-sdk.dev/providers/community-providers/custom-providers)
  supports streaming, tool calls and cancellation; the HTTP implementation in the guide is not our transport.
  Before installation, review an exact stable pin and license, and prove cancellation, streaming, constrained JSON
  and packaged execution using existing local resources. Keep retries/checkpoints in the planned job kernel.
- Mastra: rejected for this architecture. Its [workflow execution engine](https://mastra.ai/docs/workflows/overview),
  persistence and resume concepts would duplicate
  the durable job kernel and the process isolation we already have. Revisit only if multi-step agent workflows
  become a core feature and the kernel cannot express them.

These are implementation choices based on the architecture and official interfaces, not compatibility benchmarks.
No provider adapter, SDK, ORM or model was installed or claimed tested in this handoff.

## Other dependencies

| Area | Decision | Boundary or outstanding risk |
| --- | --- | --- |
| PDF extraction | Defer to Phase 2 and S-PDF | No parser is installed today; select only after the approved extraction/coverage gate. |
| LLM, OCR, TTS | Keep current isolated probes | Windows evidence exists; macOS packaged smoke is currently failing and must be diagnosed from real CI. Persian quality remains spike-gated. |
| State and UI | Keep React state and React Aria | No additional state store or UI kit; real accessible controls already exist. |
| Contracts | Keep zod | Strict receiver validation and the shared CSP-compatible initialization remain mandatory. |
| Jobs | Execute the approved durable job plan | It is unfinished; do not add a second workflow scheduler to bypass it. |
| Packaging | Keep electron-builder and fuse checks | CI never publishes; clean-account Tier B and restricted binary license reviews remain open. |
| Agent skills | Keep shared instructions and existing verification tools | No new collection or duplicate AGENTS.md skill is justified during the blocked PDF increment. |
