import { join } from 'node:path';
import type { Check } from './registry.ts';

export const check: Check = {
  id: 'database',
  run({ db, init }) {
    const written = db.prepare('INSERT INTO system_check_probe(at) VALUES (?)').run(Date.now());
    const row = db.prepare<[number | bigint], { at: number }>('SELECT at FROM system_check_probe WHERE id = ?').get(written.lastInsertRowid);
    const count = db.prepare<[], { count: number }>('SELECT count(*) AS count FROM system_check_probe').get()?.count ?? 0;
    return { checkId: 'database', status: row ? 'pass' : 'fail', durationMs: 0, detail: 'پایگاه داده باز شد و آمادهٔ استفاده است.', fields: { count, corePid: process.pid, dbPath: join(init.libraryRoot, 'danesh.db'), journal_mode: String(db.pragma('journal_mode', { simple: true })), user_version: Number(db.pragma('user_version', { simple: true })) } };
  },
};
