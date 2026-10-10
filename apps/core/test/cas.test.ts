import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LibraryOpen } from '@danesh/storage/db.ts';
import { afterEach, expect, it } from 'vitest';
import { bootCas, bootLibrary } from '../src/boot.ts';
import { check } from '../src/checks/cas-storage.check.ts';
import type { CheckContext } from '../src/checks/registry.ts';

const parents: string[] = [];
async function root() {
  const parent = await mkdtemp(join(tmpdir(), 'danesh-core-cas-'));
  parents.push(parent);
  return join(parent, 'کتابخانهٔ دانش');
}
afterEach(async () => {
  for (const parent of parents.splice(0))
    await rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

it('sweeps CAS orphans before opening the migrated library and checks a persistent real blob', async () => {
  const libraryRoot = await root();
  const tmp = join(libraryRoot, 'tmp');
  await mkdir(tmp, { recursive: true });
  await writeFile(join(tmp, `cas-${'a'.repeat(32)}.123.part`), 'orphan');
  await writeFile(join(tmp, 'backup.partial'), 'retain');
  const cas = await bootCas(libraryRoot);
  expect(await readdir(tmp)).toEqual(['backup.partial']);
  const library = bootLibrary(libraryRoot, 'test');
  if (library.state !== 'ready') throw new Error('expected migrated ready library');
  try {
    const context = { cas, library } as unknown as CheckContext;
    const result = await check.run(context);
    expect(result?.status).toBe('pass');
    const bytes = Buffer.from('danesh cas check v1');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(result?.fields).toEqual({
      sha256,
      size: bytes.length,
      existed: false,
      shard: sha256.slice(0, 2),
    });
    expect(await readFile(cas.pathFor(sha256))).toEqual(bytes);
    const restarted = await bootCas(libraryRoot);
    expect(await restarted.get(sha256)).toEqual(bytes);
    expect((await check.run({ ...context, cas: restarted }))?.fields.existed).toBe(true);
    await writeFile(cas.pathFor(sha256), 'corrupt');
    expect((await check.run(context))?.status).toBe('fail');
  } finally {
    library.db.close();
  }
});

it.each<LibraryOpen['state']>(['refused-newer', 'read-only-recovery', 'failed'])(
  'does not write CAS when the library is %s',
  async (state) => {
    const libraryRoot = await root();
    const cas = await bootCas(libraryRoot);
    // The check only consumes state, and must return before touching the database or CAS.
    const context = { cas, library: { state } } as unknown as CheckContext;
    expect((await check.run(context))?.status).toBe('fail');
    expect(await readdir(join(libraryRoot, 'blobs'))).toEqual([]);
  },
);
