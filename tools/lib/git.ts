import { execFileSync } from 'node:child_process';
const fullHistory = new Set<string>();
export function assertFullHistory(root: string): void {
  if (fullHistory.has(root)) return;
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true') throw new Error('Full git history required; configure CI fetch-depth: 0');
  fullHistory.add(root);
}
function git(root: string, args: string[]): string {
  assertFullHistory(root);
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function firstAddCommit(path: string, root = process.cwd()): string | undefined {
  return git(root, ['log', '--diff-filter=A', '--format=%H', '--', path]).split(/\r?\n/).filter(Boolean).at(-1);
}
export function lastCommitTouching(path: string, root = process.cwd()): string | undefined {
  return git(root, ['log', '-1', '--format=%H', '--', path]) || undefined;
}
export function isStrictAncestor(a: string, b: string, root = process.cwd()): boolean {
  if (!/^[a-f0-9]{7,40}$/i.test(a) || !/^[a-f0-9]{7,40}$/i.test(b)) return false;
  try {
    const left = git(root, ['rev-parse', '--verify', `${a}^{commit}`]);
    const right = git(root, ['rev-parse', '--verify', `${b}^{commit}`]);
    if (left === right) return false;
    git(root, ['merge-base', '--is-ancestor', left, right]); return true;
  } catch { return false; }
}
export function fileAtCommit(sha: string, path: string, root = process.cwd()): string {
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new Error('Invalid commit SHA');
  return git(root, ['show', `${sha}:${path.replaceAll('\\', '/')}`]);
}
