import { join } from 'node:path';
import { recordSystemCheckProbe } from '@danesh/storage/db.ts';
import type { Check } from './registry.ts';

/** Evidence for ADR 0002 only: better-sqlite3 stays the driver; this records whether node:sqlite would work here. */
function nodeSqliteProbe(): { nodeSqlite: string; nodeSqliteVersion: string } {
  try {
    const sqlite = process.getBuiltinModule('node:sqlite') as
      | typeof import('node:sqlite')
      | undefined;
    if (!sqlite) return { nodeSqlite: 'unavailable', nodeSqliteVersion: '' };
    const memory = new sqlite.DatabaseSync(':memory:');
    try {
      return {
        nodeSqlite: 'available',
        nodeSqliteVersion: String(
          (memory.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
        ),
      };
    } finally {
      memory.close();
    }
  } catch {
    return { nodeSqlite: 'unavailable', nodeSqliteVersion: '' };
  }
}

/** Technical-only values for the report; paths and ids stay out of the primary message. */
function flatDetails(details: object): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === 'string' || typeof entry[1] === 'number',
    ),
  );
}

export const check: Check = {
  id: 'database',
  run({ library, init }) {
    const dbPath = join(init.libraryRoot, 'danesh.db');
    // Only a ready library is writable: the other states report why the check could not run.
    if (library?.state !== 'ready') {
      return {
        checkId: 'database',
        status: 'fail',
        durationMs: 0,
        detail: `library state: ${library?.state ?? 'unavailable'}`,
        fields: {
          dbPath,
          corePid: process.pid,
          libraryState: library?.state ?? 'unavailable',
          ...(library && 'details' in library ? flatDetails(library.details) : {}),
        },
      };
    }
    const probe = recordSystemCheckProbe(library.db);
    return {
      checkId: 'database',
      status: probe.readBack ? 'pass' : 'fail',
      durationMs: 0,
      detail: 'پایگاه داده باز شد و آمادهٔ استفاده است.',
      fields: {
        count: probe.count,
        corePid: process.pid,
        dbPath,
        journal_mode: probe.journalMode,
        user_version: probe.userVersion,
        ...nodeSqliteProbe(),
      },
    };
  },
};
