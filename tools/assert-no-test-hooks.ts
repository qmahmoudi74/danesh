// Fails when test-only hooks reach a production bundle (Plan 01-08 prohibition). With --expect-present it is the
// positive control against the test build, proving the scanner actually finds what it looks for.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const HOOK_MARKERS = [
  'DANESH_TEST_HOOKS_SENTINEL',
  'test.engineEcho',
  'test.coreStall',
  'test.raw',
];

function files(root: string): string[] {
  return statSync(root).isDirectory()
    ? readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)],
      )
    : [root];
}
export function findHookMarkers(paths: string[]): { file: string; marker: string }[] {
  return paths
    .flatMap((path) => files(path))
    .flatMap((file) => {
      const bytes = readFileSync(file);
      return HOOK_MARKERS.filter((marker) => bytes.includes(Buffer.from(marker, 'utf8'))).map(
        (marker) => ({ file, marker }),
      );
    });
}

if (import.meta.main) {
  const value = (flag: string) => {
    const index = process.argv.indexOf(flag);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const targets = [value('--out'), value('--asar')]
    .filter((path): path is string => !!path)
    .map((path) => resolve(path));
  if (!targets.length) {
    console.error('usage: assert-no-test-hooks --out <dir> [--asar <file>] [--expect-present]');
    process.exit(2);
  }
  const found = findHookMarkers(targets);
  const expectPresent = process.argv.includes('--expect-present');
  for (const hit of found)
    console.log(`${expectPresent ? 'FOUND' : 'FAIL'} ${hit.marker} in ${hit.file}`);
  const ok = expectPresent
    ? found.some((hit) => hit.marker === 'DANESH_TEST_HOOKS_SENTINEL')
    : found.length === 0;
  console.log(
    `assert-no-test-hooks: ${expectPresent ? 'expect-present' : 'expect-absent'} markers=${found.length} ${ok ? 'ok' : 'failed'}`,
  );
  process.exitCode = ok ? 0 : 1;
}
