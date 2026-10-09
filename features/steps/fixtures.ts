import { test as base, createBdd } from 'playwright-bdd';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';

interface Harness {
  app: ElectronApplication | undefined;
  page: Page | undefined;
  firstCount: number;
  launch(): Promise<void>;
  close(): Promise<void>;
}
const require = createRequire(import.meta.url);
export const test = base.extend<{ libraryRoot: string; harness: Harness }>({
  libraryRoot: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'دانش آزمون '));
    try { await use(root); }
    finally {
      const target = resolve(root);
      if (dirname(target) !== resolve(tmpdir()) || !target.startsWith(resolve(tmpdir(), 'دانش آزمون '))) throw new Error('Unsafe test cleanup path');
      await rm(target, { recursive: true, force: true });
    }
  },
  harness: async ({ libraryRoot }, use) => {
    const harness: Harness = {
      app: undefined, page: undefined, firstCount: 0,
      async launch() {
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const executablePath = env.DANESH_TEST_EXE ?? (require('electron') as string);
        harness.app = await _electron.launch({ executablePath, args: [...(env.DANESH_TEST_EXE ? [] : [resolve('apps/desktop')]), `--user-data-dir=${libraryRoot}`], env });
        harness.app.process().stderr?.on('data', (data: Buffer) => process.stderr.write(data));
        harness.page = await harness.app.firstWindow();
        await harness.page.waitForLoadState('domcontentloaded');
        await harness.page.evaluate(() => {
          const violations: string[] = [];
          Object.assign(window, { __cspViolations: violations });
          document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
        });
      },
      async close() { await harness.app?.close(); harness.app = undefined; harness.page = undefined; },
    };
    try { await use(harness); } finally { await harness.close(); }
  },
});
export const { Given, When, Then } = createBdd(test);
