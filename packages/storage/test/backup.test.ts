import {
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVerifiedBackup,
  listBackups,
  pruneBackups,
  sweepPartialBackups,
} from '../src/backup.ts';
import { ensureLibraryDirs, libraryPaths } from '../src/library.ts';

vi.mock('node:fs', async (importOriginal) => {
  const filesystem = await importOriginal<typeof import('node:fs')>();
  return {
    ...filesystem,
    linkSync: vi.fn(filesystem.linkSync),
    renameSync: vi.fn(filesystem.renameSync),
  };
});

let root: string;
let db: Database.Database;
const paths = () => libraryPaths(root);
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'danesh-backup-')), "کتابخانهٔ من '");
  ensureLibraryDirs(paths());
  db = new Database(paths().db);
  db.exec(
    "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('a'), ('b');",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  db.close();
  rmSync(join(root, '..'), { recursive: true, force: true });
});

describe('verified backups', () => {
  it('publishes a valid copy named by version, UTC time and a random suffix, leaving nothing in tmp', () => {
    const name = createVerifiedBackup(db, paths(), 7);
    expect(name).toMatch(/^danesh-v7-\d{8}T\d{9}-[0-9a-f]{6}\.db$/);
    expect(listBackups(paths())).toEqual([name]);
    expect(readdirSync(paths().tmp)).toEqual([]);
    const copy = new Database(join(paths().backups, name), { readonly: true });
    expect(copy.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 2 });
    copy.close();
  });

  it('gives backups made in the same millisecond distinct names and never overwrites', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    const names = [createVerifiedBackup(db, paths(), 1), createVerifiedBackup(db, paths(), 1)];
    expect(new Set(names).size).toBe(2);
    expect(listBackups(paths()).sort()).toEqual([...names].sort());
  });

  it('preserves a backup created by another publisher before the atomic publication', async () => {
    const filesystem = await vi.importActual<typeof import('node:fs')>('node:fs');
    let competingTarget: string | undefined;
    const intercept =
      (operation: typeof linkSync) =>
      (from: Parameters<typeof linkSync>[0], to: Parameters<typeof linkSync>[1]) => {
        competingTarget = String(to);
        writeFileSync(to, 'existing backup');
        operation(from, to);
      };
    vi.mocked(linkSync).mockImplementationOnce(intercept(filesystem.linkSync));
    vi.mocked(renameSync).mockImplementationOnce(intercept(filesystem.renameSync));
    expect(() => createVerifiedBackup(db, paths(), 1)).toThrow(/Backup/);
    if (!competingTarget) throw new Error('Backup was not published');
    expect(readFileSync(competingTarget, 'utf8')).toBe('existing backup');
    expect(readdirSync(paths().tmp)).toEqual([]);
  });

  it('retains all prior backups if a new copy fails validation', () => {
    const names = [
      createVerifiedBackup(db, paths(), 1),
      createVerifiedBackup(db, paths(), 1),
      createVerifiedBackup(db, paths(), 1),
    ];
    vi.spyOn(Database.prototype, 'pragma').mockReturnValue('corrupt backup');
    expect(() => createVerifiedBackup(db, paths(), 1)).toThrow(/quick_check/);
    expect(listBackups(paths()).sort()).toEqual(names.sort());
  });

  it('keeps the newest three and deletes only the oldest by the time in the name', async () => {
    const names: string[] = [];
    for (let index = 0; index < 5; index++) {
      names.push(createVerifiedBackup(db, paths(), 1));
      await pause(3);
    }
    expect(listBackups(paths())).toEqual([names[4], names[3], names[2]]);
    pruneBackups(paths(), 3);
    expect(listBackups(paths()).length).toBe(3);
  });

  it('ignores files that are not backups and sweeps interrupted partial copies from tmp', () => {
    writeFileSync(join(paths().backups, 'notes.txt'), 'keep');
    writeFileSync(join(paths().tmp, 'danesh-v1-20261010T000000000-123abc.db.partial'), 'partial');
    writeFileSync(join(paths().tmp, 'user-data.partial'), 'keep');
    sweepPartialBackups(paths());
    expect(readdirSync(paths().tmp)).toEqual(['user-data.partial']);
    expect(listBackups(paths())).toEqual([]);
    expect(readdirSync(paths().backups)).toEqual(['notes.txt']);
  });
});
