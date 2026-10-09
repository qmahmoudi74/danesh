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
  coreReadyDelayMs: number;
  coreStalledUntil: number;
  echo: { hostPid: number; corePid: number } | undefined;
  launch(): Promise<void>;
  close(): Promise<void>;
}
const require = createRequire(import.meta.url);
export const test = base.extend<{ libraryRoot: string; harness: Harness }>({
  libraryRoot: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), "دانش آزمون '"));
    try { await use(root); }
    finally {
      const target = resolve(root);
      if (dirname(target) !== resolve(tmpdir()) || !target.startsWith(resolve(tmpdir(), 'دانش آزمون '))) throw new Error('Unsafe test cleanup path');
      await rm(target, { recursive: true, force: true });
    }
  },
  harness: async ({ libraryRoot }, use) => {
    const harness: Harness = {
      app: undefined, page: undefined, firstCount: 0, coreReadyDelayMs: 0, coreStalledUntil: 0, echo: undefined,
      async launch() {
        const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]));
        delete env.ELECTRON_RUN_AS_NODE;
        const executablePath = env.DANESH_TEST_EXE ?? (require('electron') as string);
        harness.app = await _electron.launch({ executablePath, args: [...(env.DANESH_TEST_EXE ? [] : [resolve('apps/desktop')]), `--user-data-dir=${libraryRoot}`, ...(harness.coreReadyDelayMs ? [`--test-core-ready-delay=${harness.coreReadyDelayMs}`] : [])], env });
        harness.app.process().stderr?.on('data', (data: Buffer) => process.stderr.write(data));
        harness.page = await harness.app.firstWindow();
        await harness.page.waitForLoadState('domcontentloaded');
        await harness.app.context().addInitScript(() => {
          const violations: string[] = [];
          Object.assign(window, { __cspViolations: violations });
          document.addEventListener('securitypolicyviolation', (event) => violations.push(JSON.stringify({ directive: event.violatedDirective, blocked: event.blockedURI, source: event.sourceFile, line: event.lineNumber })));
        });
        const firstNonce = await harness.page.locator('meta[property="csp-nonce"]').getAttribute('content');
        const response = await harness.page.reload({ waitUntil: 'domcontentloaded' });
        if (!response || !response.headers()['content-security-policy']?.includes("connect-src 'none'")) throw new Error('Missing restrictive CSP header');
        const secondNonce = await harness.page.locator('meta[property="csp-nonce"]').getAttribute('content');
        if (!firstNonce || !secondNonce || firstNonce === secondNonce || !response.headers()['content-security-policy']?.includes(`'nonce-${secondNonce}'`)) throw new Error('CSP nonce not fresh or not bound to document');
      },
      async close() { await harness.app?.close(); harness.app = undefined; harness.page = undefined; },
    };
    try { await use(harness); } finally { await harness.close(); }
  },
});
export const { Given, When, Then } = createBdd(test);
