---
increment: pdf-01
title: First usable PDF journey (owner-authorized, Windows-first)
status: complete-windows
date: 2026-10-10
platforms_verified: [windows-x64]
platforms_not_verified: [macos]
commits: [2559c90, 2a78fcc]
---

# PDF-01: Import a PDF, keep it in the Library, view its original pages

Owner direction (2026-10-10): ship a usable PDF journey ahead of the remaining Phase 1 infrastructure plans. This
is an out-of-roadmap increment. It does not complete any Phase 1 plan, and it does not change their acceptance
criteria. Plan 01-10's CI gate and macOS work remain open; Plan 01-13 (durable jobs) was not started.

## What works (Windows, verified)

Pick a PDF with «افزودن PDF» (Home or Library) → Core checks it with pdf.js and streams the original into the
content-addressed store → one `document` row (migration `0003_documents`) → the Library lists title, page count,
size, date and file name → «باز کردن» draws the original pages (previous/next, Page Up/Down, Home/End,
zoom 50–300%) → close and relaunch → the same entry opens again without re-importing.

- Re-importing identical bytes finds the existing entry (unique content hash); the blob is stored once.
- Non-PDF, encrypted and damaged files are refused with a Persian reason, and nothing is added.
- Persian and English file names and library paths (spaces, apostrophe) work.
- The page never sees file paths (single-use token from Main to Core). The CSP is unchanged: no wasm, no eval,
  no network. pdf.js parses in Core during import and in its own Web Worker for viewing (ADR 0005, proposed).
- Nothing is extracted: the viewer says so, and Home's copy states extraction comes later.

## Decisions

- Migration numbering: documents take `0003`; the durable job kernel moves to `0004_jobs.sql`. 01-13-PLAN.md is
  updated accordingly (file name only; its content is unchanged).
- Drizzle is not installed: the technology review requires approval of an exact pin first. Document SQL is a small
  module in `packages/storage/src/documents.ts`; adopting Drizzle stays deferred.
- No drag-and-drop: a sandboxed page cannot turn a dropped file into a path without widening the preload API.

## Verification (actually run, Windows 11 x64)

| Check | Result |
| --- | --- |
| `pnpm check:format`, `lint`, `typecheck`, `depcruise`, `licenses:scan`, `check:adr`, `check:ci`, features-first | pass |
| `pnpm test` (Vitest) | 433 passed |
| `pnpm test:e2e` full suite (test build, final code) | 45 passed, 31 skipped (bound to later plans), 0 failed. Two existing scenarios that hard-coded schema version 2 now read it from the shipped migrations |
| `@plan-pdf-01` scenarios against the packaged test build (`DANESH_E2E_PACKAGED=1`) | 6 passed |
| `pnpm package` + `run-packaged-smoke --persian-paths --install-nsis` | pass, 8/8 app checks |
| Real journey with a Chromium-printed 3-page Persian/English PDF, test build, Persian user-data path, two launches | pass; screenshots in `evidence/pdf-01/` |

The native file dialog is stubbed in automated runs (Playwright cannot drive it); the import itself goes through
Main, Core, pdf.js and the store unchanged. Offline: the app makes no network requests by design (Main egress block,
`connect-src 'none'`). It was not re-run with the network adapter disabled.

## Not done / known limits

- Not verified on macOS. No CI run includes this increment (nothing was pushed).
- Encrypted PDFs are refused, not unlocked (DOC-04's password prompt is not implemented).
- Imports are capped at 512 MiB; the viewer receives the whole original in one message.
- Large or broken PDFs are parsed on Core's thread during import; the job kernel should move this to a worker.
- No text extraction, search, reader, deletion or rename. Rejected files leave no row, and the file is not stored.
- Standard-14 and CJK font data are not bundled, so PDFs that rely on non-embedded fonts fall back to system fonts.
