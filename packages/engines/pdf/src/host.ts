import { startHost } from '@danesh/engine-api/host-runtime.ts';
import { extractPage, inspectPdf, PdfRejected } from './pdf.ts';

/** Turns a refusal into a result, so its reason crosses the process boundary instead of a bare error class. */
async function settle<T>(work: () => Promise<T>) {
  try {
    return { ok: true as const, ...(await work()) };
  } catch (error) {
    if (error instanceof PdfRejected) return { ok: false as const, reason: error.reason };
    throw error;
  }
}

startHost({
  kind: 'pdf',
  entryUrl: import.meta.url,
  handlers: {
    'pdf-inspect': (input: { path: string }) =>
      settle(async () => ({ facts: await inspectPdf(input.path) })),
    'pdf-extract-page': (input: { path: string; pageNumber: number }) =>
      settle(async () => ({ page: await extractPage(input.path, input.pageNumber) })),
  },
});
