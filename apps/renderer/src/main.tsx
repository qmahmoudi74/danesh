import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import { SmokeReportSchema, type SmokeReport } from '@danesh/contracts/smoke-report.ts';
import './style.css';
import { ChooseExportOutputSchema } from '@danesh/contracts/shell.ts';


function App() {
  const [route, setRoute] = useState(location.hash);
  const [report, setReport] = useState<SmokeReport>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const exportButton = useRef<HTMLButtonElement>(null);
  const restoreExportFocus = useRef(false);
  useEffect(() => { if (!saving && restoreExportFocus.current) { restoreExportFocus.current = false; exportButton.current?.focus(); } }, [saving]);
  const runId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const changed = () => setRoute(location.hash);
    window.addEventListener('hashchange', changed);
    const unsubscribe = window.danesh.on('systemCheck.finished', (payload) => {
      if (typeof payload !== 'object' || payload === null || !('runId' in payload) || payload.runId !== runId.current) return;
      void window.danesh.call('systemCheck.get', { runId: payload.runId }).then((data) => {
        setReport(SmokeReportSchema.parse(data)); setRunning(false);
      }).catch(() => { setError('بررسی انجام نشد. دوباره تلاش کنید.'); setRunning(false); });
    });
    return () => { window.removeEventListener('hashchange', changed); unsubscribe(); };
  }, []);
  const run = async () => {
    setRunning(true); setError('');
    try {
      const result = await window.danesh.call('systemCheck.run', {});
      if (typeof result !== 'object' || result === null || !('runId' in result) || typeof result.runId !== 'string') throw new Error('Invalid response');
      runId.current = result.runId;
    } catch { setError('بررسی انجام نشد. دوباره تلاش کنید.'); setRunning(false); }
  };
  const exportReport = async () => {
    if (!runId.current || !report || saving) return;
    setSaving(true); setError('');
    try {
      const { token } = ChooseExportOutputSchema.parse(await window.danesh.call('shell.chooseExportPath', {}));
      if (token) {
        const output = await window.danesh.call('systemCheck.export', { runId: runId.current, token });
        if (typeof output !== 'object' || !output || !('ok' in output) || output.ok !== true) throw new Error('Export failed');
        setError('گزارش ذخیره شد.');
      }
    } catch { setError('ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.'); }
    finally { restoreExportFocus.current = true; setSaving(false); }
  };
  if (route !== '#/system-check') return <main><h1>دانش</h1><aside><h2>نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست</h2><p>این نسخه فقط زیرساخت امن و پایدار برنامه را آماده می‌کند. ورود فایل PDF، خواندن و یادگیری در نسخه‌های بعدی اضافه می‌شود. تا آن زمان می‌توانید با «بررسی سامانه» وضعیت برنامه را روی این رایانه ببینید.</p></aside><button onClick={() => { location.hash = '/system-check'; }}>بررسی سامانه</button></main>;
  const names: Record<string, string> = { 'app-launch': 'اجرای برنامه', database: 'پایگاه داده' };
  return <main><h1>بررسی سامانه</h1><button disabled={running} onClick={() => { void run(); }}>اجرای بررسی</button><button ref={exportButton} disabled={!report || saving || running} onClick={() => { void exportReport(); }}>{saving ? 'در حال ذخیره…' : 'ذخیرهٔ گزارش'}</button>{!report && <p>پس از اجرای بررسی فعال می‌شود.</p>}<p role="status" aria-live="polite" aria-atomic="true">{running ? 'در حال بررسی…' : error}</p>{report?.checks.map((check) => <section key={check.checkId} data-check-id={check.checkId} data-status={check.status}><h2>{names[check.checkId] ?? check.checkId}</h2><p>{check.status === 'pass' ? 'موفق' : check.status === 'fail' ? 'ناموفق' : 'اجرا نشد'}</p><p>{check.detail}</p><details open><summary>جزئیات فنی</summary><pre dir="ltr">{JSON.stringify(check.fields, null, 2)}</pre></details></section>)}</main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
