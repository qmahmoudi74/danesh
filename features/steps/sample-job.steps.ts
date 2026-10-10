import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import {
  type SampleJobSnapshot,
  SampleJobSnapshotSchema,
} from '../../packages/contracts/src/jobs.ts';
import { readJobAudit } from '../../packages/storage/test/job-audit.ts';
import { Given, Then, When } from './fixtures.ts';

const number = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
const card = (page: Page) => page.locator('.sample-job');
const evidence = new WeakMap<Page, ReturnType<typeof readJobAudit>>();
const crashPids = new WeakMap<Page, { main: number; window: number; core: number }>();
async function snapshot(page: Page): Promise<SampleJobSnapshot | null> {
  return SampleJobSnapshotSchema.nullable().parse(
    await page.evaluate(() => window.danesh.call('sampleJob.get', {})),
  );
}
async function ready(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      try {
        await snapshot(page);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
}
async function completed(page: Page): Promise<void> {
  await expect.poll(async () => (await snapshot(page))?.state).toBe('completed');
}
async function start(page: Page): Promise<void> {
  await ready(page);
  await card(page).getByRole('button', { name: 'شروع کار نمونه', exact: true }).click();
}
async function details(page: Page): Promise<void> {
  const trigger = card(page).getByRole('button', { name: 'جزئیات فنی', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const region = card(page).getByRole('region', { name: 'جزئیات بخش‌های کار نمونه' });
  await expect(region).toHaveAttribute('tabindex', '0');
  expect(await region.evaluate((element) => getComputedStyle(element).maxBlockSize)).toBe('320px');
  await region.focus();
  await expect(region).toBeFocused();
}
async function verifyOutputs(root: string, audit: ReturnType<typeof readJobAudit>): Promise<void> {
  const sample = (await readFile('apps/core/assets/sample-durable-job.txt', 'utf8')).normalize(
    'NFC',
  );
  expect(audit.executions).toHaveLength(audit.snapshot.committed);
  for (const task of audit.tasks.filter((task) => task.state === 'done')) {
    expect(task.outputRef).not.toBeNull();
    const ref = task.outputRef!;
    const bytes = await readFile(join(root, 'blobs', 'sha256', ref.slice(0, 2), ref));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref);
    const text = sample.slice(
      Math.floor((task.unitOrder * sample.length) / audit.snapshot.total),
      Math.floor(((task.unitOrder + 1) * sample.length) / audit.snapshot.total),
    );
    expect(JSON.parse(bytes.toString('utf8'))).toEqual({
      index: task.unitOrder + 1,
      sha256: createHash('sha256').update(text).digest('hex'),
      length: text.length,
    });
    expect(audit.executions.filter((entry) => entry.taskId === task.taskId)).toEqual([
      { taskId: task.taskId, attempt: task.attempt, outputRef: task.outputRef },
    ]);
  }
}

When('I press «شروع کار نمونه»', async ({ harness }) => {
  await harness.page!.evaluate(() => {
    const notices: string[] = [];
    Object.assign(window, { __sampleNotices: notices });
    const status = document.querySelector('[role="status"]')!;
    new MutationObserver(() => notices.push(status.textContent ?? '')).observe(status, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await start(harness.page!);
});
Then(/^progress shows .* using Persian digits$/, async ({ harness }) => {
  await expect(card(harness.page!).getByText(/^در حال انجام: بخش [۰-۹]+ از ۱۲$/)).toBeVisible();
});
Then(/^the progress bar value text is .* for the committed count$/, async ({ harness }) => {
  // Freeze neither the runner nor the DOM: compare both values from the same rendered snapshot.
  await expect
    .poll(async () => {
      return card(harness.page!).evaluate((section) => {
        const text = [...section.querySelectorAll('p')]
          .map((p) => p.textContent)
          .find((text) => text?.startsWith('در حال انجام:'));
        const match = text?.match(/بخش ([۰-۹]+) از ([۰-۹]+)/);
        return (
          !!match &&
          section.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext') ===
            `${match[1]} از ${match[2]} بخش انجام شد`
        );
      });
    })
    .toBe(true);
});
When('all chunks commit', async ({ harness }) => completed(harness.page!));
Given(
  'the sample job has committed chunks and one running chunk',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await ready(page);
    await page.evaluate(() => window.danesh.call('test.sampleDelay', { ms: 1500 }));
    await start(page);
    await expect
      .poll(async () => {
        const job = await snapshot(page);
        return !!job && job.committed >= 3 && job.chunks.some((chunk) => chunk.state === 'running');
      })
      .toBe(true);
    const pids = await harness.app!.evaluate(({ BrowserWindow }) => ({
      main: process.pid,
      window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
    }));
    const ping = (await page.evaluate(() => window.danesh.call('system.ping', { n: 1 }))) as {
      corePid: number;
    };
    crashPids.set(page, { ...pids, core: ping.corePid });
    evidence.set(page, readJobAudit(libraryRoot, (await snapshot(page))!.jobId));
  },
);
When('the sample engine host is killed mid-chunk', async ({ harness, libraryRoot }) => {
  const page = harness.page!;
  const before = evidence.get(page)!;
  // Capture immediately before the real kill, so the retry assertion names the interrupted durable task.
  const audit = readJobAudit(libraryRoot, before.snapshot.jobId);
  expect(audit.tasks.filter((task) => task.state === 'running')).toHaveLength(1);
  evidence.set(page, audit);
  await page.evaluate(() =>
    window.danesh.call('test.engineFault', { kind: 'sample', mode: 'kill', when: 'now' }),
  );
});
Then('the host restarts after backoff and the job completes', async ({ harness, libraryRoot }) => {
  const page = harness.page!;
  await completed(page);
  const before = crashPids.get(page)!;
  const pids = await harness.app!.evaluate(({ BrowserWindow }) => ({
    main: process.pid,
    window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
  }));
  const ping = (await page.evaluate(() => window.danesh.call('system.ping', { n: 2 }))) as {
    corePid: number;
  };
  expect({ ...pids, core: ping.corePid }).toEqual(before);
  const logs = (await readFile(join(libraryRoot, 'logs', 'main.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(
      (line) => JSON.parse(line) as { event: string; kind?: string; attempt?: number; ts: string },
    );
  const crash = logs.find((line) => line.event === 'host.crashed' && line.kind === 'sample')!;
  const restart = logs.find((line) => line.event === 'host.restarted' && line.kind === 'sample')!;
  expect(crash).toBeDefined();
  expect(restart).toMatchObject({ attempt: 1 });
  expect(Date.parse(restart.ts) - Date.parse(crash.ts)).toBeGreaterThanOrEqual(250);
  await verifyOutputs(libraryRoot, readJobAudit(libraryRoot, evidence.get(page)!.snapshot.jobId));
});
Then('committed chunks keep attempt count 1', ({ harness, libraryRoot }) => {
  const before = evidence.get(harness.page!)!;
  const after = readJobAudit(libraryRoot, before.snapshot.jobId);
  for (const task of before.tasks.filter((task) => task.state === 'done')) {
    expect(task.attempt).toBe(1);
    expect(after.tasks.find((other) => other.taskId === task.taskId)).toEqual(task);
  }
});
Then('only the interrupted chunk acquires another attempt', ({ harness, libraryRoot }) => {
  const before = evidence.get(harness.page!)!;
  const after = readJobAudit(libraryRoot, before.snapshot.jobId);
  const interrupted = before.tasks.find((task) => task.state === 'running')!;
  for (const task of after.tasks)
    expect(task.attempt).toBe(task.taskId === interrupted.taskId ? 2 : 1);
});
Then('the card shows «کار نمونه کامل شد. هر ۱۲ بخش انجام شد.»', async ({ harness }) => {
  await expect(harness.page!.getByRole('status')).toHaveCount(1);
  await expect(card(harness.page!).locator('.banner')).toContainText(
    'کار نمونه کامل شد. هر ۱۲ بخش انجام شد.',
  );
  const notices = await harness.page!.evaluate(
    () => (window as Window & { __sampleNotices?: string[] }).__sampleNotices ?? [],
  );
  expect(notices.length).toBeGreaterThan(0);
  expect(notices.every((text) => !text.includes('در حال انجام: بخش'))).toBe(true);
});
Then(
  "twelve chunk cells are done and every chunk's attempt count in «جزئیات فنی» is 1",
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await expect(card(page).locator('[data-chunk][data-state="done"]')).toHaveCount(12);
    await details(page);
    await expect(card(page).locator('[data-task-index]')).toHaveCount(12);
    for (const row of await card(page).locator('[data-task-index]').all()) {
      await expect(row.locator('td').nth(2)).toHaveText('1');
    }
    const job = (await snapshot(page))!;
    await expect(card(page).locator('dd bdi[dir="ltr"]').first()).toHaveText(job.jobId);
    await expect(card(page).locator('dd bdi[dir="ltr"]').nth(2)).toHaveText(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    const audit = readJobAudit(libraryRoot, job.jobId);
    expect(audit.tasks.every((task) => task.state === 'done' && task.attempt === 1)).toBe(true);
    await verifyOutputs(libraryRoot, audit);
  },
);
Then('no user file has been read or processed', async ({ harness, libraryRoot }) => {
  // Every real host output must identify the exact bundled sample fragment. The start contract accepts no path.
  const job = (await snapshot(harness.page!))!;
  await verifyOutputs(libraryRoot, readJobAudit(libraryRoot, job.jobId));
  const rejection = await harness.page!.evaluate(async () => {
    try {
      await window.danesh.call('sampleJob.start', { path: 'private-user-file.txt' });
      return false;
    } catch {
      return true;
    }
  });
  expect(rejection).toBe(true);
});

Given(
  'the sample job has at least 3 committed chunks and one in-flight chunk',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await ready(page);
    await page.evaluate(() => window.danesh.call('test.sampleDelay', { ms: 1000 }));
    await start(page);
    await expect
      .poll(async () => {
        const job = await snapshot(page);
        return !!job && job.committed >= 3 && job.chunks.some((chunk) => chunk.state === 'running');
      })
      .toBe(true);
    evidence.set(page, readJobAudit(libraryRoot, (await snapshot(page))!.jobId));
  },
);
When(
  'the app process is killed and relaunched with the same library folder',
  async ({ harness }) => {
    const before = evidence.get(harness.page!)!;
    const children = await harness.app!.evaluate(({ app }) =>
      app.getAppMetrics().map((entry) => entry.pid),
    );
    const mainPid = await harness.app!.evaluate(() => process.pid);
    const child = harness.app!.process();
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    // Playwright uses a launcher wrapper on Windows; kill Electron Main, not just that wrapper.
    if (child.pid === mainPid) expect(child.kill('SIGKILL')).toBe(true);
    else process.kill(mainPid, 'SIGKILL');
    await exited;
    // Windows tears down utility/GPU children asynchronously after Main dies.
    // Relaunch only once the old processes have released the library and instance lock.
    await expect
      .poll(() =>
        children.filter((pid) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        }),
      )
      .toEqual([]);
    harness.app = undefined;
    harness.page = undefined;
    await harness.launch();
    evidence.set(harness.page!, before);
    await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  },
);
Then('the job resumes automatically', async ({ harness }) => {
  const page = harness.page!;
  await ready(page);
  const before = evidence.get(page)!;
  await expect
    .poll(async () => {
      const job = await snapshot(page);
      return (
        job?.jobId === before.snapshot.jobId &&
        job.state === 'running' &&
        job.resumedFromUnit !== null
      );
    })
    .toBe(true);
});
Then(/^its banner reads .* with the actual Persian counts$/, async ({ harness }) => {
  const job = (await snapshot(harness.page!))!;
  await expect(card(harness.page!).locator('.banner')).toContainText(
    `کار نمونه پیش از این نیمه‌کاره مانده بود و از بخش ${number(job.resumedFromUnit!)} ادامه پیدا کرد. ${number(job.notRedoneCount)} بخش انجام‌شده دوباره اجرا نشد.`,
  );
});
Then(
  'completed chunks keep attempt count 1 while the interrupted chunk shows attempt count 2',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    const before = evidence.get(page)!;
    const interrupted = before.tasks.find((task) => task.state === 'running')!;
    await expect
      .poll(async () => (await snapshot(page))?.chunks[interrupted.unitOrder]?.attempt)
      .toBe(2);
    const after = readJobAudit(libraryRoot, before.snapshot.jobId);
    for (const task of before.tasks.filter((task) => task.state === 'done')) {
      expect(after.tasks.find((other) => other.taskId === task.taskId)).toEqual(task);
    }
    await details(page);
    await expect(
      card(page)
        .locator(`[data-task-index="${interrupted.unitOrder + 1}"] td`)
        .nth(2),
    ).toHaveText('2');
  },
);
When('the resumed job completes', async ({ harness }) => completed(harness.page!));
Then(
  /^its completion notice states .* with the preserved count$/,
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    const job = (await snapshot(page))!;
    expect(job.notRedoneCount).toBe(evidence.get(page)!.snapshot.committed);
    await expect(card(page).locator('.banner')).toContainText(
      `${number(job.notRedoneCount)} بخش که پیش از وقفه کامل شده بود دوباره اجرا نشد.`,
    );
    await verifyOutputs(libraryRoot, readJobAudit(libraryRoot, job.jobId));
  },
);

Given(
  'Danesh is launched with that library folder and no sample job is running',
  async ({ harness }) => {
    await harness.launch();
    await ready(harness.page!);
    expect(await snapshot(harness.page!)).toBeNull();
  },
);
Then('Home shows no background-activity line', async ({ harness }) => {
  await expect(harness.page!.locator('.background-activity')).toHaveCount(0);
});
When('a sample job is started from System check and I return to Home', async ({ harness }) => {
  const page = harness.page!;
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.evaluate(() => window.danesh.call('test.sampleDelay', { ms: 700 }));
  await start(page);
  await page.evaluate(() => {
    location.hash = '/';
  });
});
Then('Home shows «کار نمونه در حال انجام است.» with «مشاهده»', async ({ harness }) => {
  const activity = harness.page!.locator('.background-activity');
  await expect(activity).toContainText('کار نمونه در حال انجام است.');
  await expect(activity.getByRole('link', { name: 'مشاهده' })).toHaveAttribute(
    'href',
    '#/system-check',
  );
});
When('the job completes', async ({ harness }) => completed(harness.page!));
Then('the background-activity line disappears', async ({ harness }) => {
  await expect(harness.page!.locator('.background-activity')).toHaveCount(0);
});

Given('the sample job is completed with its job id recorded', async ({ harness, libraryRoot }) => {
  await start(harness.page!);
  await completed(harness.page!);
  evidence.set(harness.page!, readJobAudit(libraryRoot, (await snapshot(harness.page!))!.jobId));
});
When('I press «شروع دوبارهٔ کار نمونه»', async ({ harness }) => {
  await card(harness.page!)
    .getByRole('button', { name: 'شروع دوبارهٔ کار نمونه', exact: true })
    .click();
});
Then('a new job record with a different id is created', async ({ harness }) => {
  const page = harness.page!;
  await expect
    .poll(async () => (await snapshot(page))?.jobId)
    .not.toBe(evidence.get(page)!.snapshot.jobId);
});
Then(
  'the previous job record and its committed outputs still exist',
  async ({ harness, libraryRoot }) => {
    const before = evidence.get(harness.page!)!;
    expect(readJobAudit(libraryRoot, before.snapshot.jobId)).toEqual(before);
    await verifyOutputs(libraryRoot, before);
  },
);

Given('one sample chunk is forced to fail on every attempt', async ({ harness }) => {
  await ready(harness.page!);
  await harness.page!.evaluate(async () => {
    await window.danesh.call('test.sampleDelay', { ms: 50 });
    await window.danesh.call('test.sampleFault', { chunkIndex: 4, mode: 'always-fail' });
  });
});
When(
  "the sample job settles after exhausting that chunk's attempt limit",
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await start(page);
    await expect.poll(async () => (await snapshot(page))?.state).toBe('completed_with_issues');
    const audit = readJobAudit(libraryRoot, (await snapshot(page))!.jobId);
    expect(audit.tasks[3]).toMatchObject({
      state: 'quarantined',
      attempt: 3,
      maxAttempts: 3,
      outputRef: null,
    });
    expect(audit.snapshot.committed).toBe(11);
    evidence.set(page, audit);
  },
);
Then(
  'the card shows «کار نمونه ناموفق بود. پیشرفت شما حفظ شده است؛ می‌توانید دوباره تلاش کنید.»',
  async ({ harness }) => {
    await expect(card(harness.page!).locator('.banner')).toContainText(
      'کار نمونه ناموفق بود. پیشرفت شما حفظ شده است؛ می‌توانید دوباره تلاش کنید.',
    );
  },
);
Then('every committed chunk stays done', async ({ harness, libraryRoot }) => {
  const before = evidence.get(harness.page!)!;
  await expect(card(harness.page!).locator('[data-chunk][data-state="done"]')).toHaveCount(11);
  await verifyOutputs(libraryRoot, before);
});
Then('the action is «تلاش دوبارهٔ کار نمونه»', async ({ harness }) => {
  await expect(
    card(harness.page!).getByRole('button', { name: 'تلاش دوبارهٔ کار نمونه', exact: true }),
  ).toBeEnabled();
});
When('the injected fault clears and I press «تلاش دوبارهٔ کار نمونه»', async ({ harness }) => {
  await harness.page!.evaluate(() =>
    window.danesh.call('test.sampleFault', { chunkIndex: 4, mode: 'none' }),
  );
  await card(harness.page!)
    .getByRole('button', { name: 'تلاش دوبارهٔ کار نمونه', exact: true })
    .click();
});
Then('only the failed chunk is re-run and the job completes', async ({ harness, libraryRoot }) => {
  await completed(harness.page!);
  const before = evidence.get(harness.page!)!;
  const after = readJobAudit(libraryRoot, before.snapshot.jobId);
  expect(after.tasks[3]).toMatchObject({ state: 'done', attempt: 4, maxAttempts: 6 });
  await verifyOutputs(libraryRoot, after);
});
Then('completed chunks keep their original attempt counts', ({ harness, libraryRoot }) => {
  const before = evidence.get(harness.page!)!;
  const after = readJobAudit(libraryRoot, before.snapshot.jobId);
  for (const task of before.tasks.filter((task) => task.state === 'done')) {
    expect(after.tasks.find((other) => other.taskId === task.taskId)).toEqual(task);
  }
});

Given(
  'Danesh is launched with that library folder on System check and no sample job exists',
  async ({ harness }) => {
    await harness.launch();
    await ready(harness.page!);
    await harness.page!.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
    expect(await snapshot(harness.page!)).toBeNull();
  },
);
Then('the card title is «کار نمونهٔ پایدار» with the tag «آزمایشی»', async ({ harness }) => {
  await expect(
    card(harness.page!).getByRole('heading', { name: 'کار نمونهٔ پایدار', exact: true }),
  ).toBeVisible();
  await expect(card(harness.page!).getByText('آزمایشی', { exact: true })).toBeVisible();
});
Then(/^its description is «(.+)»$/, async ({ harness }, description: string) => {
  await expect(card(harness.page!).getByText(description, { exact: true })).toBeVisible();
});
Then(
  '«شروع کار نمونه» is available and no chunk strip or pause or cancel control is shown',
  async ({ harness }) => {
    await expect(
      card(harness.page!).getByRole('button', { name: 'شروع کار نمونه', exact: true }),
    ).toBeEnabled();
    await expect(card(harness.page!).locator('.chunk-strip')).toHaveCount(0);
    await expect(card(harness.page!).getByRole('button', { name: /توقف|لغو/ })).toHaveCount(0);
  },
);
Given('a sample-job snapshot contains {int} chunks', async ({ harness }, count: number) => {
  const page = harness.page!;
  await ready(page);
  await page.evaluate(async (n) => {
    await window.danesh.call('test.sampleChunks', { n });
    await window.danesh.call('test.sampleDelay', { ms: 1000 });
  }, count);
  await start(page);
  await expect.poll(async () => (await snapshot(page))?.total).toBe(count);
});
When('the card renders at the minimum window width', async ({ harness }) => {
  await harness.app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setSize(720, 520),
  );
});
Then(
  'the strip contains exactly {int} cells wrapping toward inline-end without horizontal scroll',
  async ({ harness }, count: number) => {
    const strip = card(harness.page!).locator('.chunk-strip');
    await expect(strip.locator('[data-chunk]')).toHaveCount(count);
    const layout = await strip.evaluate((element) => {
      const cells = [...element.children].map((cell) => cell.getBoundingClientRect());
      return {
        width: element.clientWidth,
        scroll: element.scrollWidth,
        direction: getComputedStyle(element).direction,
        first: cells[0]!.top,
        last: cells.at(-1)!.top,
        firstRight: cells[0]!.right,
        secondRight: cells[1]?.right,
      };
    });
    expect(layout.scroll).toBeLessThanOrEqual(layout.width);
    expect(layout.direction).toBe('rtl');
    if (count > 1) expect(layout.secondRight).toBeLessThan(layout.firstRight);
    if (count === 64) expect(layout.last).toBeGreaterThan(layout.first);
  },
);
Then(
  'done, running and pending cells have different shapes and their specified Persian hidden text',
  async ({ harness }) => {
    const page = harness.page!;
    const total = (await snapshot(page))!.total;
    if (total === 1) await completed(page);
    else await expect(card(page).locator('[data-state="done"]')).not.toHaveCount(0);
    const shapes = await card(page)
      .locator('[data-chunk]')
      .evaluateAll((cells) =>
        cells.map((cell) => {
          const style = getComputedStyle(cell);
          return {
            index: Number(cell.getAttribute('data-chunk')),
            state: cell.getAttribute('data-state'),
            text: cell.textContent,
            border: style.borderTopStyle,
            width: style.borderTopWidth,
          };
        }),
      );
    const words = { done: 'انجام شد', running: 'در حال انجام', queued: 'در انتظار' };
    for (const [state, word] of Object.entries(words)) {
      const matching = shapes.filter((cell) => cell.state === state);
      if (total > 1 || state === 'done') expect(matching.length).toBeGreaterThan(0);
      for (const cell of matching) {
        expect(cell.text).toContain(`بخش ${number(cell.index)}: ${word}`);
        if (state === 'done') expect(cell.text).toContain('✓');
        if (state === 'queued') expect(cell.border).toBe('dashed');
        if (state === 'running') {
          expect(cell.border).toBe('solid');
          expect(cell.width).toBe('2px');
        }
      }
    }
  },
);
Then(
  'primary counts use Persian digits while technical attempt counts use ASCII digits',
  async ({ harness }) => {
    const page = harness.page!;
    const job = (await snapshot(page))!;
    if (job.state === 'completed')
      await expect(card(page).locator('.banner')).toContainText(`هر ${number(job.total)} بخش`);
    else
      await expect(
        card(page).getByText(new RegExp(`در حال انجام: بخش [۰-۹]+ از ${number(job.total)}`)),
      ).toBeVisible();
    await details(page);
    for (const row of await card(page).locator('[data-task-index]').all()) {
      await expect(row.locator('td').nth(2)).toHaveText(/^[0-9]+$/);
      await expect(row.locator('td').nth(0)).toHaveText(/^[0-9]+$/);
    }
  },
);
