import { createHash } from 'node:crypto';
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseSmokeArgs } from '../../apps/main/src/smoke-mode.ts';

export type ManifestEntry = { rel: string; size: number; sha256: string };
export type Manifest = { entries: ManifestEntry[]; maxRelUtf16: number };
export type FuseState = boolean | 'removed' | 'missing';

/** Windows path limits count UTF-16 code units; JavaScript strings are UTF-16, so this is the honest measure. */
export function utf16Length(value: string): number {
  return value.length;
}

export function buildManifest(root: string): Manifest {
  const entries: ManifestEntry[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile())
        entries.push({
          rel: relative(root, path).split(sep).join('/'),
          size: statSync(path).size,
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        });
    }
  };
  walk(root);
  entries.sort((a, b) => a.rel.localeCompare(b.rel, 'en'));
  return { entries, maxRelUtf16: Math.max(0, ...entries.map((entry) => utf16Length(entry.rel))) };
}

export function diffManifest(
  expected: ManifestEntry[],
  actual: ManifestEntry[],
): { missing: string[]; extra: string[]; changed: string[]; ok: boolean } {
  const want = new Map(expected.map((entry) => [entry.rel, entry]));
  const have = new Map(actual.map((entry) => [entry.rel, entry]));
  const missing = [...want.keys()].filter((rel) => !have.has(rel));
  const extra = [...have.keys()].filter((rel) => !want.has(rel));
  const changed = [...want.values()]
    .filter((entry) => {
      const other = have.get(entry.rel);
      return !!other && (other.sha256 !== entry.sha256 || other.size !== entry.size);
    })
    .map((entry) => entry.rel);
  return { missing, extra, changed, ok: !missing.length && !extra.length && !changed.length };
}

/** D-09 production fuse set (ADR 0003); the test build differs only in EnableNodeCliInspectArguments. */
export const PRODUCTION_FUSES: Record<string, boolean> = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  GrantFileProtocolExtraPrivileges: false,
};
export function compareFuseWire(
  actual: Record<string, FuseState>,
  expected: Record<string, boolean> = PRODUCTION_FUSES,
): string[] {
  return Object.keys(expected).filter((name) => actual[name] !== expected[name]);
}

/** Longest installed path under the default per-user NSIS location for a given (long, Persian) user name. */
export function defaultInstallPathLength(userName: string, rel: string): number {
  return utf16Length(
    `C:\\Users\\${userName}\\AppData\\Local\\Programs\\Danesh\\resources\\${rel.split('/').join('\\')}`,
  );
}
export const MAX_PATH = 260;
export const LONG_PERSIAN_USER = 'محمدرضا امیرحسینی فرزانه‌پور اصفهانی‌نژاد'
  .slice(0, 40)
  .padEnd(40, 'ی');

/** Same rule Main applies to --smoke-out (one implementation, imported). */
export function isSafeSmokeOut(path: string, forbiddenRoots: string[]): boolean {
  const parsed = parseSmokeArgs(['--smoke-test', `--smoke-out=${path}`], forbiddenRoots);
  return !!parsed && !('error' in parsed);
}

/** Reads an asar archive's JSON header (format: 4-byte length, pickled header size, string size, JSON length, JSON). */
export function readAsarTopLevel(asarPath: string): string[] {
  const file = openSync(asarPath, 'r');
  try {
    const prefix = Buffer.alloc(16);
    readSync(file, prefix, 0, 16, 0);
    const json = Buffer.alloc(prefix.readUInt32LE(12));
    readSync(file, json, 0, json.length, 16);
    return Object.keys(
      (JSON.parse(json.toString('utf8')) as { files: Record<string, unknown> }).files,
    ).sort();
  } finally {
    closeSync(file);
  }
}
/** The packaged app may contain only the built output, its manifest and production node_modules. */
export const ASAR_ALLOWED_TOP_LEVEL = ['node_modules', 'out', 'package.json'];
export function unexpectedAsarEntries(topLevel: string[]): string[] {
  return topLevel.filter((name) => !ASAR_ALLOWED_TOP_LEVEL.includes(name));
}
