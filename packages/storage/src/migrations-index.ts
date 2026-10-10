import type { MigrationFile } from './migrate.ts';

/** The shipped migrations, bundled as text. Bundler-only: plain-Node callers pass their own list to planMigrations. */
const modules = import.meta.glob<string>('../migrations/*.sql', {
  query: '?raw',
  eager: true,
  import: 'default',
});

const MIGRATION_NUMBER = /(\d{4})_[^/\\]+\.sql$/;

export const shippedMigrations: MigrationFile[] = Object.entries(modules).map(([path, sql]) => ({
  id: MIGRATION_NUMBER.exec(path)?.[1] ?? '',
  sql,
}));
