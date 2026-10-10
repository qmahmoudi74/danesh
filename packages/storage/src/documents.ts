import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';

export type DocumentRow = {
  documentId: string;
  blobSha256: string;
  fileName: string;
  title: string;
  byteSize: number;
  pageCount: number;
  importedAt: number;
  status: 'original';
};

const COLUMNS = `document_id AS documentId, blob_sha256 AS blobSha256, file_name AS fileName, title,
  byte_size AS byteSize, page_count AS pageCount, imported_at AS importedAt, status`;

/** Newest first. */
export function listDocuments(db: Db): DocumentRow[] {
  return db
    .prepare<[], DocumentRow>(
      `SELECT ${COLUMNS} FROM document ORDER BY imported_at DESC, rowid DESC`,
    )
    .all();
}

export function getDocument(db: Db, documentId: string): DocumentRow | undefined {
  return db
    .prepare<[string], DocumentRow>(`SELECT ${COLUMNS} FROM document WHERE document_id = ?`)
    .get(documentId);
}

/**
 * Adds a document for stored content, or returns the existing one when the same bytes were imported before
 * (the content hash is unique), so a re-import never creates a second library entry.
 */
export function addDocument(
  db: Db,
  input: Omit<DocumentRow, 'documentId' | 'importedAt' | 'status'>,
  now = Date.now(),
): { document: DocumentRow; duplicate: boolean } {
  return db.transaction(() => {
    const existing = db
      .prepare<[string], DocumentRow>(`SELECT ${COLUMNS} FROM document WHERE blob_sha256 = ?`)
      .get(input.blobSha256);
    if (existing) return { document: existing, duplicate: true };
    const document: DocumentRow = {
      ...input,
      documentId: randomUUID(),
      importedAt: now,
      status: 'original',
    };
    db.prepare(
      `INSERT INTO document (document_id, blob_sha256, file_name, title, byte_size, page_count, imported_at, status)
       VALUES (@documentId, @blobSha256, @fileName, @title, @byteSize, @pageCount, @importedAt, @status)`,
    ).run(document);
    return { document, duplicate: false };
  })();
}
