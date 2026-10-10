import { type FileHandle, open } from 'node:fs/promises';

export type PdfFacts = { pageCount: number; title: string | undefined };
export type PdfRejection = 'encrypted' | 'damaged' | 'unreadable';

export class PdfRejected extends Error {
  override readonly name = 'PdfRejected';
  readonly reason: PdfRejection;
  constructor(reason: PdfRejection) {
    super(reason);
    this.reason = reason;
  }
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loading: Promise<PdfJs> | undefined;

/** Loaded on the first import only, so Core starts as fast as before. */
function pdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]).then(([api, worker]) => {
    // Parse inside Core (already an isolated utility process) instead of starting another worker.
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return api;
  });
  return loading;
}

const RANGE_CHUNK_BYTES = 64 * 1024;
const CONTROL_CHARACTERS = /\p{Cc}/gu;

function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 300) : undefined;
}

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

/** Opens a PDF with pdf.js to prove it is readable and to learn its page count and title. No text is extracted. */
export async function inspectPdf(path: string): Promise<PdfFacts> {
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
      const document = await task.promise;
      const { info } = await document.getMetadata();
      return {
        pageCount: document.numPages,
        title: cleanTitle((info as { Title?: unknown } | undefined)?.Title),
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'PasswordException') throw new PdfRejected('encrypted');
      if (name === 'InvalidPDFException') throw new PdfRejected('damaged');
      throw new PdfRejected('unreadable');
    } finally {
      await task.destroy();
    }
  } finally {
    await handle.close();
  }
}
