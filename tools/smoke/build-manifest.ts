// Writes <dist>/build-manifest.json for the packaged resources/ tree (Plan 01-08): path, size and SHA-256 per file.
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildManifest } from './smoke-lib.ts';

export function packagedResources(dist: string): string {
  const candidates = [
    join(dist, 'win-unpacked', 'resources'),
    join(dist, 'mac-arm64', 'Danesh.app', 'Contents', 'Resources'),
    join(dist, 'mac-arm64', 'DaneshTest.app', 'Contents', 'Resources'),
    join(dist, 'linux-unpacked', 'resources'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`No packaged resources directory under ${dist}`);
  return found;
}

if (import.meta.main) {
  const index = process.argv.indexOf('--dist');
  const dist = resolve(
    index > 0 && process.argv[index + 1] ? process.argv[index + 1]! : 'apps/desktop/dist',
  );
  const manifest = buildManifest(packagedResources(dist));
  writeFileSync(join(dist, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `build-manifest: entries=${manifest.entries.length} maxRelUtf16=${manifest.maxRelUtf16}`,
  );
}
