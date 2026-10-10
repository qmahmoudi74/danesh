import { type FileHandle, open } from 'node:fs/promises';
import type { ExtractedPage, PdfPageStatus, PdfRejection } from '@danesh/contracts/pdf.ts';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { layoutPage, type PositionedText } from './layout.ts';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loading: Promise<PdfJs> | undefined;

/** pdf.js runs in this process's own thread (the host is already isolated), so no extra worker is started. */
function pdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]).then(([api, worker]) => {
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return api;
  });
  return loading;
}

export class PdfRejected extends Error {
  override readonly name = 'PdfRejected';
  readonly reason: PdfRejection;
  constructor(reason: PdfRejection) {
    super(reason);
    this.reason = reason;
  }
}

function rejection(error: unknown): PdfRejected {
  const name = error instanceof Error ? error.name : '';
  if (error instanceof PdfRejected) return error;
  if (name === 'PasswordException') return new PdfRejected('encrypted');
  if (name === 'InvalidPDFException') return new PdfRejected('damaged');
  return new PdfRejected('unreadable');
}

const RANGE_CHUNK_BYTES = 64 * 1024;

/**
 * Feeds pdf.js the byte ranges it asks for. pdf.js does not treat an Electron utility process as Node, so it cannot
 * open file paths itself; reading ranges also keeps a large PDF out of memory.
 */
function fileRanges(api: PdfJs, handle: FileHandle, size: number) {
  return new (class extends api.PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number): void {
      const chunk = Buffer.alloc(end - begin);
      void handle
        .read(chunk, 0, chunk.length, begin)
        .then(({ bytesRead }) => this.onDataRange(begin, chunk.subarray(0, bytesRead)))
        .catch(() => this.abort());
    }
  })(size, new Uint8Array(0));
}

type OpenPdf = {
  path: string;
  handle: FileHandle;
  task: PDFDocumentLoadingTask;
  document: PDFDocumentProxy;
};
let current: OpenPdf | undefined;

/** Keeps one document open between page requests for the same file; opening another closes it. */
async function openPdf(path: string): Promise<OpenPdf> {
  if (current?.path === path) return current;
  await closePdf();
  const api = await pdfjs();
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const task = api.getDocument({
      range: fileRanges(api, handle, size),
      rangeChunkSize: RANGE_CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      useWasm: false,
      verbosity: api.VerbosityLevel.ERRORS,
    });
    try {
      current = { path, handle, task, document: await task.promise };
      return current;
    } catch (error) {
      await task.destroy();
      throw rejection(error);
    }
  } catch (error) {
    await handle.close();
    throw rejection(error);
  }
}

export async function closePdf(): Promise<void> {
  const open = current;
  current = undefined;
  if (!open) return;
  await open.task.destroy();
  await open.handle.close();
}

const CONTROL_CHARACTERS = /\p{Cc}/gu;
function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 300) : undefined;
}

/** Proves a PDF opens and reports its page count and title. Nothing is extracted. */
export async function inspectPdf(path: string): Promise<{ pageCount: number; title?: string }> {
  try {
    const { document } = await openPdf(path);
    const { info } = await document.getMetadata();
    const title = cleanTitle((info as { Title?: unknown } | undefined)?.Title);
    return { pageCount: document.numPages, ...(title ? { title } : {}) };
  } finally {
    await closePdf();
  }
}

const IMAGE_OPERATORS = (api: PdfJs) =>
  new Set([
    api.OPS.paintImageXObject,
    api.OPS.paintInlineImageXObject,
    api.OPS.paintImageMaskXObject,
    api.OPS.paintImageXObjectRepeat,
  ]);
/** A page with this little text and an image is treated as a scan. */
const SCAN_TEXT_LIMIT = 20;

/** Extracts one page: positioned text → lines → blocks, with a status that says what a reader can trust. */
export async function extractPage(path: string, pageNumber: number): Promise<ExtractedPage> {
  const api = await pdfjs();
  const { document } = await openPdf(path);
  if (pageNumber > document.numPages) throw new PdfRejected('unreadable');
  const page = await document.getPage(pageNumber);
  try {
    const [x0, y0, x1, y1] = page.view as [number, number, number, number];
    const size = { width: x1 - x0, height: y1 - y0 };
    const content = await page.getTextContent({ disableNormalization: true });
    const items: PositionedText[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [a, b, c, d, e, f] = item.transform as number[];
      items.push({
        str: item.str,
        dir: item.dir,
        x: e! - x0,
        y: f! - y0,
        width: item.width,
        size: Math.hypot(c!, d!),
        fontName: item.fontName,
        rotated: Math.abs(b!) > 0.01 || Math.abs(c!) > 0.01 || a! < 0,
      });
    }
    const layout = layoutPage(items, size);
    let status: PdfPageStatus = layout.flags.some((flag) => flag !== 'rotated-text-skipped')
      ? 'needs-review'
      : 'text';
    if (layout.charCount < SCAN_TEXT_LIMIT) {
      const operators = await page.getOperatorList();
      const images = IMAGE_OPERATORS(api);
      const hasImage = operators.fnArray.some((operator) => images.has(operator));
      if (hasImage) status = 'needs-ocr';
      else if (layout.charCount === 0) status = 'empty';
    }
    return {
      pageNumber,
      width: size.width,
      height: size.height,
      status,
      flags: layout.flags,
      blocks: layout.blocks.map(
        ({ ordinal, kind, rawText, normalizedText, direction, box, lines, flags }) => ({
          ordinal,
          kind,
          rawText,
          normalizedText,
          direction,
          box,
          lines: lines.map(({ text, direction: lineDirection, box: lineBox }) => ({
            text,
            direction: lineDirection,
            box: lineBox,
          })),
          flags,
        }),
      ),
    };
  } catch (error) {
    throw rejection(error);
  } finally {
    page.cleanup();
  }
}
