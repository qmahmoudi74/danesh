---
status: proposed
date: 2026-10-10
decision-makers:
  - the user (product owner), who authorized a Windows-first PDF increment on 2026-10-10
kind: engine
---

# 0005: pdf.js for PDF import checks and the original-page viewer

## Context and Problem Statement

The owner asked for the first usable journey ahead of the remaining Phase 1 plans: pick a PDF, store the original,
list it, view its original pages, and find it again after a restart, offline. Danesh needs a maintained PDF
library to (1) refuse non-PDF, encrypted and damaged files with a clear reason before anything is added, and
(2) draw original pages. Text extraction, reading order and the semantic reader are out of scope; the S-PDF spike
still governs the extraction engine.

## Decision Drivers

- Permissive license (the stack notes keep MuPDF behind D-LICENSE because it is AGPL).
- Pure JavaScript, no native binaries, works offline under the existing CSP (`script-src 'self'`, `connect-src
  'none'`, no `unsafe-eval`, no WebAssembly).
- The page never receives file system access; heavy parsing stays off the UI thread.
- Large PDFs must not be read into memory just to check them.

## Considered Options

- pdf.js (`pdfjs-dist` 6.4.299, Apache-2.0), the default candidate in the stack notes.
- PDFium as WebAssembly (`@hyzyla/pdfium`): needs `wasm-unsafe-eval` and a canvas bridge; single maintainer.
- MuPDF (`mupdf` 1.28.1): AGPL-3.0, excluded until D-LICENSE.
- Showing the PDF in Chromium's built-in viewer: needs plugins and a looser window policy; not a Danesh surface.

## Decision Outcome

Proposed and implemented for the increment: pdf.js 6.4.299.

- Import check and text extraction in the isolated `pdf` engine host (its own utility process; amended
  2026-10-10 by PDF-02, previously inside Core): pdf.js opens the file through a byte-range transport (pdf.js does
  not treat an Electron utility process as Node, so it cannot open paths itself), reports page count and title, and
  maps `PasswordException` to encrypted and `InvalidPDFException` to damaged. Extraction rebuilds lines in visual
  order from positions and recovers logical order with the Unicode bidi algorithm (`bidi-js` 1.1.0, MIT), because
  pdf.js item order is not reading order for Persian. Core only stores the results.
- Original-page viewer in the renderer: the verified original bytes arrive over the private Core port; pdf.js
  parses them in its own module Web Worker served from `app://danesh` and draws one page at a time into a canvas.
  Drawing a visible page is UI work, so it is the one PDF task allowed in the renderer; extraction will run in a
  utility process.
- `useWasm: false` everywhere, so the CSP is unchanged. JPEG 2000 and JBIG2 images use pdf.js's JavaScript paths
  and may be missing where none exists. Standard-14 and CJK font data are not bundled yet (no fetch is allowed),
  so non-embedded fonts fall back to system fonts.

### Consequences

- One dependency (no native code). `@napi-rs/canvas`, an optional pdf.js dependency for drawing in Node, is not
  installed (`ignoredOptionalDependencies`).
- PDF parsing no longer runs in Core (PDF-02): the `pdf` host takes one task at a time, an import can run between
  two pages of an extraction, and the host stops after 20 s without work.
- The viewer receives the whole original in one message; imports are capped at 512 MiB.

### Confirmation

Unit tests (`apps/core/test/documents.test.ts`) and the `features/ui/pdf-library.feature` scenarios run on
Windows against the Electron build, including CSP-violation checks while pages are drawn. macOS is not verified.

## Spike Evidence

Not a spike: this ADR does not select the extraction engine. S-PDF remains open.

Pass policy commit: none (no governed spike run).

### Pass policy

Not applicable.

### Platforms actually run

Windows 11 x64 (development machine and the Electron test build). macOS: not run.

### Fixtures

Generated in tests by `apps/core/test/fixtures/pdf-fixtures.ts` (valid, encrypted and damaged PDFs).

### Results

See the plan summary for the commands and outcomes of this increment.

### Raw evidence

Playwright output of the `@plan-pdf-01` scenarios; screenshots under `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/pdf-01/`.

## License

`pdfjs-dist` 6.4.299 is Apache-2.0 (npm metadata and the package's LICENSE file), recorded with its integrity hash
in `third_party/package-license-metadata.json`. It ships no NOTICE file.

## Packaging

Bundled by Vite into the renderer (with the worker as a separate `.mjs` asset, served as JavaScript by the app
protocol) and into Core as lazily loaded chunks. Nothing is unpacked from the asar.

## Security

The page learns only a single-use token and the file name; Main gives Core the chosen path. Core validates every
request and returns bytes only for documents in the library, re-hashing them on read. pdf.js runs with WebAssembly
disabled and without network access.

## Pros and Cons of the Options

pdf.js: permissive, maintained, JavaScript only, but RTL text order is weak (irrelevant until extraction). PDFium
and MuPDF may extract Persian better but need a looser CSP or an AGPL decision; they stay candidates for S-PDF.

## More Information

Owner direction of 2026-10-10 (Windows-first PDF increment), `.planning/STATE.md`, ADR 0001 (process topology),
ADR 0004 (license). Revisit when S-PDF selects the extraction engine or when the PDF worker process exists.
