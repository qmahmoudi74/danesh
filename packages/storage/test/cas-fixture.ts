import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function interruptedCasHash(): string {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(64 * 1024, 9);
  for (let index = 0; index < 100; index++) hash.update(chunk);
  return hash.digest('hex');
}

/** Kill only after the child has written real bytes, so this proves an interrupted write. */
export async function interruptCasWrite(blobsDir: string, tmpDir: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [resolve('packages/storage/test/fixtures/kill-during-cas-write.ts'), blobsDir, tmpDir],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  const exited = new Promise<void>((done, fail) => {
    child.once('error', fail);
    child.once('exit', () => done());
  });
  try {
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error('CAS writer did not reach a partial write')),
        10_000,
      );
      child.stdout.once('data', () => {
        clearTimeout(timer);
        done();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        fail(new Error('CAS writer exited early'));
      });
    });
  } finally {
    child.kill('SIGKILL');
    await exited;
  }
}
