import { createHash, randomBytes } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type Filesystem = Pick<
  typeof filesystem,
  'open' | 'mkdir' | 'link' | 'unlink' | 'readdir' | 'lstat'
>;
const PARTIAL_NAME = /^cas-[0-9a-f]{32}\.\d+\.part$/;
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const WRITE_CHUNK_BYTES = 64 * 1024;

export class CasIntegrityError extends Error {
  override readonly name = 'CasIntegrityError';
}

/** Immutable blobs: only an atomic, non-overwriting link may publish a fully synced file. */
export function createCas({
  blobsDir,
  tmpDir,
  fs = filesystem,
}: {
  blobsDir: string;
  tmpDir: string;
  fs?: Filesystem;
}) {
  function pathFor(sha256: string): string {
    if (sha256.length !== 64 || !/^[0-9a-f]{64}$/.test(sha256))
      throw new TypeError('CAS key must be 64 lowercase SHA-256 hex characters');
    return join(blobsDir, 'sha256', sha256.slice(0, 2), sha256);
  }

  async function retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= 4 || !RETRYABLE.has((error as NodeJS.ErrnoException).code ?? ''))
          throw error;
        await delay(50 * 2 ** attempt);
      }
    }
  }

  async function syncDirectory(path: string): Promise<void> {
    if (process.platform === 'win32') return; // Windows refuses directory fsync (R10).
    const handle = await fs.open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function readVerified(sha256: string, collect: boolean): Promise<Buffer> {
    const handle = await fs.open(pathFor(sha256), 'r');
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    try {
      for await (const value of handle.createReadStream({ autoClose: false })) {
        const chunk = value as Buffer;
        hash.update(chunk);
        if (collect) chunks.push(chunk);
      }
      if (hash.digest('hex') !== sha256) throw new CasIntegrityError('CAS blob hash mismatch');
      return Buffer.concat(chunks);
    } finally {
      await handle.close();
    }
  }

  async function has(sha256: string): Promise<boolean> {
    const path = pathFor(sha256);
    try {
      return (await fs.lstat(path)).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async function removePartial(path: string): Promise<void> {
    try {
      await retry(() => fs.unlink(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async function put(
    source: Uint8Array | AsyncIterable<Uint8Array>,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<{ sha256: string; size: number; existed: boolean }> {
    signal?.throwIfAborted();
    await fs.mkdir(tmpDir, { recursive: true });
    const partial = join(tmpDir, `cas-${randomBytes(16).toString('hex')}.${process.pid}.part`);
    let handle: filesystem.FileHandle | undefined;
    let created = false;
    try {
      handle = await fs.open(partial, 'wx', 0o600);
      created = true;
      const hash = createHash('sha256');
      let size = 0;
      const stream = source instanceof Uint8Array ? [source] : source;
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('CAS chunks must be bytes');
        for (let offset = 0; offset < chunk.byteLength; offset += WRITE_CHUNK_BYTES) {
          signal?.throwIfAborted();
          // Own a bounded copy so a caller cannot mutate bytes between writing and hashing.
          const bytes = Buffer.from(chunk.subarray(offset, offset + WRITE_CHUNK_BYTES));
          let written = 0;
          while (written < bytes.length) {
            signal?.throwIfAborted();
            const result = await handle.write(bytes.subarray(written));
            if (result.bytesWritten <= 0) throw new Error('CAS write made no progress');
            written += result.bytesWritten;
          }
          hash.update(bytes);
          size += bytes.byteLength;
          if (!Number.isSafeInteger(size)) throw new RangeError('CAS blob is too large');
        }
      }
      signal?.throwIfAborted();
      await handle.sync();
      await handle.close();
      handle = undefined;
      const sha256 = hash.digest('hex');
      const final = pathFor(sha256);
      await fs.mkdir(dirname(final), { recursive: true });
      signal?.throwIfAborted();
      let existed = false;
      try {
        await retry(() => {
          signal?.throwIfAborted();
          return fs.link(partial, final);
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await readVerified(sha256, false);
        existed = true;
      }
      // Sync the new shard and its ancestors before discarding the temporary link.
      for (const directory of [
        dirname(final),
        dirname(dirname(final)),
        blobsDir,
        dirname(blobsDir),
      ])
        await syncDirectory(directory);
      return { sha256, size, existed };
    } finally {
      try {
        await handle?.close();
      } finally {
        if (created) await removePartial(partial);
      }
    }
  }

  /** Only at startup, before writers: tmp/ is shared with verified database backups. */
  async function sweepTmp(): Promise<number> {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(blobsDir, { recursive: true });
    let removed = 0;
    for (const name of await fs.readdir(tmpDir)) {
      if (!PARTIAL_NAME.test(name)) continue;
      const path = join(tmpDir, name);
      if ((await fs.lstat(path)).isDirectory()) continue;
      await removePartial(path);
      removed++;
    }
    return removed;
  }

  return { put, get: (sha256: string) => readVerified(sha256, true), has, pathFor, sweepTmp };
}
export type Cas = ReturnType<typeof createCas>;
