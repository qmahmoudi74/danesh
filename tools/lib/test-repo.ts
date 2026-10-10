import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export function testRepository() {
  const root = mkdtempSync(join(tmpdir(), 'danesh-gate-'));
  // Identity and signing come from the environment, so a fixture repository costs one process to create
  // (process start-up dominates on hosted Windows runners).
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Danesh gate test',
    GIT_AUTHOR_EMAIL: 'gate@example.invalid',
    GIT_COMMITTER_NAME: 'Danesh gate test',
    GIT_COMMITTER_EMAIL: 'gate@example.invalid',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'commit.gpgsign',
    GIT_CONFIG_VALUE_0: 'false',
  };
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
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
