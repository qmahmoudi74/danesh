import { type AppStatus, AppStatusSchema, SystemInfoSchema } from '@danesh/contracts/rpc.ts';
import { shellEventPayloads } from '@danesh/contracts/shell.ts';
import { useEffect, useState } from 'react';
import { Button, Disclosure, DisclosurePanel, Heading, Link } from 'react-aria-components';
import { Icon } from '../components/Icons.tsx';
import { AppShell, Ltr, TechnicalDetail } from '../components/Layout.tsx';
import { Banner, NoticeBanner } from '../components/Status.tsx';
import { newerDatabaseBody, readOnlyDatabaseBody } from '../lib/copy.ts';
import { carryToLibrary, chooseAndImportPdf, type Notice } from '../lib/documents.tsx';
import { useSampleJob } from '../lib/sample-job.ts';

type CoreState = 'starting' | 'ready' | 'unreachable';

const coreUnreachable = {
  title: 'بخش اصلی برنامه اجرا نشد',
  body: 'برنامه را ببندید و دوباره باز کنید. اگر مشکل ادامه داشت، جزئیات فنی را برای گزارش مشکل نگه دارید.',
};

/** Paths, versions and ids appear only here, never in the primary message. */
function TechnicalDisclosure({ values }: { values: Record<string, string | number> }) {
  return (
    <Disclosure>
      <Button slot="trigger" className="button details-trigger">
        جزئیات فنی
        <Icon name="chevron-down" />
      </Button>
      <DisclosurePanel>
        <TechnicalDetail name="وضعیت پایگاه داده" values={values} />
      </DisclosurePanel>
    </Disclosure>
  );
}

function techValues(details: AppStatus['details']): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    ),
  );
}

/** The one banner Home shows under the title, chosen by the library state. */
function StatusBanner({ status, slow }: { status: AppStatus | undefined; slow: boolean }) {
  if (status?.state === 'refused-newer') {
    return (
      <Banner
        variant="error"
        alert
        title="این داده‌ها با نسخهٔ جدیدتری از دانش ساخته شده‌اند"
        body={newerDatabaseBody}
        actions={<TechnicalDisclosure values={techValues(status.details)} />}
      />
    );
  }
  if (status?.state === 'read-only-recovery') {
    return (
      <Banner
        variant="warn"
        alert
        title="برنامه در حالت فقط‌خواندنی باز شد"
        body={readOnlyDatabaseBody}
        actions={<TechnicalDisclosure values={techValues(status.details)} />}
      />
    );
  }
  if (status?.state === 'failed') {
    return (
      <Banner
        variant="error"
        alert
        {...coreUnreachable}
        actions={<TechnicalDisclosure values={techValues(status.details)} />}
      />
    );
  }
  if (!status) {
    return (
      <Banner
        variant="info"
        title="در حال آماده‌سازی…"
        running
        body={slow ? 'آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.' : undefined}
      />
    );
  }
  return (
    <Banner
      variant="info"
      title="نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست"
      body={
        <>
          در این نسخه می‌توانید فایل <Ltr>PDF</Ltr> را به کتابخانه بیفزایید و صفحه‌های اصلی آن را
          ببینید. استخراج متن، خواندن فارسی و یادگیری در نسخه‌های بعدی اضافه می‌شود.
        </>
      }
    />
  );
}

export function Home() {
  const { job: sampleJob } = useSampleJob();
  const [core, setCore] = useState<CoreState>('starting');
  const [status, setStatus] = useState<AppStatus>();
  const [slow, setSlow] = useState(false);
  const [version, setVersion] = useState<string>();
  const [versionError, setVersionError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  // A successful import continues on the Library screen; a refusal is explained here.
  const importPdf = async () => {
    setImporting(true);
    setNotice(undefined);
    const result = await chooseAndImportPdf();
    setImporting(false);
    if (result.document && result.notice) {
      carryToLibrary(result.notice);
      location.hash = '/library';
    } else setNotice(result.notice);
  };

  useEffect(
    () =>
      window.danesh.on('shell.coreState', (payload) => {
        const parsed = shellEventPayloads['shell.coreState']?.safeParse(payload);
        if (parsed?.success) setCore((parsed.data as { state: CoreState }).state);
      }),
    [],
  );

  useEffect(() => {
    setSlow(false);
    if (core !== 'starting') return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [core]);

  useEffect(() => {
    if (core !== 'ready') return;
    let active = true;
    window.danesh
      .call('system.info', {})
      .then((data) => {
        if (active) setVersion(SystemInfoSchema.parse(data).appVersion);
      })
      .catch(() => {
        if (active) setVersionError(true);
      });
    window.danesh
      .call('app.status', {})
      .then((data) => {
        if (active) setStatus(AppStatusSchema.parse(data));
      })
      .catch(() => {
        if (active) setStatus({ state: 'failed', details: {} });
      });
    return () => {
      active = false;
    };
  }, [core]);

  const footer = version ? (
    <>
      نسخه <Ltr>{version}</Ltr>
    </>
  ) : versionError ? (
    'نسخه در دسترس نیست.'
  ) : (
    'در حال دریافت نسخه…'
  );

  return (
    <AppShell home footer={footer}>
      <Heading level={1} tabIndex={-1} className="display">
        دانش
      </Heading>
      {core === 'unreachable' ? (
        <Banner variant="error" alert {...coreUnreachable} />
      ) : (
        <StatusBanner status={core === 'ready' ? status : undefined} slow={slow} />
      )}
      <div className="actions">
        {status?.state === 'ready' && (
          <Button className="button primary" isPending={importing} onPress={() => void importPdf()}>
            افزودن <Ltr>PDF</Ltr>
          </Button>
        )}
        <Button
          className="button"
          onPress={() => {
            location.hash = '/system-check';
          }}
        >
          بررسی سامانه
        </Button>
      </div>
      <div aria-live="polite">
        <NoticeBanner notice={notice} />
      </div>
      {(sampleJob?.state === 'queued' || sampleJob?.state === 'running') && (
        <p className="background-activity">
          کار نمونه در حال انجام است. <Link href="#/system-check">مشاهده</Link>
        </p>
      )}
    </AppShell>
  );
}
