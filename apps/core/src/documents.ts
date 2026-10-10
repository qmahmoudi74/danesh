import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ImportFailure, LibraryDocument } from '@danesh/contracts/rpc.ts';
import type { Cas } from '@danesh/storage/cas.ts';
import type { Db } from '@danesh/storage/db.ts';
import { addDocument, type DocumentRow, getDocument } from '@danesh/storage/documents.ts';
import { inspectPdf, PdfRejected } from './pdf-inspect.ts';

/** Larger files are refused for now: the viewer receives the whole original in one message. */
export const MAX_PDF_BYTES = 512 * 1024 * 1024;
const SOURCE_TTL_MS = 60_000;
const HEADER_WINDOW_BYTES = 1024;

export type ImportResult =
  | { ok: true; document: LibraryDocument; duplicate: boolean }
  | { ok: false; reason: ImportFailure };

export function toLibraryDocument(row: DocumentRow): LibraryDocument {
  const { blobSha256: _hash, ...document } = row;
  return document;
}

/** Files Main registered after the user picked them; each token is usable once and only for a minute. */
export function createImportSources(now: () => number = Date.now) {
  const sources = new Map<string, { path: string; fileName: string; expires: number }>();
  return {
    add(token: string, path: string, fileName: string): void {
      for (const [key, source] of sources) if (source.expires <= now()) sources.delete(key);
      if (sources.size >= 20) throw new Error('Too many pending imports');
      sources.set(token, { path, fileName, expires: now() + SOURCE_TTL_MS });
    },
    take(token: string): { path: string; fileName: string } | undefined {
      const source = sources.get(token);
      sources.delete(token);
      if (!source || source.expires <= now()) return undefined;
      return { path: source.path, fileName: source.fileName };
    },
  };
}

/** A PDF header may follow a little leading junk, but must start within the first kilobyte (ISO 32000 practice). */
async function readSize(path: string): Promise<{ size: number; looksLikePdf: boolean }> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(HEADER_WINDOW_BYTES),
      0,
      HEADER_WINDOW_BYTES,
      0,
    );
    return { size, looksLikePdf: buffer.subarray(0, bytesRead).includes('%PDF-') };
  } finally {
    await handle.close();
  }
}

function titleFrom(fileName: string, metadataTitle: string | undefined): string {
  if (metadataTitle) return metadataTitle;
  const stem = fileName.slice(0, fileName.length - extname(fileName).length).trim();
  return stem || fileName;
}

/**
 * Checks that the file is a readable PDF, streams the original into the content-addressed store, then records one
 * library entry per distinct content. Nothing is added when any step fails.
 */
export async function importPdf(
  source: { path: string; fileName: string },
  { db, cas }: { db: Db; cas: Cas },
): Promise<ImportResult> {
  let size: number;
  try {
    const header = await readSize(source.path);
    if (!header.looksLikePdf || header.size === 0) return { ok: false, reason: 'not-pdf' };
    size = header.size;
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (size > MAX_PDF_BYTES) return { ok: false, reason: 'too-large' };

  let facts: Awaited<ReturnType<typeof inspectPdf>>;
  try {
    facts = await inspectPdf(source.path);
  } catch (error) {
    return { ok: false, reason: error instanceof PdfRejected ? error.reason : 'unreadable' };
  }

  let stored: { sha256: string; size: number };
  try {
    stored = await cas.put(createReadStream(source.path));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const { document, duplicate } = addDocument(db, {
    blobSha256: stored.sha256,
    fileName: source.fileName,
    title: titleFrom(source.fileName, facts.title),
    byteSize: stored.size,
    pageCount: facts.pageCount,
  });
  return { ok: true, document: toLibraryDocument(document), duplicate };
}

/** The verified original bytes (the store re-hashes them on every read). */
export async function readOriginal(
  documentId: string,
  { db, cas }: { db: Db; cas: Cas },
): Promise<Uint8Array | undefined> {
  const row = getDocument(db, documentId);
  if (!row) return undefined;
  const bytes = await cas.get(row.blobSha256);
  // A pooled Buffer would carry unrelated bytes across the port; send an exact copy in that case.
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : new Uint8Array(bytes);
}
