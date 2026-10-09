import { useEffect, useRef, useState } from 'react';
import { Button, DisclosureGroup, Heading, Link } from 'react-aria-components';
import { SmokeReportSchema, type SmokeReport } from '@danesh/contracts/smoke-report.ts';
import { rpcMethods, eventPayloads } from '@danesh/contracts/rpc.ts';
import { ChooseExportOutputSchema } from '@danesh/contracts/shell.ts';
import { AppShell } from '../components/Layout.tsx';
import { Banner } from '../components/Status.tsx';
import { CheckRow, type Row } from '../components/CheckRow.tsx';
import { Icon } from '../components/Icons.tsx';
import { exportFailure, summary, unreachable } from '../lib/copy.ts';

export function SystemCheck() {
  const [report, setReport] = useState<SmokeReport>();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const runId = useRef<string | undefined>(undefined);
  const runButton = useRef<HTMLButtonElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const restoreRun = useRef(false);
  const restoreExport = useRef(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const exporting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const progress = window.danesh.on('systemCheck.progress', (input) => {
      const event = eventPayloads['systemCheck.progress']!.safeParse(input);
      if (!event.success) return;
      const value = event.data as { runId: string; checkId: string; status: Row['status'] };
      if (value.runId !== runId.current) return;
      setRows((previous) => previous.some((row) => row.checkId === value.checkId) ? previous.map((row) => row.checkId === value.checkId ? { ...row, status: value.status } : row) : [...previous, { checkId: value.checkId, status: value.status }]);
    });
    const finished = window.danesh.on('systemCheck.finished', (input) => {
      const event = eventPayloads['systemCheck.finished']!.safeParse(input);
      if (!event.success) return;
      const value = event.data as { runId: string };
      if (value.runId !== runId.current) return;
      void window.danesh.call('systemCheck.get', value).then((output) => {
        if (!mounted.current || value.runId !== runId.current) return;
        const result = SmokeReportSchema.parse(output);
        setReport(result); setRows(result.checks.map((check) => ({ checkId: check.checkId, status: check.status, result: check })));
        setMessage(summary(result.checks.filter((check) => check.status !== 'pass').length));
        restoreRun.current = true; busy.current = false; setRunning(false);
      }).catch(() => { if (mounted.current) { setError(true); busy.current = false; setRunning(false); } });
    });
    return () => { mounted.current = false; progress(); finished(); };
  }, []);
  useEffect(() => { if (!running && restoreRun.current) { restoreRun.current = false; runButton.current?.focus(); } }, [running]);
  useEffect(() => { if (!saving && restoreExport.current) { restoreExport.current = false; exportButton.current?.focus(); } }, [saving]);
  useEffect(() => {
    setSlow(false);
    if (!running) return;
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [running]);
  const run = async () => {
    if (busy.current || exporting.current) return;
    busy.current = true; runId.current = undefined;
    setRunning(true); setError(false); setReport(undefined); setRows([]); setMessage('در حال بررسی…');
    try {
      const result = rpcMethods['systemCheck.run']!.output.parse(await window.danesh.call('systemCheck.run', {})) as { runId: string; checkIds?: string[] };
      if (!mounted.current) return;
      runId.current = result.runId;
      setRows((result.checkIds ?? []).map((checkId) => ({ checkId, status: 'pending' })));
    } catch { if (mounted.current) { setError(true); setMessage(''); busy.current = false; setRunning(false); } }
  };
  const exportReport = async () => {
    if (!report || !runId.current || exporting.current || busy.current) return;
    exporting.current = true; setSaving(true);
    try {
      const { token } = ChooseExportOutputSchema.parse(await window.danesh.call('shell.chooseExportPath', {}));
      if (token) {
        const result = rpcMethods['systemCheck.export']!.output.parse(await window.danesh.call('systemCheck.export', { runId: runId.current, token })) as { ok: boolean };
        if (mounted.current) setMessage(result.ok ? 'گزارش ذخیره شد.' : exportFailure);
      }
    } catch { if (mounted.current) setMessage(exportFailure); }
    finally { exporting.current = false; if (mounted.current) { restoreExport.current = true; setSaving(false); } }
  };
  const failures = report?.checks.filter((check) => check.status !== 'pass').length ?? 0;
  return <AppShell>
    <Link className="link" onPress={() => { location.hash = '/'; }}><Icon name="arrow-back" />بازگشت</Link>
    <Heading level={1} tabIndex={-1} className="heading">بررسی سامانه</Heading>
    <p>این بررسی نشان می‌دهد بخش‌های اصلی برنامه روی همین رایانه درست کار می‌کنند. همهٔ بررسی‌ها محلی است و چیزی به اینترنت فرستاده نمی‌شود.</p>
    <div className="actions"><Button ref={runButton} className="button primary" isPending={running} isDisabled={saving} onPress={() => { void run(); }}>{running ? 'در حال بررسی…' : runId.current ? 'اجرای دوباره' : 'اجرای بررسی'}</Button><Button ref={exportButton} className="button" isDisabled={!report || running} isPending={saving} onPress={() => { void exportReport(); }}>{saving ? 'در حال ذخیره…' : 'ذخیرهٔ گزارش'}</Button></div>
    <div className="action-help caption"><p>گزارش با قالب JSON ذخیره می‌شود و شامل مسیر پوشه‌های برنامه روی این رایانه است. جایی ارسال نمی‌شود.</p>{!report && <p>پس از اجرای بررسی فعال می‌شود.</p>}</div>
    {error && <Banner variant="error" body={unreachable} alert actions={<Button className="button" onPress={() => { void run(); }}>تلاش دوبارهٔ بررسی</Button>} />}
    <div className="summary" role="status" aria-live="polite" aria-atomic="true">{message && <Banner variant={running ? 'info' : message === exportFailure || failures ? 'error' : 'success'} running={running} title={message} body={running && slow ? 'اولین اجرا ممکن است کمی طول بکشد.' : undefined} />}</div>
    {rows.length ? <DisclosureGroup className="check-list" allowsMultipleExpanded>{rows.map((row) => <CheckRow key={row.checkId} row={row} />)}</DisclosureGroup> : !running && !error ? <section className="empty"><Heading level={2} className="heading">هنوز بررسی انجام نشده</Heading><p>برای دیدن وضعیت بخش‌های اصلی برنامه، بررسی را اجرا کنید.</p></section> : null}
  </AppShell>;
}
