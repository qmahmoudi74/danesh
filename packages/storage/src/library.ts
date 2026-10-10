import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** The on-disk layout of a library folder. Paths keep their full Unicode spelling (D-13). */
export function libraryPaths(root: string) {
  return {
    root,
    db: join(root, 'danesh.db'),
    /** Reserved for the rebuildable search index; never backed up. */
    indexDb: join(root, 'index.db'),
    blobs: join(root, 'blobs'),
    backups: join(root, 'backups'),
    tmp: join(root, 'tmp'),
    logs: join(root, 'logs'),
    models: join(root, 'models'),
  };
}
export type LibraryPaths = ReturnType<typeof libraryPaths>;

export function ensureLibraryDirs(paths: LibraryPaths): void {
  for (const dir of [paths.root, paths.blobs, paths.backups, paths.tmp, paths.logs, paths.models]) {
    mkdirSync(dir, { recursive: true });
  }
}
