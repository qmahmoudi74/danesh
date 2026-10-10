import {
  DocumentSchema,
  type ImportFailure,
  type LibraryDocument,
  rpcMethods,
} from '@danesh/contracts/rpc.ts';
import { z } from '@danesh/contracts/schema.ts';
import { ChoosePdfOutputSchema } from '@danesh/contracts/shell.ts';
import type { ReactNode } from 'react';
import { Ltr } from '../components/Layout.tsx';

export type Notice = { tone: 'success' | 'info' | 'error'; message: ReactNode };

const pdf = <Ltr>PDF</Ltr>;
const failureMessages: Record<ImportFailure, ReactNode> = {
  'not-pdf': <>این فایل {pdf} نیست.</>,
  encrypted: (
    <>
      این {pdf} رمزدار است. فعلاً فقط {pdf}های بدون رمز را می‌توان افزود.
    </>
  ),
  damaged: <>این {pdf} آسیب دیده است و خوانده نشد.</>,
  'too-large': <>این {pdf} بزرگ‌تر از ۵۱۲ مگابایت است و فعلاً پذیرفته نمی‌شود.</>,
  unreadable: 'این فایل خوانده نشد. دسترسی به فایل را بررسی کنید و دوباره تلاش کنید.',
  'unknown-token': 'انتخاب فایل منقضی شد. دوباره فایل را انتخاب کنید.',
};

const ImportOutputSchema = rpcMethods['documents.import']!.output as z.ZodType<
  { ok: true; document: LibraryDocument; duplicate: boolean } | { ok: false; reason: ImportFailure }
>;

function failureNotice(error: unknown): Notice {
  const code = error instanceof Error ? error.message : '';
  return {
    tone: 'error',
    message:
      code === 'READ_ONLY'
        ? 'برنامه در حالت فقط‌خواندنی است؛ فایلی افزوده نشد.'
        : 'افزودن فایل انجام نشد. دوباره تلاش کنید.',
  };
}

/**
 * Lets the user pick a PDF in the native dialog, then asks Core to import it. The page never sees the path: Main
 * hands Core the chosen file under a single-use token. Resolves without a notice when the user cancels.
 */
export async function chooseAndImportPdf(): Promise<{
  notice?: Notice;
  document?: LibraryDocument;
}> {
  try {
    const choice = ChoosePdfOutputSchema.parse(await window.danesh.call('shell.choosePdf', {}));
    if (!choice.token) return {};
    const result = ImportOutputSchema.parse(
      await window.danesh.call('documents.import', { token: choice.token }),
    );
    if (!result.ok) return { notice: { tone: 'error', message: failureMessages[result.reason] } };
    const title = <bdi>{result.document.title}</bdi>;
    return {
      document: result.document,
      notice: result.duplicate
        ? { tone: 'info', message: <>«{title}» از قبل در کتابخانه بود؛ دوباره افزوده نشد.</> }
        : { tone: 'success', message: <>«{title}» به کتابخانه افزوده شد.</> },
    };
  } catch (error) {
    return { notice: failureNotice(error) };
  }
}

export async function loadDocuments(): Promise<LibraryDocument[]> {
  const output = z
    .object({ documents: z.array(DocumentSchema) })
    .parse(await window.danesh.call('documents.list', {}));
  return output.documents;
}

/** A notice that survives one navigation: Home imports, then shows the result on the Library screen. */
let carried: Notice | undefined;
export function carryToLibrary(notice: Notice): void {
  carried = notice;
}
export function takeCarried(): Notice | undefined {
  const value = carried;
  carried = undefined;
  return value;
}
