import type { AppStatus } from '@danesh/contracts/rpc.ts';
import { type Db, type LibraryOpen, openLibrary } from '@danesh/storage/db.ts';
import { shippedMigrations } from '@danesh/storage/migrations-index.ts';
import { RpcHandlerError } from './rpc-server.ts';

/** Opens the library: migrate if needed, refuse a newer database, or fall back to read-only recovery. */
export function bootLibrary(root: string, appVersion: string): LibraryOpen {
  let migrations = shippedMigrations;
  if (__TEST_HOOKS__ && process.env.DANESH_TEST_FAIL_MIGRATION === '1') {
    // Test builds can append a migration that fails, to exercise read-only recovery.
    const id = String(migrations.length + 1).padStart(4, '0');
    migrations = [...migrations, { id, sql: 'THIS IS NOT VALID SQL;' }];
  }
  return openLibrary(root, { appVersion, migrations });
}

export function libraryStatus(library: LibraryOpen | undefined): AppStatus {
  if (!library) return { state: 'starting', details: {} };
  return { state: library.state, details: 'details' in library ? library.details : {} };
}

/** The single write guard: every request that writes goes through it and is refused with READ_ONLY otherwise. */
export function requireWritable(library: LibraryOpen | undefined): Db {
  if (library?.state !== 'ready') throw new RpcHandlerError('READ_ONLY');
  return library.db;
}
