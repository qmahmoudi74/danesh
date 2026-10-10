import type { LibraryDocument } from '@danesh/contracts/rpc.ts';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { formatNumber } from '../lib/copy.ts';
import { Banner } from './Status.tsx';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_INDEX = 2;

type Load =
  | { state: 'loading' }
  | { state: 'ready'; pdf: PDFDocumentProxy }
  | { state: 'failed'; message: string };

/** pdf.js is loaded only when a document is opened; it parses in its own Web Worker, off the UI thread. */
async function openPdf(bytes: Uint8Array): Promise<{ task: PDFDocumentLoadingTask }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // WebAssembly decoders would need a looser content security policy; pdf.js falls back to JavaScript.
  return { task: pdfjs.getDocument({ data: bytes, useWasm: false, verbosity: 0 }) };
}

/**
 * Shows the original pages of an imported PDF, one at a time, with page navigation and zoom. This is a view of
 * the original file, not the reconstructed reader: no text has been extracted.
 */
export function PdfViewer({
  document: entry,
  initialPage = 1,
}: {
  document: LibraryDocument;
  initialPage?: number;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [page, setPage] = useState(initialPage);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [rendered, setRendered] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let task: PDFDocumentLoadingTask | undefined;
    let active = true;
    setLoad({ state: 'loading' });
    window.danesh
      .call('documents.content', { documentId: entry.documentId })
      .then(async (output) => {
        const bytes = (output as { bytes?: unknown }).bytes;
        if (!(bytes instanceof Uint8Array)) throw new Error('INTERNAL');
        task = (await openPdf(bytes)).task;
        const pdf = await task.promise;
        if (active) setLoad({ state: 'ready', pdf });
      })
      .catch(() => {
        if (active)
          setLoad({ state: 'failed', message: 'این فایل باز نشد. کتابخانه را دوباره باز کنید.' });
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [entry.documentId]);

  const pageCount = load.state === 'ready' ? load.pdf.numPages : entry.pageCount;

  useEffect(() => {
    if (load.state !== 'ready' || !canvas.current || !stage.current) return;
    let renderTask: RenderTask | undefined;
    let active = true;
    setRendered(false);
    void (async () => {
      const pdfPage = await load.pdf.getPage(page);
      if (!active || !canvas.current || !stage.current) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      // Zoom 100% fits the page to the available width; the other steps scale from there.
      const fit = Math.max(0.1, (stage.current.clientWidth - 32) / natural.width);
      const viewport = pdfPage.getViewport({ scale: fit * ZOOM_STEPS[zoomIndex]! });
      const ratio = window.devicePixelRatio || 1;
      const target = canvas.current;
      target.width = Math.floor(viewport.width * ratio);
      target.height = Math.floor(viewport.height * ratio);
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = pdfPage.render({
        canvas: target,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (!active) return;
      // A zoomed page starts centred, so the start of a line stays visible in either writing direction.
      const area = stage.current;
      if (area) area.scrollLeft = (area.scrollWidth - area.clientWidth) / 2;
      setRendered(true);
    })().catch((error: unknown) => {
      if (active && (error as Error)?.name !== 'RenderingCancelledException')
        setLoad({ state: 'failed', message: 'این صفحه نمایش داده نشد.' });
    });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [load, page, zoomIndex]);

  const go = (next: number) => setPage(Math.min(pageCount, Math.max(1, next)));
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'PageDown') go(page + 1);
    else if (event.key === 'PageUp') go(page - 1);
    else if (event.key === 'Home') go(1);
    else if (event.key === 'End') go(pageCount);
    else return;
    event.preventDefault();
  };

  return (
    <section className="viewer" aria-label={`صفحه‌های اصلی ${entry.title}`}>
      {load.state === 'failed' ? (
        <Banner variant="error" alert title={load.message} />
      ) : (
        <>
          <div className="viewer-toolbar" role="toolbar" aria-label="پیمایش صفحه‌ها">
            <Button className="button" isDisabled={page <= 1} onPress={() => go(page - 1)}>
              صفحهٔ قبل
            </Button>
            <output className="label page-indicator" aria-live="polite">
              صفحهٔ {formatNumber(page)} از {formatNumber(pageCount)}
            </output>
            <Button className="button" isDisabled={page >= pageCount} onPress={() => go(page + 1)}>
              صفحهٔ بعد
            </Button>
            <span className="toolbar-gap" />
            <Button
              className="button"
              isDisabled={zoomIndex === 0}
              onPress={() => setZoomIndex(zoomIndex - 1)}
            >
              کوچک‌نمایی
            </Button>
            <output className="label zoom-level" aria-label="بزرگ‌نمایی">
              {formatNumber(Math.round(ZOOM_STEPS[zoomIndex]! * 100))}٪
            </output>
            <Button
              className="button"
              isDisabled={zoomIndex === ZOOM_STEPS.length - 1}
              onPress={() => setZoomIndex(zoomIndex + 1)}
            >
              بزرگ‌نمایی
            </Button>
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the focusable page area handles Page Up/Down, Home and End */}
          <div
            className="viewer-stage"
            ref={stage}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the page area scrolls and takes Page Up/Down, so it must be focusable
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-busy={!rendered}
          >
            {load.state === 'loading' && <p className="caption">در حال باز کردن فایل…</p>}
            <canvas
              ref={canvas}
              className="viewer-page"
              role="img"
              aria-label={`صفحهٔ ${formatNumber(page)} از ${formatNumber(pageCount)}`}
              data-page={page}
              data-rendered={rendered ? 'true' : 'false'}
              hidden={load.state !== 'ready'}
            />
          </div>
        </>
      )}
    </section>
  );
}
