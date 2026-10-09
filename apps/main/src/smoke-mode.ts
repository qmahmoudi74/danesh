import { existsSync, lstatSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';

export type SmokeArgs = { outPath: string } | { error: string };
export const SMOKE_TIMEOUT_MS = 300_000;
/** Exit codes of the headless smoke mode (D-07): pass, fail, no result in time, refused arguments. */
export const SMOKE_EXIT = { pass: 0, fail: 1, timeout: 2, invalidArguments: 3 } as const;

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * `--smoke-test --smoke-out=<file>` runs the normal System check headlessly and exports its report through a
 * Main-issued token. The output must be an absolute .json path whose parent exists, that is not a symlink and that is
 * not inside the installed app (so the smoke run can never write into its own resources).
 */
export function parseSmokeArgs(argv: string[], forbiddenRoots: string[]): SmokeArgs | null {
  if (!argv.includes('--smoke-test')) return null;
  const raw = argv.find((arg) => arg.startsWith('--smoke-out='))?.slice('--smoke-out='.length);
  if (!raw) return { error: 'missing --smoke-out=<absolute path to a .json file>' };
  if (!isAbsolute(raw) || extname(raw).toLowerCase() !== '.json') return { error: '--smoke-out must be an absolute path ending in .json' };
  const outPath = resolve(raw);
  const parent = dirname(outPath);
  try {
    if (!existsSync(parent) || !lstatSync(parent).isDirectory()) return { error: '--smoke-out parent directory does not exist' };
    if (lstatSync(parent).isSymbolicLink() || (existsSync(outPath) && lstatSync(outPath).isSymbolicLink())) return { error: '--smoke-out must not be a symbolic link' };
  } catch { return { error: '--smoke-out is not accessible' }; }
  if (forbiddenRoots.some((root) => root && inside(root, outPath))) return { error: '--smoke-out must be outside the application directory' };
  return { outPath };
}
