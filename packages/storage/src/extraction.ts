import { createHash } from 'node:crypto';
import type { ExtractedPage, PdfPageStatus } from '@danesh/contracts/pdf.ts';
import type { Db } from './db.ts';

export type ExtractionRow = {
  state: 'running' | 'completed' | 'failed';
  pageCount: number;
  pagesDone: number;
  startedAt: number;
  finishedAt: number | null;
  errorClass: string | null;
};

export type StoredBlock = {
  blockId: string;
  pageNumber: number;
  ordinal: number;
  kind: 'heading' | 'paragraph';
  rawText: string;
  normalizedText: string;
  direction: 'rtl' | 'ltr' | 'mixed';
  box: [number, number, number, number];
  flags: string[];
};
export type StoredPage = {
  pageNumber: number;
  status: PdfPageStatus;
  flags: string[];
  blocks: StoredBlock[];
};

/** Same original, extractor and position → same id, so provenance links survive re-reading. */
export function blockId(
  blobSha256: string,
  version: string,
  page: number,
  ordinal: number,
): string {
  return createHash('sha256')
    .update(`${blobSha256}|${version}|${page}|${ordinal}`)
    .digest('hex')
    .slice(0, 24);
}

export function getExtraction(
  db: Db,
  documentId: string,
  version: string,
): ExtractionRow | undefined {
  return db
    .prepare<[string, string], ExtractionRow>(
      `SELECT state, page_count AS pageCount, pages_done AS pagesDone, started_at AS startedAt,
              finished_at AS finishedAt, error_class AS errorClass
         FROM extraction WHERE document_id = ? AND extractor_version = ?`,
    )
    .get(documentId, version);
}

/** Creates the extraction, or marks an existing unfinished one running again from its last stored page. */
export function beginExtraction(
  db: Db,
  input: { documentId: string; version: string; pageCount: number },
  now = Date.now(),
): ExtractionRow {
  db.prepare(
    `INSERT INTO extraction (document_id, extractor_version, state, page_count, pages_done, started_at)
     VALUES (@documentId, @version, 'running', @pageCount, 0, @now)
     ON CONFLICT (document_id, extractor_version)
     DO UPDATE SET state = 'running', error_class = NULL, finished_at = NULL WHERE state != 'completed'`,
  ).run({ ...input, now });
  return getExtraction(db, input.documentId, input.version)!;
}

/** Stores one page and its blocks and advances the progress counter, all in one transaction. */
export function storeExtractedPage(
  db: Db,
  input: { documentId: string; version: string; blobSha256: string; page: ExtractedPage },
): void {
  const { documentId, version, blobSha256, page } = input;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO extracted_page (document_id, extractor_version, page_number, width, height, status, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      documentId,
      version,
      page.pageNumber,
      page.width,
      page.height,
      page.status,
      JSON.stringify(page.flags),
    );
    const insert = db.prepare(
      `INSERT INTO extracted_block (block_id, document_id, extractor_version, page_number, ordinal, kind,
         raw_text, normalized_text, direction, box, lines, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const block of page.blocks)
      insert.run(
        blockId(blobSha256, version, page.pageNumber, block.ordinal),
        documentId,
        version,
        page.pageNumber,
        block.ordinal,
        block.kind,
        block.rawText,
        block.normalizedText,
        block.direction,
        JSON.stringify(block.box),
        JSON.stringify(block.lines),
        JSON.stringify(block.flags),
      );
    const advanced = db
      .prepare(
        `UPDATE extraction SET pages_done = ?
          WHERE document_id = ? AND extractor_version = ? AND pages_done = ? - 1`,
      )
      .run(page.pageNumber, documentId, version, page.pageNumber);
    if (advanced.changes !== 1) throw new Error('Pages must be stored in order');
  })();
}

export function finishExtraction(
  db: Db,
  input: { documentId: string; version: string; errorClass?: string },
  now = Date.now(),
): void {
  db.prepare(
    `UPDATE extraction SET state = ?, error_class = ?, finished_at = ?
      WHERE document_id = ? AND extractor_version = ?`,
  ).run(
    input.errorClass ? 'failed' : 'completed',
    input.errorClass ?? null,
    now,
    input.documentId,
    input.version,
  );
}

type PageRow = { pageNumber: number; status: PdfPageStatus; flags: string };
type BlockRow = Omit<StoredBlock, 'box' | 'flags'> & { box: string; flags: string };

/** Stored pages in order, with their blocks in reading order. */
export function readExtractedPages(
  db: Db,
  input: { documentId: string; version: string; fromPage: number; toPage: number },
): StoredPage[] {
  const { documentId, version, fromPage, toPage } = input;
  const pages = db
    .prepare<[string, string, number, number], PageRow>(
      `SELECT page_number AS pageNumber, status, flags FROM extracted_page
        WHERE document_id = ? AND extractor_version = ? AND page_number BETWEEN ? AND ?
        ORDER BY page_number`,
    )
    .all(documentId, version, fromPage, toPage);
  const blocks = db
    .prepare<[string, string, number, number], BlockRow>(
      `SELECT block_id AS blockId, page_number AS pageNumber, ordinal, kind, raw_text AS rawText,
              normalized_text AS normalizedText, direction, box, flags
         FROM extracted_block
        WHERE document_id = ? AND extractor_version = ? AND page_number BETWEEN ? AND ?
        ORDER BY page_number, ordinal`,
    )
    .all(documentId, version, fromPage, toPage);
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    status: page.status,
    flags: JSON.parse(page.flags) as string[],
    blocks: blocks
      .filter((block) => block.pageNumber === page.pageNumber)
      .map((block) => ({
        ...block,
        box: JSON.parse(block.box) as StoredBlock['box'],
        flags: JSON.parse(block.flags) as string[],
      })),
  }));
}

/** Page numbers and statuses only: cheap enough to poll while an extraction runs. */
export function readPageStatuses(
  db: Db,
  input: { documentId: string; version: string },
): { pageNumber: number; status: PdfPageStatus }[] {
  return db
    .prepare<[string, string], { pageNumber: number; status: PdfPageStatus }>(
      `SELECT page_number AS pageNumber, status FROM extracted_page
        WHERE document_id = ? AND extractor_version = ? ORDER BY page_number`,
    )
    .all(input.documentId, input.version);
}
