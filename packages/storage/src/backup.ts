import { randomBytes } from 'node:crypto';
import { existsSync, linkSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { LibraryPaths } from './library.ts';

const BACKUP_NAME = /^danesh-v(\d+)-(\d{8}T\d{9})-([0-9a-f]{6})\.db$/;
const KEEP_BACKUPS = 3;
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

export class BackupError extends Error {
  override readonly name = 'BackupError';
}

/** UTC timestamp as yyyyMMddTHHmmssSSS, so names sort by creation time. */
function stamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', '');
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** A hard link publishes the verified file atomically and fails if its name already exists. */
function publish(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      linkSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt >= 5 || !RETRYABLE.has(code)) throw error;
      sleepSync(50 * (attempt + 1));
    }
  }
}

/** Backups newest first, ordered by the timestamp encoded in the name (then the random suffix). */
export function listBackups(paths: LibraryPaths): string[] {
  if (!existsSync(paths.backups)) return [];
  return readdirSync(paths.backups)
    .filter((name) => BACKUP_NAME.test(name))
    .sort((a, b) =>
      `${BACKUP_NAME.exec(b)![2]}${BACKUP_NAME.exec(b)![3]}`.localeCompare(
        `${BACKUP_NAME.exec(a)![2]}${BACKUP_NAME.exec(a)![3]}`,
      ),
    );
}

/** Deletes only the oldest backups beyond `keep`. Called after a new backup has been verified and published. */
export function pruneBackups(paths: LibraryPaths, keep = KEEP_BACKUPS): void {
  for (const name of listBackups(paths).slice(keep))
    rmSync(join(paths.backups, name), { force: true });
}

/** Partial copies from an interrupted backup live in tmp/ and never count as backups; remove them at start-up. */
export function sweepPartialBackups(paths: LibraryPaths): void {
  if (!existsSync(paths.tmp)) return;
  for (const name of readdirSync(paths.tmp)) {
    if (name.endsWith('.partial') && BACKUP_NAME.test(name.slice(0, -'.partial'.length)))
      rmSync(join(paths.tmp, name), { force: true });
  }
}

/**
 * Copies the live database with `VACUUM INTO ?` into tmp/, requires `PRAGMA quick_check` = ok on the copy, then
 * publishes it into backups/ without ever overwriting an existing file, and finally prunes to the newest three.
 * Returns the published file name.
 */
export function createVerifiedBackup(
  db: Pick<Database.Database, 'prepare'>,
  paths: LibraryPaths,
  schemaVersion: number,
): string {
  const name = `danesh-v${schemaVersion}-${stamp()}-${randomBytes(3).toString('hex')}.db`;
  const partial = join(paths.tmp, `${name}.partial`);
  const target = join(paths.backups, name);
  if (existsSync(target)) throw new BackupError(`Backup already exists: ${name}`);
  try {
    db.prepare('VACUUM INTO ?').run(partial);
    const copy = new Database(partial, { readonly: true, fileMustExist: true });
    try {
      if (copy.pragma('quick_check', { simple: true }) !== 'ok')
        throw new BackupError('Backup copy failed quick_check');
    } finally {
      copy.close();
    }
    publish(partial, target);
    rmSync(partial);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error instanceof BackupError
      ? error
      : new BackupError('Backup could not be created', { cause: error });
  }
  pruneBackups(paths);
  return name;
}
