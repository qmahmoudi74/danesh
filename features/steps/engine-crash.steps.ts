import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { SampleJobSnapshotSchema } from '../../packages/contracts/src/jobs.ts';
import { readJobAudit } from '../../packages/storage/test/job-audit.ts';
import { Before, Given, Then, When } from './fixtures.ts';

type Pids = { main: number; window: number; core: number; others: number[] };
type Log = { event: string; kind?: string; exitCode?: number; attempt?: number; ts: string };
type Evidence = {
  pids?: Pids;
  oldHost?: number;
  fault?: string;
  job?: ReturnType<typeof readJobAudit>;
  logs?: Log[];
  children?: number[];
  windowToken?: string;
};
const evidence = new WeakMap<Page, Evidence>();
Before({ tags: '@fault-matrix' }, ({ harness }) => {
  Object.assign(harness.extraEnv, {
    DANESH_TEST_HOST_HEAP_MB: '64',
    DANESH_TEST_WATCHDOG_MS: '2000',
    DANESH_TEST_PROBE_DELAY_MS: '3000',
  });
});
function state(page: Page): Evidence {
  let value = evidence.get(page);
  if (!value) {
    value = {};
    evidence.set(page, value);
  }
  return value;
}
async function snapshot(page: Page) {
  return SampleJobSnapshotSchema.nullable().parse(
    await page.evaluate(() => window.danesh.call('sampleJob.get', {})),
  );
}
async function ready(page: Page) {
  await expect
    .poll(async () => {
      try {
        await page.evaluate(() => window.danesh.call('system.ping', { n: 1 }));
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);
}
async function logs(root: string, processName = 'main'): Promise<Log[]> {
  return (await readFile(join(root, 'logs', `${processName}.jsonl`), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Log);
}
async function corePid(page: Page): Promise<number> {
  const reply = (await page.evaluate(() => window.danesh.call('system.ping', { n: 1 }))) as {
    corePid: number;
  };
  return reply.corePid;
}
function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

Given(
  'a sample job has committed chunks and one in-flight chunk',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await ready(page);
    await page.evaluate(async () => {
      await window.danesh.call('test.sampleDelay', { ms: 1200 });
      await window.danesh.call('sampleJob.start', {});
    });
    await expect.poll(async () => (await snapshot(page))?.committed).toBeGreaterThanOrEqual(3);
    const job = (await snapshot(page))!;
    const processIds = await harness.app!.evaluate(({ BrowserWindow }) => ({
      main: process.pid,
      window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
    }));
    let hostPid: number | undefined;
    await expect
      .poll(async () => {
        hostPid = await harness.app!.evaluate(
          ({ app }) =>
            app
              .getAppMetrics()
              .find(
                (metric) =>
                  metric.serviceName === 'Danesh sample' || metric.name === 'Danesh sample',
              )?.pid,
        );
        return hostPid;
      })
      .toBeGreaterThan(0);
    const audit = readJobAudit(libraryRoot, job.jobId);
    expect(audit.tasks.filter((task) => task.state === 'running')).toHaveLength(1);
    state(page).job = audit;
    state(page).pids = { ...processIds, core: await corePid(page), others: [hostPid!] };
    state(page).windowToken = await page.evaluate(() => {
      const token = crypto.randomUUID();
      document.documentElement.dataset.reconnectToken = token;
      return token;
    });
    await page.evaluate(async () => {
      const states: string[] = [];
      Object.assign(window, { __coreStates: states });
      window.danesh.on('shell.coreState', (value) =>
        states.push((value as { state: string }).state),
      );
      await window.danesh.call('test.coreStall', { ms: 60000 });
      const call = window.danesh.call('system.ping', { n: 99 });
      Object.assign(window, {
        __interruptedRpc: call.then(
          () => 'unexpected-success',
          (error) => (error as Error).message,
        ),
      });
    });
  },
);
When('Core is killed unexpectedly', ({ harness }) => {
  process.kill(state(harness.page!).pids!.core, 'SIGKILL');
});
Then(
  'Main respawns Core and re-brokers the renderer and host ports',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await ready(page);
    expect(await corePid(page)).not.toBe(state(page).pids!.core);
    await expect
      .poll(
        async () =>
          (await logs(libraryRoot)).filter((line) => line.event === 'core.restarted').length,
      )
      .toBe(1);
    const records = await logs(libraryRoot);
    const crash = records.find((line) => line.event === 'core.crashed')!;
    const restart = records.find((line) => line.event === 'core.restarted')!;
    expect(Date.parse(restart.ts) - Date.parse(crash.ts)).toBeGreaterThanOrEqual(250);
    for (const pid of [state(page).pids!.core, ...state(page).pids!.others])
      await expect.poll(() => isAlive(pid)).toBe(false);
    expect(
      await page.evaluate(
        () => (window as { __interruptedRpc?: Promise<string> }).__interruptedRpc,
      ),
    ).toBe('UNAVAILABLE');
  },
);
Then('the window reconnects without reloading', async ({ harness, libraryRoot, $testInfo }) => {
  const page = harness.page!;
  expect(await page.locator('html').getAttribute('data-reconnect-token')).toBe(
    state(page).windowToken,
  );
  const current = await harness.app!.evaluate(({ BrowserWindow }) => ({
    main: process.pid,
    window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
  }));
  expect(current).toEqual({ main: state(page).pids!.main, window: state(page).pids!.window });
  const states = await page.evaluate(() => (window as { __coreStates?: string[] }).__coreStates);
  expect(states).toContain('starting');
  expect(states?.at(-1)).toBe('ready');
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ذخیرهٔ گزارش', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  for (const check of ['database', 'engine-llm', 'engine-ocr', 'engine-tts']) {
    const row = page.locator('[data-check-id="' + check + '"]');
    await row.getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
    const details = await row.locator('pre').textContent();
    await writeFile(
      $testInfo.outputPath(check + '-post-core.json'),
      JSON.stringify(
        { details, main: await logs(libraryRoot), core: await logs(libraryRoot, 'core') },
        null,
        2,
      ),
    );
    await expect(page.locator('[data-check-id="' + check + '"]')).toHaveAttribute(
      'data-status',
      'pass',
    );
  }
});
Then(
  'the job resumes without redoing any committed chunk',
  async ({ harness, libraryRoot, $testInfo }) => {
    const page = harness.page!;
    await expect.poll(async () => (await snapshot(page))?.state).toBe('completed');
    const before = state(page).job!;
    const after = readJobAudit(libraryRoot, before.snapshot.jobId);
    expect(after.executions).toHaveLength(12);
    for (const task of before.tasks.filter((task) => task.state === 'done')) {
      expect(after.tasks.find((next) => next.taskId === task.taskId)).toEqual(task);
      expect(after.executions.find((entry) => entry.taskId === task.taskId)).toEqual(
        before.executions.find((entry) => entry.taskId === task.taskId),
      );
    }
    const interrupted = before.tasks.find((task) => task.state === 'running')!;
    expect(after.tasks.find((task) => task.taskId === interrupted.taskId)).toMatchObject({
      state: 'done',
      attempt: 2,
    });
    for (const task of after.tasks.filter((task) => task.taskId !== interrupted.taskId))
      expect(task.attempt).toBe(1);
    for (const entry of after.executions) {
      const bytes = await readFile(
        join(libraryRoot, 'blobs', 'sha256', entry.outputRef.slice(0, 2), entry.outputRef),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.outputRef);
    }
    const path = $testInfo.outputPath('core-recovery-evidence.json');
    await writeFile(
      path,
      JSON.stringify(
        {
          before,
          after,
          pids: state(page).pids,
          replacementCorePid: await corePid(page),
          records: (await logs(libraryRoot)).filter((line) => line.kind === 'core'),
        },
        null,
        2,
      ),
    );
    await $testInfo.attach('core-recovery-evidence', { path, contentType: 'application/json' });
  },
);

When('a sample job runs with a healthy sample host', async ({ harness }) => {
  await ready(harness.page!);
  await harness.page!.evaluate(() => window.danesh.call('sampleJob.start', {}));
});
Then('the job completes and the window stays responsive', async ({ harness }) => {
  await expect.poll(async () => (await snapshot(harness.page!))?.state).toBe('completed');
  const card = harness.page!.locator('.sample-job');
  await card.getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
  await expect(
    card.getByRole('region', { name: 'جزئیات بخش‌های کار نمونه', exact: true }),
  ).toBeVisible();
  await ready(harness.page!);
});
Then('no engine restart is recorded or recovery notice shown', async ({ harness, libraryRoot }) => {
  expect(
    (await logs(libraryRoot)).filter((line) =>
      ['host.crashed', 'host.restarted'].includes(line.event),
    ),
  ).toEqual([]);
  await expect(harness.page!.getByText(/موتور متوقف شد/)).toHaveCount(0);
});
Given(
  "an engine probe is running with the Core and other hosts' process ids recorded",
  async ({ harness }) => {
    const page = harness.page!;
    await ready(page);
    const pids = await harness.app!.evaluate(({ BrowserWindow }) => ({
      main: process.pid,
      window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
    }));
    const others = await page.evaluate(async () => {
      const pids: number[] = [];
      for (const kind of ['llm', 'tts']) {
        const result = (await window.danesh.call('test.engineSession', {
          kind,
          action: 'open',
        })) as { hostPid: number };
        pids.push(result.hostPid);
      }
      return pids;
    });
    state(page).pids = { ...pids, others, core: await corePid(page) };
    await page.evaluate(async () => {
      const seen: string[] = [];
      Object.assign(window, { __engineRestartCopy: seen });
      new MutationObserver(() => {
        const text = document.querySelector(
          '[data-check-id="engine-ocr"] .check-result',
        )?.textContent;
        if (text?.startsWith('موتور متوقف شد')) seen.push(text);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      await window.danesh.call('test.checkRun', {
        delayMs: 0,
        checks: [
          { checkId: 'engine-ocr', status: 'pass', durationMs: 0, detail: 'fixture', fields: {} },
        ],
        live: ['engine-ocr'],
      });
    });
    await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
    await expect(page.locator('[data-check-id="engine-ocr"]')).toHaveAttribute(
      'data-status',
      'running',
    );
    await expect
      .poll(async () =>
        harness.app!.evaluate(
          ({ app }) =>
            app
              .getAppMetrics()
              .find((entry) => entry.serviceName === 'Danesh ocr' || entry.name === 'Danesh ocr')
              ?.pid,
        ),
      )
      .toBeTruthy();
    state(page).oldHost = await harness.app!.evaluate(
      ({ app }) =>
        app
          .getAppMetrics()
          .find((entry) => entry.serviceName === 'Danesh ocr' || entry.name === 'Danesh ocr')!.pid,
    );
  },
);
Given('the OOM fault host is bounded to a 64 MB V8 heap', ({ harness }) => {
  expect(harness.extraEnv.DANESH_TEST_HOST_HEAP_MB).toBe('64');
});
When('the probe host experiences fault {word}', async ({ harness }, fault: string) => {
  state(harness.page!).fault = fault;
  await harness.page!.evaluate(
    (mode) => window.danesh.call('test.engineFault', { kind: 'ocr', mode, when: 'now' }),
    fault,
  );
});
Then(
  'the window stays responsive and Core and other hosts keep their recorded ids',
  async ({ harness }) => {
    const page = harness.page!;
    const before = state(page).pids!;
    const current = await harness.app!.evaluate(({ BrowserWindow }) => ({
      main: process.pid,
      window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
    }));
    expect(current).toEqual({ main: before.main, window: before.window });
    expect(await corePid(page)).toBe(before.core);
    for (const pid of before.others) expect(isAlive(pid)).toBe(true);
    await page.getByRole('button', { name: 'اطلاعات محیط اجرا', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'جزئیات فنی اطلاعات محیط اجرا', exact: true }),
    ).toBeVisible();
  },
);
Then(/^the probe row shows «(.+)» during restart$/, async ({ harness }, copy: string) => {
  await expect
    .poll(async () =>
      harness.page!.evaluate(
        () => (window as Window & { __engineRestartCopy?: string[] }).__engineRestartCopy ?? [],
      ),
    )
    .toContain(copy);
});
Then(
  'the host restarts after backoff with a new process id',
  async ({ harness, libraryRoot, $testInfo }) => {
    const page = harness.page!;
    await expect(page.locator('[data-check-id="engine-ocr"]')).toHaveAttribute(
      'data-status',
      'pass',
    );
    const records = await logs(libraryRoot);
    const watchdog = (await logs(libraryRoot, 'core')).filter(
      (line) => line.event === 'host.watchdog',
    );
    const crash = records.find((line) => line.event === 'host.crashed' && line.kind === 'ocr')!;
    const restart = records.find((line) => line.event === 'host.restarted' && line.kind === 'ocr')!;
    expect(crash).toBeDefined();
    if (state(page).fault === 'spin')
      expect(watchdog.some((line) => line.kind === 'ocr')).toBe(true);
    if (state(page).fault === 'exit0') expect(crash.exitCode).toBe(0);
    expect(restart).toMatchObject({ attempt: 1 });
    expect(Date.parse(restart.ts) - Date.parse(crash.ts)).toBeGreaterThanOrEqual(250);
    await page
      .locator('[data-check-id="engine-ocr"]')
      .getByRole('button', { name: 'جزئیات فنی', exact: true })
      .click();
    const detail = page.locator('[data-check-id="engine-ocr"]');
    const { hostPid } = JSON.parse((await detail.locator('pre').textContent()) ?? 'null') as {
      hostPid: number;
    };
    expect(hostPid).toBeGreaterThan(0);
    expect(hostPid).not.toBe(state(page).oldHost);
    expect(isAlive(state(page).oldHost!)).toBe(false);
    expect(await corePid(page)).toBe(state(page).pids!.core);
    for (const pid of state(page).pids!.others) expect(isAlive(pid)).toBe(true);
    const current = await harness.app!.evaluate(({ BrowserWindow }) => ({
      main: process.pid,
      window: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),
    }));
    expect(current).toEqual({ main: state(page).pids!.main, window: state(page).pids!.window });
    const evidencePath = $testInfo.outputPath('host-crash-evidence.json');
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          fault: state(page).fault,
          before: state(page).pids,
          killedHostPid: state(page).oldHost,
          replacementHostPid: hostPid,
          crash,
          restart,
          watchdog,
        },
        null,
        2,
      ),
    );
    await $testInfo.attach('host-crash-evidence', {
      path: evidencePath,
      contentType: 'application/json',
    });
    state(page).logs = records.filter(
      (line) => line.kind === 'ocr' && ['host.crashed', 'host.restarted'].includes(line.event),
    );
  },
);

Given('a sample job has committed chunks', async ({ harness, libraryRoot }) => {
  const page = harness.page!;
  await ready(page);
  await page.evaluate(async () => {
    await window.danesh.call('test.sampleDelay', { ms: 1200 });
    await window.danesh.call('sampleJob.start', {});
  });
  await expect.poll(async () => (await snapshot(page))?.committed ?? 0).toBeGreaterThanOrEqual(3);
  state(page).job = readJobAudit(libraryRoot, (await snapshot(page))!.jobId);
});
When(
  'the same in-flight task crashes its host on all 3 attempts',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    const job = (await snapshot(page))!;
    state(page).job = readJobAudit(libraryRoot, job.jobId);
    expect(state(page).job!.tasks.filter((task) => task.state === 'running')).toHaveLength(1);
    await page.evaluate(() =>
      window.danesh.call('test.engineFault', { kind: 'sample', mode: 'kill', when: 'now' }),
    );
    for (const count of [1, 2]) {
      await expect
        .poll(
          async () =>
            (await logs(libraryRoot)).filter(
              (line) => line.event === 'host.crashed' && line.kind === 'sample',
            ).length,
        )
        .toBe(count);
      await page.evaluate(() =>
        window.danesh.call('test.engineFault', { kind: 'sample', mode: 'kill', when: 'next-task' }),
      );
    }
  },
);
Then(
  'that task is quarantined and the job ends completed_with_issues',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await expect.poll(async () => (await snapshot(page))?.state).toBe('completed_with_issues');
    const before = state(page).job!;
    const interrupted = before.tasks.find((task) => task.state === 'running')!;
    const audit = readJobAudit(libraryRoot, before.snapshot.jobId);
    expect(audit.tasks.find((task) => task.taskId === interrupted.taskId)).toMatchObject({
      state: 'quarantined',
      attempt: 3,
    });
    expect(audit.executions).toHaveLength(audit.tasks.length - 1);
  },
);
Then(
  'committed chunks remain done and the window stays usable',
  async ({ harness, libraryRoot }) => {
    const before = state(harness.page!).job!;
    const after = readJobAudit(libraryRoot, before.snapshot.jobId);
    for (const task of before.tasks.filter((task) => task.state === 'done'))
      expect(after.tasks.find((other) => other.taskId === task.taskId)).toEqual(task);
    await ready(harness.page!);
    await harness.page!.getByRole('button', { name: 'اطلاعات محیط اجرا', exact: true }).click();
  },
);

When('an engine host sends a message that fails schema validation', async ({ harness }) => {
  const page = harness.page!;
  await ready(page);
  await page.evaluate(async () => {
    await window.danesh.call('test.engineMessage', { kind: 'sample' });
    await window.danesh.call('sampleJob.start', {});
  });
});
Then(
  'the message is rejected and a local metadata-only rejection record is written',
  async ({ libraryRoot }) => {
    await expect
      .poll(async () =>
        (await logs(libraryRoot, 'core')).some((line) => line.event === 'host.rejected'),
      )
      .toBe(true);
    const content = await readFile(join(libraryRoot, 'logs', 'core.jsonl'), 'utf8');
    expect(content).not.toContain('DANESH_PRIVATE_FAULT_PAYLOAD');
    const rejection = (await logs(libraryRoot, 'core')).find(
      (line) => line.event === 'host.rejected',
    )!;
    expect(Object.keys(rejection).sort()).toEqual([
      'byteLength',
      'errorClass',
      'event',
      'level',
      'process',
      'schema',
      'sender',
      'ts',
    ]);
  },
);
Then(
  'its in-flight task remains retriable and the window remains usable',
  async ({ harness, libraryRoot }) => {
    const page = harness.page!;
    await expect.poll(async () => (await snapshot(page))?.state).toBe('completed');
    const audit = readJobAudit(libraryRoot, (await snapshot(page))!.jobId);
    expect(audit.tasks[0]).toMatchObject({ state: 'done', attempt: 2 });
    expect(audit.tasks.slice(1).every((task) => task.attempt === 1)).toBe(true);
    await ready(page);
  },
);

Given(
  'Danesh is launched with that library folder and engine hosts are active',
  async ({ harness }) => {
    await harness.launch();
    const page = harness.page!;
    await ready(page);
    await page.evaluate(async () => {
      for (const kind of ['sample', 'llm', 'ocr', 'tts', 'pdf'])
        await window.danesh.call('test.engineSession', { kind, action: 'open' });
    });
    state(page).children = await harness.app!.evaluate(({ app }) => [
      process.pid,
      ...app.getAppMetrics().map((entry) => entry.pid),
    ]);
  },
);
When('I close the application', async ({ harness }) => {
  const before = state(harness.page!);
  await harness.close();
  // Keep evidence available after the page has closed.
  shutdown = before;
});
let shutdown: Evidence;
Then('every host and Core stop as supervisor-requested shutdowns', async ({ libraryRoot }) => {
  const records = await logs(libraryRoot);
  for (const kind of ['sample', 'llm', 'ocr', 'tts', 'pdf'])
    expect(records.some((line) => line.event === 'host.stop-requested' && line.kind === kind)).toBe(
      true,
    );
  expect(records.some((line) => line.event === 'core.stop-requested')).toBe(true);
});
Then('no shutdown exit schedules a restart', async ({ libraryRoot }) => {
  expect(
    (await logs(libraryRoot)).filter((line) =>
      ['host.crashed', 'host.restarted'].includes(line.event),
    ),
  ).toEqual([]);
});
Then('no process belonging to this Danesh instance remains running', async () => {
  await expect.poll(() => shutdown.children!.filter(isAlive)).toEqual([]);
});
Given('an engine host has crashed and restarted', async ({ harness, libraryRoot }) => {
  const page = harness.page!;
  await ready(page);
  await page.evaluate(async () => {
    await window.danesh.call('test.engineFault', {
      kind: 'sample',
      mode: 'kill',
      when: 'next-task',
    });
    await window.danesh.call('sampleJob.start', {});
  });
  await expect.poll(async () => (await snapshot(page))?.state).toBe('completed');
  state(page).logs = (await logs(libraryRoot)).filter((line) =>
    ['host.crashed', 'host.restarted'].includes(line.event),
  );
  expect(state(page).logs).toHaveLength(2);
});
When('Danesh is closed and reopened with the same library folder', async ({ harness }) => {
  const before = state(harness.page!);
  await harness.close();
  await harness.launch();
  await ready(harness.page!);
  evidence.set(harness.page!, before);
});
Then(
  'the local log still contains crash and restart records with process kind, exit code and attempt number',
  async ({ harness, libraryRoot }) => {
    const before = state(harness.page!).logs!;
    const current = await logs(libraryRoot);
    for (const record of before) {
      expect(current).toContainEqual(record);
      expect(record.kind).toBe('sample');
      expect(Number.isInteger(record.exitCode)).toBe(true);
      expect(record.attempt).toBe(1);
    }
  },
);
Then('those records contain no payloads', ({ harness }) => {
  for (const record of state(harness.page!).logs!)
    expect(Object.keys(record).sort()).toEqual([
      'attempt',
      'event',
      'exitCode',
      'kind',
      'level',
      'process',
      'ts',
    ]);
});
