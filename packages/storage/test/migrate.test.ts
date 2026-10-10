import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openLibrary } from '../src/db.ts';
import { libraryPaths } from '../src/library.ts';
import { checksumOf, MigrationSetError, planMigrations, probeDatabase } from '../src/migrate.ts';
import { shippedMigrations } from '../src/migrations-index.ts';

const file = (id: string, sql = 'SELECT 1;') => ({ id, sql });

describe('planMigrations', () => {
  it('orders migrations and numbers them from 0001', () => {
    const plan = planMigrations([file('0002'), file('0001')]);
    expect(plan.map((migration) => [migration.id, migration.number])).toEqual([
      ['0001', 1],
      ['0002', 2],
    ]);
  });

  it('rejects duplicate numbers, gaps and malformed ids', () => {
    expect(() => planMigrations([file('0001'), file('0001')])).toThrow(MigrationSetError);
    expect(() => planMigrations([file('0001'), file('0003')])).toThrow(/Gap/);
    expect(() => planMigrations([file('0002')])).toThrow(/Gap/);
    for (const id of ['1', '00001', 'abcd', '0001.sql']) {
      expect(() => planMigrations([file(id)])).toThrow(/Invalid migration id/);
    }
  });
});

describe('checksumOf', () => {
  it('is the same for LF and CRLF text and different when the SQL changes', () => {
    const lf = 'CREATE TABLE a (\n  id INTEGER\n);\n';
    expect(checksumOf(lf.replaceAll('\n', '\r\n'))).toBe(checksumOf(lf));
    expect(checksumOf(lf.replace('a', 'b'))).not.toBe(checksumOf(lf));
    expect(checksumOf(lf)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('read-only preflight', () => {
  const roots: string[] = [];
  const newRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 'danesh-preflight-'));
    roots.push(root);
    return root;
  };
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('refuses a changed migration before enabling WAL or changing database bytes', () => {
    const root = newRoot();
    const opened = openLibrary(root, { appVersion: 'test' });
    if (opened.state !== 'ready') throw new Error('Expected a ready library');
    opened.db.pragma('journal_mode = DELETE');
    opened.db.close();
    const before = hash(libraryPaths(root).db);
    const migrations = shippedMigrations.map((migration) => ({
      ...migration,
      sql: `${migration.sql}\n-- changed`,
    }));
    expect(openLibrary(root, { appVersion: 'test', migrations })).toEqual({
      state: 'failed',
      details: { errorClass: 'ChecksumMismatch' },
    });
    expect(hash(libraryPaths(root).db)).toBe(before);
  });

  it('detects a newer migration history even when user_version is zero', () => {
    const root = newRoot();
    const opened = openLibrary(root, { appVersion: 'test' });
    if (opened.state !== 'ready') throw new Error('Expected a ready library');
    opened.db
      .prepare(
        'INSERT INTO schema_migration (id, checksum, applied_at, app_version) VALUES (?, ?, ?, ?)',
      )
      .run('0003', 'a'.repeat(64), 1, 'newer');
    opened.db.pragma('user_version = 0');
    opened.db.close();
    const path = libraryPaths(root).db;
    const before = hash(path);
    expect(probeDatabase(path, planMigrations(shippedMigrations)).newer).toBe(true);
    expect(openLibrary(root, { appVersion: 'test' }).state).toBe('refused-newer');
    expect(hash(path)).toBe(before);
  });

  it('reads the current schema version from WAL before it is checkpointed', () => {
    const root = newRoot();
    const db = new Database(libraryPaths(root).db);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('wal_autocheckpoint = 0');
      db.pragma('user_version = 99');
      const path = libraryPaths(root).db;
      expect(readFileSync(path).readUInt32BE(60)).toBe(0);
      expect(probeDatabase(path, planMigrations(shippedMigrations))).toMatchObject({
        userVersion: 99,
        newer: true,
      });
    } finally {
      db.close();
    }
  });

  it('does not claim a recovery backup when a fresh installation fails its first migration', () => {
    const result = openLibrary(newRoot(), {
      appVersion: 'test',
      migrations: [{ id: '0001', sql: 'THIS IS NOT VALID SQL;' }],
    });
    if ('db' in result) result.db.close();
    expect(result).toEqual({ state: 'failed', details: { errorClass: 'MigrationFailed' } });
  });
});
