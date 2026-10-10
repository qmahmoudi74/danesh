import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import type { Check } from './registry.ts';

/** macOS packaged builds only: the whole .app, including every unpacked native binary, must pass strict verification. */
export const check: Check = {
  id: 'codesign',
  applies: (init) => init.packaged && init.platform === 'darwin',
  run({ init }) {
    const bundle = resolve(init.exePath, '..', '..', '..');
    return new Promise((done) => {
      execFile(
        'codesign',
        ['--verify', '--deep', '--strict', bundle],
        { timeout: 60_000 },
        (error, _stdout, stderr) => {
          done({
            checkId: 'codesign',
            status: error ? 'fail' : 'pass',
            durationMs: 0,
            detail: (stderr || (error ? error.name : 'valid on disk')).slice(0, 2000),
            fields: { bundle, exitCode: error && typeof error.code === 'number' ? error.code : 0 },
          });
        },
      );
    });
  },
};
