import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { CasIntegrityError, createCas } from '../src/cas.ts';
import { interruptCasWrite, interruptedCasHash } from './cas-fixture.ts';

let parent: string;
let blobsDir: string;
let tmpDir: string;
beforeEach(async () => {
  parent = await filesystem.mkdtemp(join(tmpdir(), 'danesh-cas-'));
  const root = join(parent, "کتابخانهٔ من '");
  blobsDir = join(root, 'blobs');
  tmpDir = join(root, 'tmp');
});
afterEach(async () => {
  await filesystem.rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const bytes = Buffer.from('دانش content');
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

it('stores streamed bytes at deterministic validated paths and handles empty input', async () => {
  const cas = createCas({ blobsDir, tmpDir });
  async function* stream() {
    yield await Promise.resolve(bytes.subarray(0, 3));
    yield bytes.subarray(3);
  }
  const result = await cas.put(stream());
  expect(result).toEqual({ sha256: digest(bytes), size: bytes.length, existed: false });
  expect(cas.pathFor(result.sha256)).toBe(
    join(blobsDir, 'sha256', result.sha256.slice(0, 2), result.sha256),
  );
  expect(await cas.get(result.sha256)).toEqual(bytes);
  expect(await cas.has(result.sha256)).toBe(true);
  expect(await cas.has('0'.repeat(64))).toBe(false);
  for (const invalid of ['../secret', 'A'.repeat(64), `${'a'.repeat(64)}\n`, 'a'.repeat(63)]) {
    expect(() => cas.pathFor(invalid)).toThrow();
  }
  const empty = await cas.put(new Uint8Array());
  expect(empty.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(await cas.get(empty.sha256)).toHaveLength(0);
  expect(await cas.has(empty.sha256)).toBe(true);
});

it('deduplicates ten concurrent writers without rewriting the final inode or timestamp', async () => {
  const cas = createCas({ blobsDir, tmpDir });
  const results = await Promise.all(Array.from({ length: 10 }, () => cas.put(bytes)));
  expect(results.filter((result) => !result.existed)).toHaveLength(1);
  expect(new Set(results.map((result) => result.sha256)).size).toBe(1);
  const path = cas.pathFor(digest(bytes));
  const before = await filesystem.stat(path, { bigint: true });
  await delay(20);
  expect((await createCas({ blobsDir, tmpDir }).put(bytes)).existed).toBe(true);
  const after = await filesystem.stat(path, { bigint: true });
  expect(after.ino).toBe(before.ino);
  expect(after.mtimeNs).toBe(before.mtimeNs);
  expect(await filesystem.readdir(join(blobsDir, 'sha256', digest(bytes).slice(0, 2)))).toEqual([
    digest(bytes),
  ]);
  expect(await filesystem.readdir(tmpDir)).toEqual([]);
});

it('rejects corruption on read and duplicate publication without replacing damaged evidence', async () => {
  const cas = createCas({ blobsDir, tmpDir });
  const result = await cas.put(bytes);
  await filesystem.writeFile(cas.pathFor(result.sha256), 'corrupt');
  await expect(cas.get(result.sha256)).rejects.toBeInstanceOf(CasIntegrityError);
  await expect(cas.put(bytes)).rejects.toBeInstanceOf(CasIntegrityError);
  expect(await filesystem.readFile(cas.pathFor(result.sha256), 'utf8')).toBe('corrupt');
  expect(await filesystem.readdir(tmpDir)).toEqual([]);
});

it.each(['EPERM', 'EBUSY', 'EACCES'])(
  'retries %s, then verifies an existing target',
  async (code) => {
    const original = createCas({ blobsDir, tmpDir });
    await original.put(bytes);
    let attempts = 0;
    const cas = createCas({
      blobsDir,
      tmpDir,
      fs: {
        ...filesystem,
        link: async (from, to) => {
          attempts++;
          if (attempts <= 2) throw Object.assign(new Error('locked'), { code });
          await filesystem.link(from, to);
        },
      },
    });
    expect((await cas.put(bytes)).existed).toBe(true);
    expect(attempts).toBe(3);
    await filesystem.writeFile(original.pathFor(digest(bytes)), 'corrupt');
    await expect(cas.put(bytes)).rejects.toBeInstanceOf(CasIntegrityError);
  },
);

it('bounds exhausted retries and refuses unsafe rename fallback', async () => {
  for (const code of ['EBUSY', 'ENOTSUP']) {
    let attempts = 0;
    const cas = createCas({
      blobsDir,
      tmpDir,
      fs: {
        ...filesystem,
        link: () => {
          attempts++;
          return Promise.reject(Object.assign(new Error('publication failed'), { code }));
        },
      },
    });
    await expect(cas.put(bytes)).rejects.toMatchObject({ code });
    expect(attempts).toBe(code === 'EBUSY' ? 5 : 1);
    expect(await cas.has(digest(bytes))).toBe(false);
    expect(await filesystem.readdir(tmpDir)).toEqual([]);
  }
});

it('cleans up a throwing source and a cancelled stream without publication', async () => {
  const cas = createCas({ blobsDir, tmpDir });
  async function* broken() {
    yield await Promise.resolve(bytes);
    throw new Error('source aborted');
  }
  await expect(cas.put(broken())).rejects.toThrow('source aborted');
  const controller = new AbortController();
  async function* cancelled() {
    yield await Promise.resolve(bytes);
    controller.abort();
    yield bytes;
  }
  await expect(cas.put(cancelled(), { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(await cas.has(digest(bytes))).toBe(false);
  expect(await filesystem.readdir(tmpDir)).toEqual([]);
});

it('streams large input and writes every byte when the filesystem accepts partial writes', async () => {
  let largestWrite = 0;
  const cas = createCas({
    blobsDir,
    tmpDir,
    fs: {
      ...filesystem,
      open: async (...args: Parameters<typeof filesystem.open>) => {
        const handle = await filesystem.open(...args);
        if (args[1] === 'wx') {
          const write = handle.write.bind(handle);
          handle.write = ((buffer: Uint8Array) => {
            largestWrite = Math.max(largestWrite, buffer.byteLength);
            return write(buffer.subarray(0, Math.min(4096, buffer.byteLength)));
          }) as typeof handle.write;
        }
        return handle;
      },
    },
  });
  const chunk = Buffer.alloc(1_000_000, 7);
  async function* large() {
    for (let index = 0; index < 12; index++) yield await Promise.resolve(chunk);
  }
  const result = await cas.put(large());
  const expected = createHash('sha256');
  for (let index = 0; index < 12; index++) expected.update(chunk);
  expect(result.size).toBe(12_000_000);
  expect(result.sha256).toBe(expected.digest('hex'));
  expect(largestWrite).toBeLessThanOrEqual(64 * 1024);
  expect((await cas.get(result.sha256)).length).toBe(result.size);
});

it('a killed real writer leaves only a CAS partial that startup sweeps without touching backup data', async () => {
  await interruptCasWrite(blobsDir, tmpDir);
  const cas = createCas({ blobsDir, tmpDir });
  expect(await cas.has(interruptedCasHash())).toBe(false);
  expect((await filesystem.readdir(tmpDir)).some((name) => name.endsWith('.part'))).toBe(true);
  await filesystem.writeFile(join(tmpDir, 'backup.partial'), 'retain');
  expect(await cas.sweepTmp()).toBe(1);
  expect(await filesystem.readdir(tmpDir)).toEqual(['backup.partial']);
  expect(await cas.get((await cas.put(bytes)).sha256)).toEqual(bytes);
}, 15_000);
