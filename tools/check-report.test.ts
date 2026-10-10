import { afterEach, expect, it, vi } from 'vitest';
import { validateReport } from './check-report.ts';
import { testRepository } from './lib/test-repo.ts';

// Each test builds a real git repository and runs git several times; process start-up on a hosted Windows
// runner can exceed the 5 s default although every assertion holds.
vi.setConfig({ testTimeout: 30_000 });

const repos: ReturnType<typeof testRepository>[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});
const ids = ['PLAT-02', 'PLAT-04', 'REL-01', 'REL-02'];
const header = '| Req | Status | Evidence | What was NOT shown |\n| --- | --- | --- | --- |\n';
const blocked = (id: string) => `| ${id} | blocked | | Not run |`;
function setup() {
  const repo = testRepository();
  repos.push(repo);
  repo.write('evidence/actual.txt', 'COMMAND: fixture\nEXIT: 0\n');
  return repo;
}
function report(
  rows = ids.map(blocked),
  counts = 'Counts: verified 0, partially verified 0, blocked 4',
) {
  return header + rows.join('\n') + '\n' + counts;
}
it('accepts an honest blocked report', () => {
  expect(validateReport(setup().root, report(), ids)).toEqual([]);
});
it('rejects a missing phase requirement', () => {
  expect(
    validateReport(
      setup().root,
      report(ids.filter((id) => id !== 'PLAT-04').map(blocked)),
      ids,
    ).join(),
  ).toContain('PLAT-04');
});
it('rejects duplicate requirement rows', () => {
  expect(
    validateReport(setup().root, report([...ids.map(blocked), blocked('PLAT-02')]), ids).join(),
  ).toContain('duplicate');
});
it('rejects rows out of source requirement order', () => {
  expect(
    validateReport(setup().root, report([...ids].reverse().map(blocked)), ids).join(),
  ).toContain('order');
});
it('rejects an unknown status', () => {
  expect(
    validateReport(
      setup().root,
      report(ids.map(blocked).map((row) => row.replace('blocked', 'done'))),
      ids,
    ).join(),
  ).toContain('status');
});
it('rejects verified rows with no evidence or missing evidence', () => {
  const repo = setup();
  for (const evidence of ['', 'missing.txt'])
    expect(
      validateReport(
        repo.root,
        report(
          [`| PLAT-02 | verified | ${evidence} | |`, ...ids.slice(1).map(blocked)],
          'Counts: verified 1, partially verified 0, blocked 3',
        ),
        ids,
      ).length,
    ).toBeGreaterThan(0);
});
it('accepts an existing Persian evidence path with spaces', () => {
  const repo = setup();
  repo.write('شواهد آزمون/نتیجه.txt', 'EXIT: 0');
  expect(
    validateReport(
      repo.root,
      report(
        ['| PLAT-02 | verified | `شواهد آزمون/نتیجه.txt` | |', ...ids.slice(1).map(blocked)],
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ),
  ).toEqual([]);
});
it('rejects a verified REL-01 row supported only by CI config', () => {
  const repo = setup();
  repo.write('.github/workflows/ci.yml', 'name: fixture');
  expect(
    validateReport(
      repo.root,
      report(
        ids.map((id) =>
          id === 'REL-01' ? '| REL-01 | verified | .github/workflows/ci.yml | |' : blocked(id),
        ),
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ).join(),
  ).toContain('REL-01');
});
it('rejects unit-test-only installer evidence', () => {
  const repo = setup();
  repo.write('apps/main/test/installer.test.ts', 'export {};');
  expect(
    validateReport(
      repo.root,
      report(
        ids.map((id) =>
          id === 'REL-01'
            ? '| REL-01 | verified | apps/main/test/installer.test.ts | |'
            : blocked(id),
        ),
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ).join(),
  ).toContain('installer');
});
it('rejects REL-02 without Tier B evidence', () => {
  expect(
    validateReport(
      setup().root,
      report(
        ids.map((id) =>
          id === 'REL-02' ? '| REL-02 | verified | evidence/actual.txt | |' : blocked(id),
        ),
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ).join(),
  ).toContain('Tier B');
});
it.each(['Uncomputed 99%', 'An invented pass rate'])(
  'rejects fabricated aggregate text: %s',
  (text) => {
    expect(validateReport(setup().root, report() + '\n' + text, ids).join()).toContain('aggregate');
  },
);
it('rejects counts that differ from the table', () => {
  expect(
    validateReport(
      setup().root,
      report(undefined, 'Counts: verified 1, partially verified 0, blocked 3'),
      ids,
    ).join(),
  ).toContain('Counts');
});
it('requires an explanation for incomplete rows', () => {
  expect(
    validateReport(
      setup().root,
      report(ids.map((id) => `| ${id} | partially verified | evidence/actual.txt | |`)),
      ids,
    ).join(),
  ).toContain('not shown');
});
it('rejects an evidence path outside the repo', () => {
  expect(
    validateReport(
      setup().root,
      report(['| PLAT-02 | verified | ../outside.txt | |', ...ids.slice(1).map(blocked)]),
      ids,
    ).join(),
  ).toContain('outside');
});
it('rejects recorded failing verification on a verified row', () => {
  const repo = setup();
  repo.write('evidence/failed.txt', 'COMMAND: actual check\nEXIT: 1\n');
  expect(
    validateReport(
      repo.root,
      report(
        ['| PLAT-02 | verified | evidence/failed.txt | |', ...ids.slice(1).map(blocked)],
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ).join(),
  ).toContain('unsuccessful');
});
it('rejects an extra out-of-phase requirement', () => {
  expect(
    validateReport(setup().root, report([...ids.map(blocked), blocked('WEB-01')]), ids).join(),
  ).toContain('unexpected');
});
it('resolves multiple existing evidence paths', () => {
  const repo = setup();
  repo.write('evidence/second.txt', 'EXIT: 0');
  expect(
    validateReport(
      repo.root,
      report(
        [
          '| PLAT-02 | verified | evidence/actual.txt; evidence/second.txt | |',
          ...ids.slice(1).map(blocked),
        ],
        'Counts: verified 1, partially verified 0, blocked 3',
      ),
      ids,
    ),
  ).toEqual([]);
});
