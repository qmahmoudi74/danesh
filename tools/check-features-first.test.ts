import { afterEach, expect, it, vi } from 'vitest';
import { checkFeatures } from './check-features-first.ts';
import { testRepository } from './lib/test-repo.ts';

// Each test builds a real git repository and runs git several times; process start-up on a hosted Windows
// runner can exceed the 5 s default although every assertion holds.
vi.setConfig({ testTimeout: 30_000 });

const repos: ReturnType<typeof testRepository>[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});
const feature =
  '# covers: apps/main/src/example.ts\n@req-PLAT-01\nFeature: One capability\n' +
  ['happy', 'invalid', 'edge', 'recovery', 'cancellation', 'persistence']
    .map((kind) => `  @kind-${kind}\n  Scenario: ${kind}\n    Given a fixture\n`)
    .join('');
function setup(text = feature) {
  const repo = testRepository();
  repos.push(repo);
  repo.write('features/ui/example.feature', text);
  return repo;
}
it('rejects a feature with no scenarios', () => {
  const repo = setup('@req-PLAT-01\nFeature: Empty\n');
  repo.commit();
  expect(checkFeatures(repo.root, true).errors.join()).toContain('scenario');
});
it('rejects missing cancellation without a reason', () => {
  const repo = setup(feature.replace('@kind-cancellation', '@kind-other'));
  repo.commit();
  expect(checkFeatures(repo.root, true).errors.join()).toContain('kind-cancellation');
});
it('accepts an explicit justified not-applicable kind', () => {
  const repo = setup(
    feature.replace('@kind-cancellation', '@kind-other') +
      '# n/a kind-cancellation: No cancellable operation.\n',
  );
  repo.commit();
  expect(checkFeatures(repo.root, true).errors).toEqual([]);
});
it('rejects duplicate scenario names', () => {
  const repo = setup(feature.replace('Scenario: invalid', 'Scenario: happy'));
  repo.commit();
  expect(checkFeatures(repo.root, true).errors.join()).toContain('duplicate');
});
it('rejects missing requirement tags or multiple capabilities', () => {
  const repo = setup(feature.replace('@req-PLAT-01', '') + 'Feature: Another\n');
  repo.commit();
  expect(checkFeatures(repo.root, true).errors.length).toBeGreaterThan(0);
});
it('rejects steps and implementation added with the feature', () => {
  const repo = setup();
  repo.write('features/steps/example.steps.ts', 'export {};');
  repo.write('apps/main/src/example.ts', 'export {};');
  repo.commit();
  expect(checkFeatures(repo.root, true).errors.filter((x) => x.includes('before'))).toHaveLength(2);
});
it('rejects an implementation added before its feature', () => {
  const repo = testRepository();
  repos.push(repo);
  repo.write('apps/main/src/example.ts', 'export {};');
  repo.commit('implementation');
  repo.write('features/ui/example.feature', feature);
  repo.commit('feature');
  expect(checkFeatures(repo.root, true).errors.join()).toContain('before');
});
it('accepts features strictly before their steps and implementation', () => {
  const repo = setup();
  repo.commit('feature');
  repo.write('features/steps/example.steps.ts', 'export {};');
  repo.write('apps/main/src/example.ts', 'export {};');
  repo.commit('implementation');
  expect(checkFeatures(repo.root).errors).toEqual([]);
});
it('requires steps unless allow-unbound is explicit', () => {
  const repo = setup();
  repo.commit();
  expect(checkFeatures(repo.root).errors.join()).toContain('step');
  expect(checkFeatures(repo.root, true).errors).toEqual([]);
});
it('reports unimplemented covered paths as information', () => {
  const repo = setup();
  repo.commit();
  expect(checkFeatures(repo.root, true).info.join()).toContain('example.ts');
});
it('handles outlines as scenarios', () => {
  const repo = setup(feature.replace('Scenario: edge', 'Scenario Outline: edge'));
  repo.commit();
  expect(checkFeatures(repo.root, true).errors).toEqual([]);
});
