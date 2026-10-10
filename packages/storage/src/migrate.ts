import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

/**
 * Forward-only migrations (D-14). Plain Node: no bundler features, so test fixtures can import this directly.
 * Format: `schema_migration(id, checksum, applied_at, app_version)` plus `PRAGMA user_version` = highest applied number.
 */
export type MigrationFile = { id: string; sql: string };
export type PlannedMigration = MigrationFile & { number: number; checksum: string };

export class MigrationSetError extends Error {
  override readonly name = 'MigrationSetError';
}
export class ChecksumMismatchError extends Error {
  override readonly name = 'ChecksumMismatch';
  readonly migrationIds: string[];
  constructor(migrationIds: string[]) {
    super(`Applied migration changed: ${migrationIds.join(', ')}`);
    this.migrationIds = migrationIds;
  }
}
export class MigrationFailedError extends Error {
  override readonly name = 'MigrationFailed';
  readonly migrationId: string;
  constructor(migrationId: string, cause: unknown) {
    super(`Migration ${migrationId} failed`, { cause });
    this.migrationId = migrationId;
  }
}

/** SHA-256 of the SQL with line endings normalized to LF, so a Windows checkout cannot cause a false mismatch. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** Validates ids (four digits, unique, contiguous from 0001) and returns the migrations in ascending order. */
export function planMigrations(files: MigrationFile[]): PlannedMigration[] {
  const planned = files.map((file) => {
    if (!/^\d{4}$/.test(file.id)) throw new MigrationSetError(`Invalid migration id: ${file.id}`);
    return { ...file, number: Number(file.id), checksum: checksumOf(file.sql) };
  });
  planned.sort((a, b) => a.number - b.number);
  planned.forEach((migration, index) => {
    if (index > 0 && migration.number === planned[index - 1]!.number) {
      throw new MigrationSetError(`Two migration files share the number ${migration.id}`);
    }
    if (migration.number !== index + 1) {
      throw new MigrationSetError(`Gap in migration numbering before ${migration.id}`);
    }
  });
  return planned;
}

export type Probe = {
  exists: boolean;
  userVersion: number;
  appliedIds: string[];
  checksumMismatches: string[];
  /** Written by a newer Danesh: this build must not open it read-write. */
  newer: boolean;
};

/** Reads a database without any possibility of writing to it (read-only handle, file must exist). */
export function probeDatabase(path: string, plan: PlannedMigration[]): Probe {
  if (!existsSync(path))
    return { exists: false, userVersion: 0, appliedIds: [], checksumMismatches: [], newer: false };
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const userVersion = Number(db.pragma('user_version', { simple: true }));
    let applied: { id: string; checksum: string }[] = [];
    const hasHistory = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'")
      .get();
    if (hasHistory) {
      applied = db
        .prepare<[], { id: string; checksum: string }>(
          'SELECT id, checksum FROM schema_migration ORDER BY id',
        )
        .all();
    }
    const latest = plan.at(-1)?.number ?? 0;
    const byId = new Map(plan.map((migration) => [migration.id, migration]));
    return {
      exists: true,
      userVersion,
      appliedIds: applied.map((row) => row.id),
      checksumMismatches: applied
        .filter((row) => byId.has(row.id) && byId.get(row.id)!.checksum !== row.checksum)
        .map((row) => row.id),
      newer: userVersion > latest || applied.some((row) => Number(row.id) > latest),
    };
  } finally {
    db.close();
  }
}

/**
 * Applies pending migrations in ascending order, each in its own transaction followed by a foreign-key check.
 * `beforeFirstPending` runs once, before the first pending migration, and only when the library already has data.
 */
export function runMigrations(
  db: Database.Database,
  plan: PlannedMigration[],
  {
    appVersion,
    beforeFirstPending,
    existingDatabase,
  }: { appVersion: string; beforeFirstPending?: () => void; existingDatabase?: boolean },
): string[] {
  const userVersion = Number(db.pragma('user_version', { simple: true }));
  const pending = plan.filter((migration) => migration.number > userVersion);
  if (userVersion > 0) {
    const stored = db.prepare('SELECT id, checksum FROM schema_migration').all() as {
      id: string;
      checksum: string;
    }[];
    const known = new Map(plan.map((migration) => [migration.id, migration.checksum]));
    const mismatched = stored.filter(
      (row) => known.has(row.id) && known.get(row.id) !== row.checksum,
    );
    if (mismatched.length) throw new ChecksumMismatchError(mismatched.map((row) => row.id));
  }
  if (!pending.length) return [];
  if (existingDatabase ?? userVersion > 0) beforeFirstPending?.();
  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migration (id, checksum, applied_at, app_version) VALUES (?, ?, ?, ?)',
      ).run(migration.id, migration.checksum, Date.now(), appVersion);
      db.pragma(`user_version = ${migration.number}`);
      if ((db.pragma('foreign_key_check') as unknown[]).length)
        throw new Error('foreign_key_check reported violations');
      db.exec('COMMIT');
    } catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw new MigrationFailedError(migration.id, error);
    }
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  return pending.map((migration) => migration.id);
}
