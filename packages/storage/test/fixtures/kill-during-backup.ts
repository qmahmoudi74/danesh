// Plain-Node fixture: runs a verified backup of a large library so the test can SIGKILL it part-way.
// Usage: node kill-during-backup.ts <libraryRoot>
import Database from 'better-sqlite3';
import { createVerifiedBackup } from '../../src/backup.ts';
import { libraryPaths } from '../../src/library.ts';

const root = process.argv[2];
if (!root) throw new Error('library root required');
const paths = libraryPaths(root);
const db = new Database(paths.db);
process.stdout.write('started\n');
createVerifiedBackup(db, paths, 1);
process.stdout.write('finished\n');
