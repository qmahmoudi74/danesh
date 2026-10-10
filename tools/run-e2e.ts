import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
function run(args: string[]): void {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error('Run this harness through pnpm test:e2e');
  const native = pnpmEntry.endsWith('.exe');
  const result = spawnSync(
    native ? pnpmEntry : process.execPath,
    native ? args : [pnpmEntry, ...args],
    { stdio: 'inherit', env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (env.DANESH_E2E_PACKAGED === '1') {
  // Packaged DaneshTest build: package:test also proves the hook scanner finds the test sentinel (positive control).
  if (env.DANESH_E2E_SKIP_BUILD !== '1') run(['package:test']);
  env.DANESH_TEST_EXE = resolve(
    'apps/desktop/dist-test',
    process.platform === 'darwin'
      ? 'mac-arm64/DaneshTest.app/Contents/MacOS/DaneshTest'
      : process.platform === 'win32'
        ? 'win-unpacked/DaneshTest.exe'
        : 'linux-unpacked/danesh',
  );
  if (!existsSync(env.DANESH_TEST_EXE))
    throw new Error(`Packaged test build not found: ${env.DANESH_TEST_EXE}`);
} else if (!env.DANESH_TEST_EXE && env.DANESH_E2E_SKIP_BUILD !== '1') run(['build:test']);
run(['exec', 'bddgen', '--config', 'apps/desktop/playwright.config.ts']);
run([
  'exec',
  'playwright',
  'test',
  '--config',
  'apps/desktop/playwright.config.ts',
  ...(env.DANESH_E2E_GREP ? ['--grep', env.DANESH_E2E_GREP] : []),
]);
