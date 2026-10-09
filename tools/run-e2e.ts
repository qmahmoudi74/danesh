import { spawnSync } from 'node:child_process';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
function run(args: string[]): void {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error('Run this harness through pnpm test:e2e');
  const native = pnpmEntry.endsWith('.exe');
  const result = spawnSync(native ? pnpmEntry : process.execPath, native ? args : [pnpmEntry, ...args], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!env.DANESH_TEST_EXE && env.DANESH_E2E_SKIP_BUILD !== '1') run(['build:test']);
run(['exec', 'bddgen', '--config', 'apps/desktop/playwright.config.ts']);
run(['exec', 'playwright', 'test', '--config', 'apps/desktop/playwright.config.ts', ...(env.DANESH_E2E_GREP ? ['--grep', env.DANESH_E2E_GREP] : [])]);
