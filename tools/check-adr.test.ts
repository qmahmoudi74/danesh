import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { checkAdrs } from './check-adr.ts';
import { testRepository } from './lib/test-repo.ts';

// Each test builds a real git repository and runs git several times; process start-up on a hosted Windows
// runner can exceed the 5 s default although every assertion holds.
vi.setConfig({ testTimeout: 30_000 });

const repos: ReturnType<typeof testRepository>[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});
const template = readFileSync('docs/adr/0000-template.md', 'utf8');
function adr(status = 'proposed', kind = 'architecture', spike = false) {
  return template
    .replace('date: YYYY-MM-DD', 'date: 2026-10-10')
    .replace('status: proposed', `status: ${status}`)
    .replace('kind: architecture', `kind: ${kind}`)
    .replace('# Optional: spike: S-PACKAGE', spike ? 'spike: S-PACKAGE' : '# no spike');
}
function setup() {
  const repo = testRepository();
  repos.push(repo);
  repo.write('docs/adr/0000-template.md', template);
  return repo;
}
it('accepts proposed ADRs with empty results', () => {
  const repo = setup();
  repo.write('docs/adr/0001-first.md', adr());
  repo.commit();
  expect(checkAdrs(repo.root)).toEqual([]);
});
it('rejects duplicate ADR numbers', () => {
  const repo = setup();
  repo.write('docs/adr/0001-first.md', adr());
  repo.write('docs/adr/0001-second.md', adr());
  repo.commit();
  expect(checkAdrs(repo.root).join()).toContain('duplicate');
});
it('rejects a numbering gap', () => {
  const repo = setup();
  repo.write('docs/adr/0001-first.md', adr());
  repo.write('docs/adr/0003-third.md', adr());
  repo.commit();
  expect(checkAdrs(repo.root).join()).toContain('sequence');
});
it('rejects accepted spike ADRs with no actual platform rows', () => {
  const repo = setup();
  repo.write('docs/adr/0001-first.md', adr('accepted', 'architecture', true));
  repo.commit();
  expect(checkAdrs(repo.root).join()).toContain('platform');
});
it('rejects accepting an engine without an accepted license ADR', () => {
  const repo = setup();
  repo.write('docs/adr/0001-first.md', adr('accepted', 'engine'));
  repo.commit();
  expect(checkAdrs(repo.root).join()).toContain('0004');
});
it('rejects invalid kinds and absent required sections', () => {
  const repo = setup();
  repo.write(
    'docs/adr/0001-first.md',
    adr('accepted', 'invented').replace('## Security', '## Other'),
  );
  repo.commit();
  const errors = checkAdrs(repo.root).join();
  expect(errors).toContain('kind');
  expect(errors).toContain('Security');
});
function governed() {
  const repo = setup();
  const path = 'docs/adr/0001-first.md';
  const policy = adr('proposed', 'architecture', true).replace(
    'Define numeric thresholds, exact target platforms and pass/fail rules before the spike runs.',
    'Pass only with zero data loss.',
  );
  repo.write(path, policy);
  const sha = repo.commit('policy');
  const result = policy
    .replace('status: proposed', 'status: accepted')
    .replace('Pass policy commit: <sha>', `Pass policy commit: ${sha}`)
    .replace(
      'For each actual run list OS name, OS version, architecture, date, evidence tier and existing evidence path; report missing platforms as not run and distinguish Tier A hosted runs from Tier B clean-machine verification.',
      '| OS | Version | Architecture |\n| --- | --- | --- |\n| Windows | 11 | x64 |',
    );
  repo.write(path, result);
  const resultSha = repo.commit('results');
  return { repo, path, result, sha, resultSha };
}
it('accepts a prior policy with identical text and a concrete platform row', () => {
  const { repo } = governed();
  expect(checkAdrs(repo.root)).toEqual([]);
});
it('rejects an equal policy/result commit', () => {
  const { repo, path, result, sha, resultSha } = governed();
  repo.write(path, result.replace(sha, resultSha));
  expect(checkAdrs(repo.root).join()).toContain('ancestor');
});
it('rejects a policy commit on another branch', () => {
  const { repo, path, result, sha } = governed();
  repo.git('checkout', '-b', 'other');
  repo.write('foreign', 'foreign');
  const foreign = repo.commit('foreign');
  repo.git('checkout', 'main');
  repo.write(path, result.replace(sha, foreign));
  expect(checkAdrs(repo.root).join()).toContain('ancestor');
});
it('rejects changes to an already committed pass policy', () => {
  const { repo, path, result } = governed();
  repo.write(path, result.replace('zero data loss', 'some data loss'));
  repo.commit('changed policy');
  expect(checkAdrs(repo.root).join()).toContain('policy text');
});
it('rejects an engine accepted before the license date', () => {
  const repo = setup();
  for (let n = 1; n <= 3; n++)
    repo.write(
      `docs/adr/000${n}-item.md`,
      adr(n === 1 ? 'accepted' : 'proposed', n === 1 ? 'engine' : 'architecture'),
    );
  repo.write(
    'docs/adr/0004-license.md',
    adr('accepted', 'license').replace('2026-10-10', '2026-10-11'),
  );
  repo.commit();
  expect(checkAdrs(repo.root).join()).toContain('date');
});
