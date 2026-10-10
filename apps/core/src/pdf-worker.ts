import {
  type ExtractedPage,
  PdfExtractOutputSchema,
  PdfInspectOutputSchema,
  type PdfRejection,
} from '@danesh/contracts/pdf.ts';
import type { EngineClient } from './engine-client.ts';

const TASK_TIMEOUT_MS = 60_000;
const IDLE_STOP_MS = 20_000;

export type PdfInspection =
  | { ok: true; facts: { pageCount: number; title?: string } }
  | { ok: false; reason: PdfRejection };
export type PdfPageResult = { ok: true; page: ExtractedPage } | { ok: false; reason: PdfRejection };

/**
 * All PDF work goes to the isolated `pdf` host, one task at a time: an import can run between two pages of an
 * extraction. The host stays up while work keeps coming and stops after a quiet period, so its memory is returned.
 */
export function createPdfWorker(engines: Pick<EngineClient, 'session'>) {
  let session: Awaited<ReturnType<EngineClient['session']>> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const stop = () => {
    session?.close();
    session = undefined;
  };
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const run = (input: Parameters<NonNullable<typeof session>['run']>[0]) =>
    enqueue(async () => {
      clearTimeout(idle);
      session ??= await engines.session('pdf');
      try {
        return await session.run(input, TASK_TIMEOUT_MS);
      } catch (error) {
        stop(); // a crashed or stuck host is replaced on the next task
        throw error;
      } finally {
        idle = setTimeout(stop, IDLE_STOP_MS);
        idle.unref?.();
      }
    });

  return {
    async inspect(path: string): Promise<PdfInspection> {
      return PdfInspectOutputSchema.parse(await run({ type: 'pdf-inspect', path }));
    },
    async extractPage(path: string, pageNumber: number): Promise<PdfPageResult> {
      return PdfExtractOutputSchema.parse(
        await run({ type: 'pdf-extract-page', path, pageNumber }),
      );
    },
    stop,
  };
}
export type PdfWorker = ReturnType<typeof createPdfWorker>;
