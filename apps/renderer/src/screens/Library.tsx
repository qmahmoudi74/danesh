import type { LibraryDocument } from '@danesh/contracts/rpc.ts';
import { useCallback, useEffect, useState } from 'react';
import { Button, Heading } from 'react-aria-components';
import { AppShell, Ltr } from '../components/Layout.tsx';
import { PdfViewer } from '../components/PdfViewer.tsx';
import { Banner, NoticeBanner } from '../components/Status.tsx';
import { formatNumber } from '../lib/copy.ts';
import { chooseAndImportPdf, loadDocuments, type Notice, takeCarried } from '../lib/documents.tsx';

const dateFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1
    ? `${formatNumber(Math.round(megabytes * 10) / 10)} مگابایت`
    : `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

function DocumentRow({ entry, onOpen }: { entry: LibraryDocument; onOpen: () => void }) {
  return (
    <li className="document-row">
      <div className="document-text">
        <Heading level={2} className="label document-title">
          <bdi>{entry.title}</bdi>
        </Heading>
        <p className="caption">
          {formatNumber(entry.pageCount)} صفحه · {formatSize(entry.byteSize)} ·{' '}
          {dateFormat.format(entry.importedAt)}
        </p>
        <p className="caption document-file">
          <bdi>{entry.fileName}</bdi>
        </p>
      </div>
      <Button className="button" onPress={onOpen} aria-label={`باز کردن ${entry.title}`}>
        باز کردن
      </Button>
    </li>
  );
}

export function Library() {
  const [carried] = useState(takeCarried);
  const [documents, setDocuments] = useState<LibraryDocument[]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>(carried);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setDocuments(await loadDocuments());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importPdf = async () => {
    setBusy(true);
    setNotice(undefined);
    const result = await chooseAndImportPdf();
    setBusy(false);
    setNotice(result.notice);
    if (result.document) await refresh();
  };

  const open = documents?.find((entry) => entry.documentId === openId);
  if (open) {
    return (
      <AppShell wide>
        <Heading level={1} tabIndex={-1} className="heading">
          <bdi>{open.title}</bdi>
        </Heading>
        <PdfViewer document={open} onClose={() => setOpenId(undefined)} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Heading level={1} tabIndex={-1} className="heading">
        کتابخانه
      </Heading>
      <div className="actions">
        <Button className="button primary" isPending={busy} onPress={() => void importPdf()}>
          افزودن <Ltr>PDF</Ltr>
        </Button>
      </div>
      <div aria-live="polite">
        <NoticeBanner notice={notice} />
      </div>
      {loadFailed ? (
        <Banner variant="error" alert title="فهرست کتابخانه خوانده نشد." />
      ) : !documents ? (
        <p className="caption">در حال خواندن کتابخانه…</p>
      ) : documents.length === 0 ? (
        <div className="empty">
          <p>هنوز فایلی در کتابخانه نیست.</p>
          <p className="caption">
            با «افزودن <Ltr>PDF</Ltr>» یک فایل را انتخاب کنید. فایل اصلی در پوشهٔ دانش نگه داشته
            می‌شود و بدون اینترنت در دسترس است.
          </p>
        </div>
      ) : (
        <ul className="document-list" aria-label="فایل‌های کتابخانه">
          {documents.map((entry) => (
            <DocumentRow
              key={entry.documentId}
              entry={entry}
              onOpen={() => setOpenId(entry.documentId)}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}
