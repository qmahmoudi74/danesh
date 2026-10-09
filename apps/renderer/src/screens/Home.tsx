import { SystemInfoSchema } from '@danesh/contracts/rpc.ts';
import { shellEventPayloads } from '@danesh/contracts/shell.ts';
import { useEffect, useState } from 'react';
import { Button, Heading } from 'react-aria-components';
import { AppShell, Ltr } from '../components/Layout.tsx';
import { Banner } from '../components/Status.tsx';
export function Home() {
  const [state, setState] = useState<'starting' | 'ready' | 'unreachable'>('starting');
  const [slow, setSlow] = useState(false);
  const [version, setVersion] = useState<string>();
  const [versionError, setVersionError] = useState(false);
  useEffect(
    () =>
      window.danesh.on('shell.coreState', (payload) => {
        const parsed = shellEventPayloads['shell.coreState']!.safeParse(payload);
        if (parsed.success) setState((parsed.data as { state: typeof state }).state);
      }),
    [],
  );
  useEffect(() => {
    setSlow(false);
    if (state !== 'starting') return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (state !== 'ready') return;
    let active = true;
    void window.danesh
      .call('system.info', {})
      .then((data) => {
        if (active) setVersion(SystemInfoSchema.parse(data).appVersion);
      })
      .catch(() => {
        if (active) setVersionError(true);
      });
    return () => {
      active = false;
    };
  }, [state]);
  return (
    <AppShell
      home
      footer={
        version ? (
          <>
            نسخه <Ltr>{version}</Ltr>
          </>
        ) : versionError ? (
          'نسخه در دسترس نیست.'
        ) : (
          'در حال دریافت نسخه…'
        )
      }
    >
      <Heading level={1} tabIndex={-1} className="display">
        دانش
      </Heading>
      {state === 'starting' ? (
        <Banner
          variant="info"
          title="در حال آماده‌سازی…"
          running
          body={slow ? 'آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.' : undefined}
        />
      ) : state === 'unreachable' ? (
        <Banner
          variant="error"
          title="بخش اصلی برنامه اجرا نشد"
          body="برنامه را ببندید و دوباره باز کنید. اگر مشکل ادامه داشت، جزئیات فنی را برای گزارش مشکل نگه دارید."
          alert
        />
      ) : (
        <Banner
          variant="info"
          title="نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست"
          body={
            <>
              این نسخه فقط زیرساخت امن و پایدار برنامه را آماده می‌کند. ورود فایل <Ltr>PDF</Ltr>،
              خواندن و یادگیری در نسخه‌های بعدی اضافه می‌شود. تا آن زمان می‌توانید با «بررسی سامانه»
              وضعیت برنامه را روی این رایانه ببینید.
            </>
          }
        />
      )}
      <div>
        <Button
          className="button primary"
          onPress={() => {
            location.hash = '/system-check';
          }}
        >
          بررسی سامانه
        </Button>
      </div>
    </AppShell>
  );
}
