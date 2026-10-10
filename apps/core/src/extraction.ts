import { EXTRACTOR_VERSION } from '@danesh/contracts/pdf.ts';
import type { ExtractionStatus } from '@danesh/contracts/rpc.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import type { Cas } from '@danesh/storage/cas.ts';
import type { Db } from '@danesh/storage/db.ts';
import { getDocument } from '@danesh/storage/documents.ts';
import {
  beginExtraction,
  finishExtraction,
  getExtraction,
  readPageStatuses,
  storeExtractedPage,
} from '@danesh/storage/extraction.ts';
import type { PdfWorker } from './pdf-worker.ts';

/** Test builds only: stop storing after this page, as if Danesh were closed mid-extraction. */
function testStopAfterPage(): number | undefined {
  if (!__TEST_HOOKS__) return undefined;
  const value = Number(process.env.DANESH_TEST_EXTRACTION_STOP_AFTER_PAGE ?? '');
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Extracts a document's text page by page in the isolated PDF host and stores each page as it finishes, so
 * progress is visible and an interrupted run continues after its last stored page. The stored original is
 * re-hashed first; a file that changed on disk is never read.
 */
export function createExtractor({
  cas,
  pdf,
  logger,
}: {
  cas: Pick<Cas, 'verify' | 'pathFor'>;
  pdf: Pick<PdfWorker, 'extractPage'>;
  logger: Pick<JsonlLogger, 'log'>;
}) {
  const active = new Set<string>();

  async function run(db: Db, documentId: string): Promise<void> {
    const document = getDocument(db, documentId);
    if (!document) return;
    const ids = { documentId, version: EXTRACTOR_VERSION };
    const progress = beginExtraction(db, { ...ids, pageCount: document.pageCount });
    if (progress.state === 'completed') return;
    try {
      await cas.verify(document.blobSha256);
    } catch {
      finishExtraction(db, { ...ids, errorClass: 'IntegrityFailed' });
      return;
    }
    const path = cas.pathFor(document.blobSha256);
    const stopAfter = testStopAfterPage();
    for (let pageNumber = progress.pagesDone + 1; pageNumber <= document.pageCount; pageNumber++) {
      const result = await pdf.extractPage(path, pageNumber);
      if (!result.ok) {
        finishExtraction(db, { ...ids, errorClass: result.reason });
        return;
      }
      storeExtractedPage(db, { ...ids, blobSha256: document.blobSha256, page: result.page });
      if (stopAfter === pageNumber) await new Promise(() => undefined);
    }
    finishExtraction(db, ids);
  }

  return {
    /** Starts (or continues) an extraction in the background; a second call for the same document is ignored. */
    start(db: Db, documentId: string): void {
      if (active.has(documentId)) return;
      active.add(documentId);
      void run(db, documentId)
        .catch((error: unknown) => {
          const errorClass = error instanceof Error ? error.name.slice(0, 64) : 'Error';
          finishExtraction(db, { documentId, version: EXTRACTOR_VERSION, errorClass });
          logger.log('extraction.failed', { errorClass }, 'error');
        })
        .finally(() => active.delete(documentId));
    },
    /** A run that is recorded as running but has no live worker was cut short (Danesh closed or crashed). */
    status(db: Db, documentId: string): ExtractionStatus {
      const row = getExtraction(db, documentId, EXTRACTOR_VERSION);
      if (!row) return { state: 'none', pagesDone: 0, pageCount: 0, needsOcr: [], needsReview: [] };
      const pages = readPageStatuses(db, { documentId, version: EXTRACTOR_VERSION });
      const state = row.state === 'running' && !active.has(documentId) ? 'interrupted' : row.state;
      return {
        state,
        pagesDone: row.pagesDone,
        pageCount: row.pageCount,
        ...(row.errorClass ? { errorClass: row.errorClass } : {}),
        needsOcr: pages
          .filter((page) => page.status === 'needs-ocr')
          .map((page) => page.pageNumber),
        needsReview: pages
          .filter((page) => page.status === 'needs-review')
          .map((page) => page.pageNumber),
      };
    },
  };
}
