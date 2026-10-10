import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import Database from 'better-sqlite3';
import { afterAll, expect, vi } from 'vitest';
import { createVerifiedBackup, listBackups } from '../src/backup.ts';
import { type LibraryOpen, openLibrary } from '../src/db.ts';
import { libraryPaths } from '../src/library.ts';
import {
  checksumOf,
  MigrationFailedError,
  type MigrationFile,
  MigrationSetError,
  planMigrations,
  probeDatabase,
  runMigrations,
} from '../src/migrate.ts';
import { shippedMigrations } from '../src/migrations-index.ts';

// These steps do real file I/O: copies, fsyncs, a 150 MB crash fixture and a forked writer that is killed. A hosted
// Windows runner with on-access scanning can exceed the 5 s default on one step while every assertion still holds.
vi.setConfig({ testTimeout: 30_000 });

const feature = await loadFeature(resolve('features/core/storage-migrations.feature'));
const [m1, m2] = shippedMigrations.slice().sort((a, b) => a.id.localeCompare(b.id)) as [
  MigrationFile,
  MigrationFile,
];
const failing = (id: string): MigrationFile => ({ id, sql: 'THIS IS NOT VALID SQL;' });
const extra = (id: string): MigrationFile => ({
  id,
  sql: 'CREATE TABLE extra (id INTEGER) STRICT;',
});

const parents: string[] = [];
/** A library folder whose path has Persian letters, a space and an apostrophe (D-13). */
function newRoot(): string {
  const parent = mkdtempSync(join(tmpdir(), 'danesh-migrations-'));
  parents.push(parent);
  return join(parent, "کتابخانهٔ من '");
}
afterAll(() => {
  for (const parent of parents) {
    rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const open = (root: string, migrations: MigrationFile[]): LibraryOpen =>
  openLibrary(root, { appVersion: 'test', migrations });
function close(opened: LibraryOpen): void {
  if ('db' in opened) opened.db.close();
}
function ready(opened: LibraryOpen) {
  if (opened.state !== 'ready') throw new Error(`expected ready, got ${opened.state}`);
  return opened.db;
}
/** A library at the given migration set with one known row. */
function seed(root: string, migrations: MigrationFile[]): void {
  const db = ready(open(root, migrations));
  db.prepare('INSERT INTO system_check_probe (at) VALUES (?)').run(42);
  db.close();
}
function query<T>(path: string, sql: string): T[] {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}
const userVersion = (path: string) => probeDatabase(path, planMigrations([m1, m2])).userVersion;
const migrationRows = (path: string) =>
  query<{ id: string; checksum: string }>(
    path,
    'SELECT id, checksum FROM schema_migration ORDER BY id',
  );
const rowsOf = (path: string) =>
  query<{ at: number }>(path, 'SELECT at FROM system_check_probe').map((row) => row.at);

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario(
    'A fresh library reaches the newest schema without a backup',
    ({ Given, When, Then, And }) => {
      let root: string;
      Given('a library with no database file and a valid numbered migration set', () => {
        root = newRoot();
      });
      When('the migration runner opens the library', () => {
        close(open(root, [m1, m2]));
      });
      Then('every migration is applied in ascending numeric order', () => {
        expect(migrationRows(libraryPaths(root).db).map((row) => row.id)).toEqual(['0001', '0002']);
      });
      And('the database user_version equals the highest known schema version', () => {
        expect(userVersion(libraryPaths(root).db)).toBe(2);
      });
      And('no pre-migration backup is created', () => {
        expect(listBackups(libraryPaths(root))).toEqual([]);
      });
    },
  );

  Scenario('One pending migration follows one verified backup', ({ Given, When, Then, And }) => {
    let root: string;
    Given('an existing library with exactly one pending migration', () => {
      root = newRoot();
      seed(root, [m1]);
    });
    When('the migration runner upgrades the library', () => {
      close(open(root, [m1, m2]));
    });
    Then('exactly one backup is created using "VACUUM INTO ?" and published to "backups/"', () => {
      const backups = listBackups(libraryPaths(root));
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatch(/^danesh-v1-/);
      expect(readFileSync(resolve('packages/storage/src/backup.ts'), 'utf8')).toContain(
        "'VACUUM INTO ?'",
      );
    });
    And('the backup passes "PRAGMA quick_check" before the migration begins', () => {
      const [name] = listBackups(libraryPaths(root));
      const copy = new Database(join(libraryPaths(root).backups, name!), { readonly: true });
      expect(copy.pragma('quick_check', { simple: true })).toBe('ok');
      // Taken before 0002: the copy is still at the previous schema version.
      expect(copy.pragma('user_version', { simple: true })).toBe(1);
      copy.close();
    });
    And('the migration executes in its own transaction', () => {
      expect(migrationRows(libraryPaths(root).db).map((row) => row.id)).toEqual(['0001', '0002']);
      expect(userVersion(libraryPaths(root).db)).toBe(2);
    });
    And('"PRAGMA foreign_key_check" returns zero rows before that transaction commits', () => {
      // A migration that violates a foreign key must roll back and leave the version unchanged.
      const parent = newRoot();
      seed(parent, [m1]);
      const violating: MigrationFile = {
        id: '0002',
        sql: 'CREATE TABLE p (id INTEGER PRIMARY KEY) STRICT; CREATE TABLE c (id INTEGER PRIMARY KEY, p INTEGER REFERENCES p(id)) STRICT; INSERT INTO c (id, p) VALUES (1, 99);',
      };
      const db = new Database(libraryPaths(parent).db);
      expect(() => runMigrations(db, planMigrations([m1, violating]), { appVersion: 't' })).toThrow(
        MigrationFailedError,
      );
      expect(db.pragma('user_version', { simple: true })).toBe(1);
      db.close();
    });
  });

  Scenario(
    'A changed applied migration is refused while line-ending differences are harmless',
    ({ Given, When, Then, And }) => {
      let root: string;
      let stored: string;
      let result: LibraryOpen;
      let before: { rows: number[]; history: unknown };
      Given('an applied migration and its stored checksum', () => {
        root = newRoot();
        seed(root, [m1]);
        stored = migrationRows(libraryPaths(root).db)[0]!.checksum;
      });
      When('the unchanged migration file is represented with CRLF instead of LF', () => {
        expect(checksumOf(m1.sql.replaceAll('\n', '\r\n'))).toBeTypeOf('string');
      });
      Then('its LF-normalized SHA-256 equals the stored checksum', () => {
        expect(checksumOf(m1.sql.replaceAll('\n', '\r\n'))).toBe(stored);
      });
      When('the applied migration SQL content is changed', () => {
        before = {
          rows: rowsOf(libraryPaths(root).db),
          history: migrationRows(libraryPaths(root).db),
        };
      });
      And('the migration runner opens the library', () => {
        result = open(root, [{ ...m1, sql: `${m1.sql}\n-- edited` }, m2]);
      });
      Then('it refuses to start with a checksum mismatch before applying any migration', () => {
        expect(result).toEqual({ state: 'failed', details: { errorClass: 'ChecksumMismatch' } });
        expect(userVersion(libraryPaths(root).db)).toBe(1);
      });
      And('the prior rows and migration history are unchanged', () => {
        expect({
          rows: rowsOf(libraryPaths(root).db),
          history: migrationRows(libraryPaths(root).db),
        }).toEqual(before);
      });
    },
  );

  ScenarioOutline(
    'Malformed migration numbering is refused',
    ({ Given, When, Then, And }, variables) => {
      let root: string;
      let files: MigrationFile[];
      let error: unknown;
      Given('a migration set with <defect>', () => {
        root = newRoot();
        files =
          variables.defect === 'a gap in the numbering'
            ? [m1, extra('0003')]
            : [m1, { ...m2, id: '0001' }];
      });
      When('the migration runner opens the library', () => {
        try {
          open(root, files);
        } catch (caught) {
          error = caught;
        }
      });
      Then('it reports a clear migration-set error', () => {
        expect(error).toBeInstanceOf(MigrationSetError);
        expect((error as Error).message).toMatch(/Gap|share the number/);
      });
      And('no migration is applied', () => {
        expect(existsSync(libraryPaths(root).db)).toBe(false);
      });
    },
  );

  Scenario(
    'Equal schema versions open and newer versions are refused untouched',
    ({ Given, And, When, Then }) => {
      let equal: string;
      let newer: string;
      const hashes: Record<string, string> = {};
      Given('database fixtures at the highest known user_version and one version higher', () => {
        equal = newRoot();
        seed(equal, [m1, m2]);
        newer = newRoot();
        seed(newer, [m1, m2, extra('0003')]);
      });
      And('the SHA-256 of each database file has been recorded', () => {
        hashes.equal = sha(libraryPaths(equal).db);
        hashes.newer = sha(libraryPaths(newer).db);
      });
      let results: Record<string, LibraryOpen>;
      When('the migration runner probes each fixture', () => {
        results = { equal: open(equal, [m1, m2]), newer: open(newer, [m1, m2]) };
      });
      Then('the equal-version fixture opens normally without a backup', () => {
        expect(results.equal!.state).toBe('ready');
        close(results.equal!);
        expect(listBackups(libraryPaths(equal))).toEqual([]);
      });
      And('the newer-version fixture is refused through a read-only probe', () => {
        expect(results.newer).toEqual({
          state: 'refused-newer',
          details: { dbUserVersion: 3, supportedVersion: 2 },
        });
      });
      And('the newer-version database file retains its recorded SHA-256', () => {
        expect(sha(libraryPaths(newer).db)).toBe(hashes.newer);
      });
    },
  );

  ScenarioOutline(
    'Backup retention prunes only after a verified replacement',
    ({ Given, When, Then, And }, variables) => {
      const existing = Number(variables.existing);
      const remaining = Number(variables.remaining);
      let root: string;
      let before: string[];
      let created: string;
      Given('<existing> valid pre-migration backups and a pending migration', async () => {
        root = newRoot();
        seed(root, [m1]);
        const db = new Database(libraryPaths(root).db);
        for (let index = 0; index < existing; index++) {
          createVerifiedBackup(db, libraryPaths(root), 1);
          await pause(3);
        }
        db.close();
        before = listBackups(libraryPaths(root)).reverse(); // oldest first
      });
      When('a new backup is created', () => {
        close(open(root, [m1, m2]));
        created = listBackups(libraryPaths(root))[0]!;
      });
      Then(
        'no existing backup is deleted before the new backup passes "PRAGMA quick_check"',
        () => {
          const copy = new Database(join(libraryPaths(root).backups, created), { readonly: true });
          expect(copy.pragma('quick_check', { simple: true })).toBe('ok');
          copy.close();
          expect(before).not.toContain(created);
        },
      );
      And('<remaining> valid backups remain after publication and retention', () => {
        expect(listBackups(libraryPaths(root))).toHaveLength(remaining);
      });
      And('any deletion selects the oldest creation time encoded in the filename', () => {
        const kept = new Set(listBackups(libraryPaths(root)));
        const deleted = before.filter((name) => !kept.has(name));
        expect(deleted).toEqual(before.slice(0, deleted.length)); // only the oldest ones
      });
    },
  );

  Scenario(
    'Backups created within the same second cannot overwrite each other',
    ({ Given, When, Then, And }) => {
      let root: string;
      let names: string[];
      Given('a library requiring two migration attempts within one second', () => {
        root = newRoot();
        seed(root, [m1]);
      });
      When('both attempts create a verified backup', () => {
        const db = new Database(libraryPaths(root).db);
        names = [
          createVerifiedBackup(db, libraryPaths(root), 1),
          createVerifiedBackup(db, libraryPaths(root), 1),
        ];
        db.close();
      });
      Then('the backup filenames are distinct', () => {
        expect(new Set(names).size).toBe(2);
      });
      And('neither attempt overwrites the other backup', () => {
        for (const name of names)
          expect(existsSync(join(libraryPaths(root).backups, name))).toBe(true);
      });
    },
  );

  Scenario(
    'A failed migration preserves prior rows in read-only recovery',
    ({ Given, When, Then, And }) => {
      let root: string;
      let result: LibraryOpen;
      Given('an existing library with prior rows and a pending migration that fails', () => {
        root = newRoot();
        seed(root, [m1]);
      });
      When('the migration runner attempts the upgrade', () => {
        result = open(root, [m1, failing('0002')]);
      });
      Then('the failing migration transaction is rolled back', () => {
        expect(userVersion(libraryPaths(root).db)).toBe(1);
        expect(migrationRows(libraryPaths(root).db).map((row) => row.id)).toEqual(['0001']);
      });
      And('the library opens in read-only recovery with the verified backup path offered', () => {
        expect(result.state).toBe('read-only-recovery');
        if (result.state !== 'read-only-recovery') return;
        const recovery = result;
        expect(recovery.details.failedMigrationId).toBe('0002');
        expect(existsSync(recovery.details.backupPath!)).toBe(true);
        expect(() =>
          recovery.db.prepare('INSERT INTO system_check_probe (at) VALUES (1)').run(),
        ).toThrow(/readonly/i);
        recovery.db.close();
      });
      And('the prior rows remain intact', () => {
        expect(rowsOf(libraryPaths(root).db)).toEqual([42]);
      });
    },
  );

  Scenario(
    'A pre-migration backup is restorable in a fresh folder',
    ({ Given, When, And, Then }) => {
      let backup: string;
      let fresh: string;
      Given('a verified pre-migration backup with known prior rows', () => {
        const root = newRoot();
        seed(root, [m1]);
        close(open(root, [m1, m2]));
        backup = join(libraryPaths(root).backups, listBackups(libraryPaths(root))[0]!);
      });
      When('the backup is restored into a fresh library folder', () => {
        fresh = newRoot();
        mkdirSync(fresh, { recursive: true });
        copyFileSync(backup, libraryPaths(fresh).db);
      });
      And('it is opened with the migration set for its previous schema version', () => {
        close(open(fresh, [m1]));
      });
      Then('user_version equals the previous schema version', () => {
        expect(userVersion(libraryPaths(fresh).db)).toBe(1);
      });
      And('all prior rows are intact', () => {
        expect(rowsOf(libraryPaths(fresh).db)).toEqual([42]);
      });
    },
  );

  Scenario(
    'Killing backup creation cannot publish a partial backup',
    ({ Given, When, Then, And }) => {
      let root: string;
      let liveHash: string;
      Given('an existing library with a pending migration and its live data recorded', () => {
        root = newRoot();
        seed(root, [m1]);
        const db = new Database(libraryPaths(root).db);
        // Large enough (about 150 MB) that VACUUM INTO is still copying when the kill arrives. Building this test
        // input needs no durability, so skip its journal and fsync; the live database is hashed after closing.
        db.pragma('journal_mode = OFF');
        db.pragma('synchronous = OFF');
        db.exec('CREATE TABLE bulk (id INTEGER PRIMARY KEY, payload BLOB)');
        const insert = db.prepare('INSERT INTO bulk (payload) VALUES (zeroblob(100000))');
        db.transaction(() => {
          for (let index = 0; index < 1500; index++) insert.run();
        })();
        db.close();
        liveHash = sha(libraryPaths(root).db);
      });
      When('the process is killed during backup creation', async () => {
        const child = spawn(
          process.execPath,
          [resolve('packages/storage/test/fixtures/kill-during-backup.ts'), root],
          { stdio: ['ignore', 'pipe', 'inherit'] },
        );
        const exited = new Promise((done) => child.once('exit', done));
        const tmp = libraryPaths(root).tmp;
        const deadline = Date.now() + 20_000;
        while (
          Date.now() < deadline &&
          !(existsSync(tmp) && readdirSync(tmp).some((name) => name.endsWith('.partial')))
        ) {
          await pause(2);
        }
        child.kill('SIGKILL');
        await exited;
      });
      Then('the partial copy exists only under "tmp/"', () => {
        expect(readdirSync(libraryPaths(root).tmp).some((name) => name.endsWith('.partial'))).toBe(
          true,
        );
      });
      And('it does not count as a valid backup', () => {
        expect(listBackups(libraryPaths(root))).toEqual([]);
      });
      And('the live database retains its prior data and schema', () => {
        expect(sha(libraryPaths(root).db)).toBe(liveHash);
        expect(userVersion(libraryPaths(root).db)).toBe(1);
      });
      When('the library is opened again', () => {
        close(open(root, [m1, m2]));
      });
      Then('a new backup is verified before any migration is applied', () => {
        const backups = listBackups(libraryPaths(root));
        expect(backups).toHaveLength(1);
        const copy = new Database(join(libraryPaths(root).backups, backups[0]!), {
          readonly: true,
        });
        expect(copy.pragma('quick_check', { simple: true })).toBe('ok');
        expect(copy.pragma('user_version', { simple: true })).toBe(1);
        copy.close();
        expect(userVersion(libraryPaths(root).db)).toBe(2);
        expect(
          readdirSync(libraryPaths(root).tmp).filter((name) => name.endsWith('.partial')),
        ).toEqual([]);
      });
    },
  );

  Scenario('A completed upgrade is a no-op on the second run', ({ Given, And, When, Then }) => {
    let root: string;
    let recorded: { backups: string[]; history: unknown; backupHashes: string[] };
    const snapshot = () => ({
      backups: listBackups(libraryPaths(root)),
      history: migrationRows(libraryPaths(root).db),
      backupHashes: listBackups(libraryPaths(root)).map((name) =>
        sha(join(libraryPaths(root).backups, name)),
      ),
    });
    Given('a library that has been upgraded successfully', () => {
      root = newRoot();
      seed(root, [m1]);
      close(open(root, [m1, m2]));
    });
    And('its backup files and schema_migration rows have been recorded', () => {
      recorded = snapshot();
    });
    When('the migration runner runs again', () => {
      close(open(root, [m1, m2]));
    });
    Then('no migration is re-applied and no backup is taken', () => {
      expect(listBackups(libraryPaths(root))).toHaveLength(1);
    });
    And('schema_migration and the backup files are unchanged', () => {
      expect(snapshot()).toEqual(recorded);
    });
  });

  Scenario(
    'Relaunch after a failed migration never overwrites an existing backup',
    ({ Given, And, When, Then }) => {
      let root: string;
      let first: { name: string; hash: string };
      Given('a failed migration with an existing verified backup', () => {
        root = newRoot();
        seed(root, [m1]);
        const result = open(root, [m1, failing('0002')]);
        expect(result.state).toBe('read-only-recovery');
        close(result);
      });
      And('the backup filename and SHA-256 have been recorded', () => {
        const [name] = listBackups(libraryPaths(root));
        first = { name: name!, hash: sha(join(libraryPaths(root).backups, name!)) };
      });
      When('the library is relaunched and the migration is attempted again', async () => {
        await pause(3);
        const second = open(root, [m1, failing('0002')]);
        expect(second.state).toBe('read-only-recovery');
        close(second);
      });
      Then('the existing backup retains its filename and SHA-256', () => {
        expect(sha(join(libraryPaths(root).backups, first.name))).toBe(first.hash);
      });
      And('the new migration attempt uses a distinct backup file', () => {
        const names = listBackups(libraryPaths(root));
        expect(names).toHaveLength(2);
        expect(new Set(names).size).toBe(2);
      });
    },
  );
});
