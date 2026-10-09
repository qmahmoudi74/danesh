import { join } from 'node:path';
import type { Check } from './registry.ts';

/** Evidence for ADR 0002 only: better-sqlite3 stays the driver; this records whether node:sqlite would work here. */
function nodeSqliteProbe(): { nodeSqlite: string; nodeSqliteVersion: string } {
  try {
    const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite') | undefined;
    if (!sqlite) return { nodeSqlite: 'unavailable', nodeSqliteVersion: '' };
    const memory = new sqlite.DatabaseSync(':memory:');
    try { return { nodeSqlite: 'available', nodeSqliteVersion: String((memory.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v) }; }
    finally { memory.close(); }
  } catch { return { nodeSqlite: 'unavailable', nodeSqliteVersion: '' }; }
}

export const check: Check = {
  id: 'database',
  run({ db, init }) {
    const written = db.prepare('INSERT INTO system_check_probe(at) VALUES (?)').run(Date.now());
    const row = db.prepare<[number | bigint], { at: number }>('SELECT at FROM system_check_probe WHERE id = ?').get(written.lastInsertRowid);
    const count = db.prepare<[], { count: number }>('SELECT count(*) AS count FROM system_check_probe').get()?.count ?? 0;
    return { checkId: 'database', status: row ? 'pass' : 'fail', durationMs: 0, detail: 'پایگاه داده باز شد و آمادهٔ استفاده است.', fields: { count, corePid: process.pid, dbPath: join(init.libraryRoot, 'danesh.db'), journal_mode: String(db.pragma('journal_mode', { simple: true })), user_version: Number(db.pragma('user_version', { simple: true })), ...nodeSqliteProbe() } };
  },
};
