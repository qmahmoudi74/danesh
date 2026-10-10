import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { BackupError, createVerifiedBackup, sweepPartialBackups } from './backup.ts';
import { ensureLibraryDirs, type LibraryPaths, libraryPaths } from './library.ts';
import {
  ChecksumMismatchError,
  MigrationFailedError,
  type MigrationFile,
  planMigrations,
  probeDatabase,
  runMigrations,
} from './migrate.ts';
import { shippedMigrations } from './migrations-index.ts';

export interface Db {
  exec: Database.Database['exec'];
  prepare: Database.Database['prepare'];
  transaction: Database.Database['transaction'];
  pragma: Database.Database['pragma'];
  close: Database.Database['close'];
}

/** What opening a library produced. Only `ready` is writable. */
export type LibraryOpen =
  | { state: 'ready'; db: Db }
  | { state: 'refused-newer'; details: { dbUserVersion: number; supportedVersion: number } }
  | {
      state: 'read-only-recovery';
      db: Db;
      details: { supportedVersion: number; failedMigrationId: string; backupPath?: string };
    }
  | { state: 'failed'; details: { errorClass: string } };

function openReadWrite(path: string): Database.Database {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Library identity, written once. */
function ensureLibraryMeta(db: Db, appVersion: string): void {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'library_meta'")
    .get();
  if (!exists) return; // libraries still at schema version 1 gain the table with migration 0002
  const insert = db.prepare('INSERT OR IGNORE INTO library_meta (key, value) VALUES (?, ?)');
  insert.run('library_id', randomBytes(16).toString('hex'));
  insert.run('created_with', appVersion);
}

/**
 * Opens a library: probe read-only → refuse a newer database untouched → back up and migrate → ready. A failed
 * migration rolls back and reopens read-only (never restores or deletes anything automatically, D-14).
 */
export function openLibrary(
  root: string,
  {
    appVersion,
    migrations = shippedMigrations,
  }: { appVersion: string; migrations?: MigrationFile[] },
): LibraryOpen {
  const paths: LibraryPaths = libraryPaths(root);
  const plan = planMigrations(migrations);
  const supportedVersion = plan.at(-1)?.number ?? 0;

  let probe: ReturnType<typeof probeDatabase>;
  try {
    probe = probeDatabase(paths.db, plan);
  } catch {
    return { state: 'failed', details: { errorClass: 'OpenFailed' } };
  }
  if (probe.newer)
    return {
      state: 'refused-newer',
      details: { dbUserVersion: probe.userVersion, supportedVersion },
    };
  if (probe.checksumMismatches.length)
    return { state: 'failed', details: { errorClass: 'ChecksumMismatch' } };

  let db: Database.Database;
  try {
    ensureLibraryDirs(paths);
    sweepPartialBackups(paths);
    db = openReadWrite(paths.db);
  } catch {
    return { state: 'failed', details: { errorClass: 'OpenFailed' } };
  }
  let backupPath: string | undefined;
  try {
    runMigrations(db, plan, {
      appVersion,
      existingDatabase: probe.exists,
      beforeFirstPending: () => {
        backupPath = join(paths.backups, createVerifiedBackup(db, paths, probe.userVersion));
      },
    });
    ensureLibraryMeta(db, appVersion);
  } catch (error) {
    db.close();
    if (error instanceof MigrationFailedError) {
      if (!backupPath) return { state: 'failed', details: { errorClass: error.name } };
      const readOnly = new Database(paths.db, { readonly: true, fileMustExist: true });
      return {
        state: 'read-only-recovery',
        db: readOnly,
        details: {
          supportedVersion,
          failedMigrationId: error.migrationId,
          backupPath,
        },
      };
    }
    const errorClass =
      error instanceof ChecksumMismatchError || error instanceof BackupError
        ? error.name
        : 'OpenFailed';
    return { state: 'failed', details: { errorClass } };
  }
  return { state: 'ready', db };
}

/** Convenience for callers that need a writable library or nothing (tests, tools). */
export function openLibraryDb(root: string, appVersion = '0.1.0'): Db {
  const opened = openLibrary(root, { appVersion });
  if (opened.state !== 'ready') {
    if ('db' in opened) opened.db.close();
    throw new Error(`Library not writable: ${opened.state}`);
  }
  return opened.db;
}

/** Writes one System-check probe row and reads it back: proof the library is open, writable and persistent. */
export function recordSystemCheckProbe(db: Db): {
  readBack: boolean;
  count: number;
  journalMode: string;
  userVersion: number;
} {
  const written = db.prepare('INSERT INTO system_check_probe(at) VALUES (?)').run(Date.now());
  const row = db
    .prepare<[number | bigint], { at: number }>('SELECT at FROM system_check_probe WHERE id = ?')
    .get(written.lastInsertRowid);
  const total = db
    .prepare<[], { count: number }>('SELECT count(*) AS count FROM system_check_probe')
    .get();
  return {
    readBack: row !== undefined,
    count: total?.count ?? 0,
    journalMode: String(db.pragma('journal_mode', { simple: true })),
    userVersion: Number(db.pragma('user_version', { simple: true })),
  };
}
