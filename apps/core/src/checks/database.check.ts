import { join } from 'node:path';
import { recordSystemCheckProbe } from '@danesh/storage/db.ts';
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
    const probe = recordSystemCheckProbe(db);
    return {
      checkId: 'database',
      status: probe.readBack ? 'pass' : 'fail',
      durationMs: 0,
      detail: 'پایگاه داده باز شد و آمادهٔ استفاده است.',
      fields: {
        count: probe.count,
        corePid: process.pid,
        dbPath: join(init.libraryRoot, 'danesh.db'),
        journal_mode: probe.journalMode,
        user_version: probe.userVersion,
        ...nodeSqliteProbe(),
      },
    };
  },
};
