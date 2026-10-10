import {
  type ExtractionStatus,
  ExtractionStatusSchema,
  rpcMethods,
  TEXT_PAGES_PER_CALL,
  type TextPage,
} from '@danesh/contracts/rpc.ts';
import type { z } from '@danesh/contracts/schema.ts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Button, Label, ProgressBar } from 'react-aria-components';
import { formatNumber } from '../lib/copy.ts';
import { Ltr } from './Layout.tsx';
import { Banner } from './Status.tsx';

const POLL_MS = 400;
const TextOutputSchema = rpcMethods['documents.text']!.output as z.ZodType<{ pages: TextPage[] }>;

const failureMessages: Record<string, string> = {
  IntegrityFailed:
    'فایل ذخیره‌شده تغییر کرده و بررسی درستی آن ناموفق بود؛ برای محافظت از درستی متن، چیزی استخراج نشد.',
  encrypted: 'این فایل رمزدار است و متن آن استخراج نشد.',
  damaged: 'بخشی از این فایل آسیب دیده است و استخراج متن متوقف شد.',
};
const genericFailure = 'استخراج متن انجام نشد. دوباره تلاش کنید.';

const ocr = <Ltr>OCR</Ltr>;
const pageStatusLabels: Partial<Record<TextPage['status'], ReactNode>> = {
  'needs-ocr': <>نیازمند {ocr}: این صفحه تصویر است و متنی در آن پیدا نشد.</>,
  'needs-review': 'نیازمند بازبینی: ترتیب یا نویسه‌های این صفحه قطعی نیست.',
  empty: 'این صفحه متنی ندارد.',
};
const blockFlagNotes: Record<string, string> = {
  'unmapped-glyphs': 'برخی نویسه‌های این بخش در فایل نشانی یونیکد نداشتند و ممکن است نادرست باشند.',
};
const pageFlagNotes: Record<string, string> = {
  'multi-column-suspected':
    'این صفحه ممکن است چندستونی باشد؛ ترتیب خواندن ستون‌ها بازسازی نشده است.',
  'rotated-text-skipped': 'متن چرخیدهٔ این صفحه کنار گذاشته شد.',
};

const pageList = (pages: number[]) => pages.map((page) => formatNumber(page)).join('، ');
const textDirection = (direction: string) =>
  direction === 'ltr' ? 'ltr' : direction === 'rtl' ? 'rtl' : 'auto';

async function loadAllPages(documentId: string, pageCount: number): Promise<TextPage[]> {
  const pages: TextPage[] = [];
  for (let fromPage = 1; fromPage <= pageCount; fromPage += TEXT_PAGES_PER_CALL) {
    const toPage = Math.min(pageCount, fromPage + TEXT_PAGES_PER_CALL - 1);
    const output = TextOutputSchema.parse(
      await window.danesh.call('documents.text', { documentId, fromPage, toPage }),
    );
    pages.push(...output.pages);
  }
  return pages;
}

function PageText({
  page,
  onShowOriginal,
}: {
  page: TextPage;
  onShowOriginal: (page: number) => void;
}) {
  const label = `صفحهٔ ${formatNumber(page.pageNumber)}`;
  const statusLabel = pageStatusLabels[page.status];
  return (
    <section className="reader-page" aria-label={label} data-page={page.pageNumber}>
      <div className="reader-page-head">
        <span className="label">{label}</span>
        <Button className="link" onPress={() => onShowOriginal(page.pageNumber)}>
          دیدن این صفحه در نسخهٔ اصلی
        </Button>
      </div>
      {statusLabel && <p className={`caption page-status ${page.status}`}>{statusLabel}</p>}
      {page.flags.map((flag) =>
        pageFlagNotes[flag] ? (
          <p key={flag} className="caption page-status needs-review">
            {pageFlagNotes[flag]}
          </p>
        ) : null,
      )}
      {page.blocks.map((block) => {
        const props = {
          dir: textDirection(block.direction),
          'data-block-id': block.blockId,
          'data-page': block.pageNumber,
        } as const;
        const notes = block.flags.flatMap((flag) =>
          blockFlagNotes[flag] ? [blockFlagNotes[flag]] : [],
        );
        return (
          <div key={block.blockId} className="reader-block">
            {block.kind === 'heading' ? (
              <h2 className="reader-heading" {...props}>
                {block.normalizedText}
              </h2>
            ) : (
              <p className="reader-paragraph" {...props}>
                {block.normalizedText}
              </p>
            )}
            {notes.map((note) => (
              <p key={note} className="caption page-status needs-review">
                {note}
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/**
 * The extracted-text mode of a document: starts or continues extraction, shows page progress, then the stored
 * text as selectable Persian-first blocks with page provenance and the pages that need OCR or review.
 */
export function TextReader({
  documentId,
  onShowOriginal,
}: {
  documentId: string;
  onShowOriginal: (page: number) => void;
}) {
  const [status, setStatus] = useState<ExtractionStatus>();
  const [pages, setPages] = useState<TextPage[]>();
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = ExtractionStatusSchema.parse(
        await window.danesh.call('documents.extraction', { documentId }),
      );
      setStatus(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== 'running') return;
    const timer = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(timer);
  }, [status, refresh]);
  useEffect(() => {
    if (status?.state !== 'completed') return;
    let active = true;
    loadAllPages(documentId, status.pageCount)
      .then((loaded) => {
        if (active) setPages(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [documentId, status?.state, status?.pageCount]);

  const start = async () => {
    try {
      setStatus(
        ExtractionStatusSchema.parse(await window.danesh.call('documents.extract', { documentId })),
      );
    } catch {
      setFailed(true);
    }
  };

  if (failed) return <Banner variant="error" alert title="وضعیت استخراج متن خوانده نشد." />;
  if (!status) return <p className="caption">در حال خواندن وضعیت…</p>;

  if (status.state === 'none')
    return (
      <div className="empty">
        <p>متن این فایل هنوز استخراج نشده است.</p>
        <p className="caption">
          دانش متن صفحه‌ها را در یک فرایند جداگانه از فایل <Ltr>PDF</Ltr> بیرون می‌کشد، ترتیب خواندن
          را بازسازی می‌کند و نتیجه را برای خواندن بدون اینترنت نگه می‌دارد. صفحه‌های تصویری به {ocr}
          نیاز دارند که هنوز در دسترس نیست.
        </p>
        <div>
          <Button className="button primary" onPress={() => void start()}>
            استخراج متن
          </Button>
        </div>
      </div>
    );

  if (status.state === 'running')
    return (
      <ProgressBar
        className="extraction-progress"
        value={status.pagesDone}
        maxValue={status.pageCount}
        valueLabel={`صفحهٔ ${formatNumber(status.pagesDone)} از ${formatNumber(status.pageCount)}`}
      >
        {({ percentage, valueText }) => (
          <>
            <Label className="label">در حال استخراج متن…</Label>
            <span className="caption">{valueText}</span>
            <span className="progress-track">
              <span className="progress-fill" style={{ inlineSize: `${percentage ?? 0}%` }} />
            </span>
          </>
        )}
      </ProgressBar>
    );

  if (status.state === 'interrupted' || status.state === 'failed') {
    const interrupted = status.state === 'interrupted';
    return (
      <Banner
        variant={interrupted ? 'warn' : 'error'}
        alert={!interrupted}
        title={
          interrupted
            ? `استخراج متن نیمه‌کاره ماند (${formatNumber(status.pagesDone)} از ${formatNumber(status.pageCount)} صفحه).`
            : (failureMessages[status.errorClass ?? ''] ?? genericFailure)
        }
        body={interrupted ? 'صفحه‌های ذخیره‌شده دوباره استخراج نمی‌شوند.' : undefined}
        actions={
          <div>
            <Button className="button" onPress={() => void start()}>
              {interrupted ? 'ادامهٔ استخراج' : 'تلاش دوباره'}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="reader">
      <Banner
        variant="info"
        title="متن بازسازی‌شده، بازبینی‌نشده"
        body="این متن به‌طور خودکار از فایل بیرون کشیده و ترتیب خواندن و عنوان‌های آن حدس زده شده است. برای اطمینان با نسخهٔ اصلی مقایسه کنید."
      />
      {(status.needsOcr.length > 0 || status.needsReview.length > 0) && (
        <div className="reader-attention" role="note">
          {status.needsOcr.length > 0 && (
            <p>
              صفحه‌های نیازمند {ocr}: {pageList(status.needsOcr)}
            </p>
          )}
          {status.needsReview.length > 0 && (
            <p>صفحه‌های نیازمند بازبینی: {pageList(status.needsReview)}</p>
          )}
        </div>
      )}
      {!pages ? (
        <p className="caption">در حال خواندن متن…</p>
      ) : (
        <article className="reader-text" aria-label="متن استخراج‌شده">
          {pages.map((page) => (
            <PageText key={page.pageNumber} page={page} onShowOriginal={onShowOriginal} />
          ))}
        </article>
      )}
    </div>
  );
}
