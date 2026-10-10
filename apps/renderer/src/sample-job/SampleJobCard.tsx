import { useEffect, useRef, useState } from 'react';
import { Button, Disclosure, DisclosurePanel, Heading, ProgressBar } from 'react-aria-components';
import { ChunkStrip, chunkStateText } from '../components/ChunkStrip.tsx';
import { Ltr } from '../components/Layout.tsx';
import { Banner } from '../components/Status.tsx';
import { formatNumber } from '../lib/copy.ts';
import { useSampleJob } from '../lib/sample-job.ts';

const DESCRIPTION =
  'این یک کار آزمایشی است و به فایل‌های شما ربطی ندارد. فقط نشان می‌دهد که کارها بعد از بسته شدن یا خرابی برنامه از همان‌جا ادامه پیدا می‌کنند.';
const FAILED = 'کار نمونه ناموفق بود. پیشرفت شما حفظ شده است؛ می‌توانید دوباره تلاش کنید.';
export function SampleJobCard({ announce }: { announce: (message: string) => void }) {
  const { job, error, refresh } = useSampleJob();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(false);
  const lastNotice = useRef('');
  const running = job?.state === 'running' || job?.state === 'queued';
  const failed = job?.state === 'failed' || job?.state === 'completed_with_issues';
  const resumed = job?.resumedFromUnit
    ? `کار نمونه پیش از این نیمه‌کاره مانده بود و از بخش ${formatNumber(job.resumedFromUnit)} ادامه پیدا کرد. ${formatNumber(job.notRedoneCount)} بخش انجام‌شده دوباره اجرا نشد.`
    : '';
  const completed = job ? `کار نمونه کامل شد. هر ${formatNumber(job.total)} بخش انجام شد.` : '';
  const preserved = job?.resumedFromUnit
    ? `${formatNumber(job.notRedoneCount)} بخش که پیش از وقفه کامل شده بود دوباره اجرا نشد.`
    : '';
  useEffect(() => {
    if (!job) return;
    const key = `${job.jobId}:${job.state}:${job.resumedFromUnit ?? ''}`;
    if (lastNotice.current === key) return;
    lastNotice.current = key;
    if (job.state === 'running') announce(resumed || 'کار نمونه شروع شد.');
    else if (job.state === 'completed') announce(`${completed} ${preserved}`.trim());
    else if (job.state === 'failed' || job.state === 'completed_with_issues') announce(FAILED);
  }, [job, resumed, completed, preserved, announce]);
  async function act(): Promise<void> {
    setPending(true);
    setActionError(false);
    try {
      await window.danesh.call(
        failed ? 'sampleJob.retry' : 'sampleJob.start',
        failed && job ? { jobId: job.jobId } : {},
      );
      await refresh();
    } catch {
      setActionError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="sample-job" aria-labelledby="sample-job-title">
      <div className="sample-job-heading">
        <Heading id="sample-job-title" level={2} className="heading">
          کار نمونهٔ پایدار
        </Heading>
        <span className="sample-tag">آزمایشی</span>
      </div>
      <p>{DESCRIPTION}</p>
      {(error || actionError) && (
        <Banner variant="error" alert body="کار نمونه اجرا نشد. دوباره تلاش کنید." />
      )}
      {job && (
        <>
          {running && resumed && <Banner variant="info" body={resumed} />}
          {job.state === 'completed' && (
            <Banner variant="success" body={`${completed} ${preserved}`.trim()} />
          )}
          {failed && <Banner variant="error" body={FAILED} />}
          {running && (
            <>
              <p>
                در حال انجام: بخش {formatNumber(job.committed)} از {formatNumber(job.total)}
              </p>
              <ProgressBar
                className="sample-progress"
                aria-label="پیشرفت کار نمونه"
                value={job.committed}
                maxValue={job.total}
                valueLabel={`${formatNumber(job.committed)} از ${formatNumber(job.total)} بخش انجام شد`}
              >
                {({ percentage }) => (
                  <div className="sample-progress-fill" style={{ inlineSize: `${percentage}%` }} />
                )}
              </ProgressBar>
            </>
          )}
          <ChunkStrip chunks={job.chunks} />
          <Disclosure className="sample-details">
            <Button slot="trigger" className="button details-trigger">
              جزئیات فنی
            </Button>
            <DisclosurePanel>
              <section
                className="sample-detail-scroll"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the capped technical region (UI-SPEC).
                tabIndex={0}
                aria-label="جزئیات بخش‌های کار نمونه"
              >
                <dl>
                  <dt>شناسهٔ کار</dt>
                  <dd>
                    <Ltr>{job.jobId}</Ltr>
                  </dd>
                  <dt>وضعیت</dt>
                  <dd>
                    <Ltr>{job.state}</Ltr>
                  </dd>
                  <dt>زمان ایجاد</dt>
                  <dd>
                    <Ltr>{new Date(job.createdAt).toISOString()}</Ltr>
                  </dd>
                  {job.finishedAt && (
                    <>
                      <dt>زمان پایان</dt>
                      <dd>
                        <Ltr>{new Date(job.finishedAt).toISOString()}</Ltr>
                      </dd>
                    </>
                  )}
                </dl>
                <table>
                  <thead>
                    <tr>
                      <th>بخش</th>
                      <th>وضعیت</th>
                      <th>تعداد تلاش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.chunks.map((chunk) => (
                      <tr key={chunk.index} data-task-index={chunk.index}>
                        <td>
                          <Ltr>{String(chunk.index)}</Ltr>
                        </td>
                        <td>{chunkStateText[chunk.state]}</td>
                        <td>
                          <Ltr>{String(chunk.attempt)}</Ltr>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </DisclosurePanel>
          </Disclosure>
        </>
      )}
      {!running && (
        <Button
          className={`button ${job ? '' : 'primary'}`}
          isDisabled={pending || job === undefined}
          isPending={pending}
          onPress={() => void act()}
        >
          {failed ? 'تلاش دوبارهٔ کار نمونه' : job ? 'شروع دوبارهٔ کار نمونه' : 'شروع کار نمونه'}
        </Button>
      )}
    </section>
  );
}
