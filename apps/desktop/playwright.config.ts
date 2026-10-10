import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

export default defineConfig({
  testDir: defineBddConfig({
    featuresRoot: resolve(import.meta.dirname, '../../features/ui'),
    features: '../../features/ui/**/*.feature',
    steps: '../../features/steps/*.ts',
    missingSteps: 'skip-scenario',
    outputDir: '.features-gen',
  }),
  // A real System check now includes the engine probes and a 6 s responsiveness window (Plan 01-09).
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  outputDir: '../../test-results',
});
