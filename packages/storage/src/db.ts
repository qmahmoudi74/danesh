import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import initialMigration from '../migrations/0001_init.sql?raw';

export interface Db {
  exec: Database.Database['exec'];
  prepare: Database.Database['prepare'];
  transaction: Database.Database['transaction'];
  pragma: Database.Database['pragma'];
  close: Database.Database['close'];
}
export function openLibraryDb(libraryRoot: string, appVersion = '0.1.0'): Db {
  mkdirSync(libraryRoot, { recursive: true });
  const db = new Database(join(libraryRoot, 'danesh.db'));
  try {
    db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
    const version = db.pragma('user_version', { simple: true });
    if (version === 0) db.transaction(() => {
      db.exec(initialMigration);
      db.prepare('INSERT INTO schema_migration VALUES (?, ?, ?, ?)').run('0001', createHash('sha256').update(initialMigration.replace(/\r\n/g, '\n')).digest('hex'), Date.now(), appVersion);
      db.pragma('user_version = 1');
    })();
    else if (version !== 1) throw new Error('Unsupported library schema');
    return db;
  } catch (error) { db.close(); throw error; }
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
  const total = db.prepare<[], { count: number }>('SELECT count(*) AS count FROM system_check_probe').get();
  return {
    readBack: row !== undefined,
    count: total?.count ?? 0,
    journalMode: String(db.pragma('journal_mode', { simple: true })),
    userVersion: Number(db.pragma('user_version', { simple: true })),
  };
}
