import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export function testRepository() {
  const root = mkdtempSync(join(tmpdir(), 'danesh-gate-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Danesh gate test');
  git('config', 'user.email', 'gate@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  return {
    root,
    git,
    write(path: string, text: string) {
      const file = resolve(root, path);
      if (!file.startsWith(root + '\\') && !file.startsWith(root + '/'))
        throw new Error('Test path outside owned repo');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    commit(message = 'fixture') {
      git('add', '--all');
      git('commit', '-m', message);
      return git('rev-parse', 'HEAD');
    },
    cleanup() {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('danesh-gate-')
      )
        throw new Error('Unsafe test cleanup');
      rmSync(root, { recursive: true, force: true });
    },
  };
}
