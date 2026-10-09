import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: defineBddConfig({ featuresRoot: resolve(import.meta.dirname, '../../features/ui'), features: '../../features/ui/**/*.feature', steps: '../../features/steps/*.ts', missingSteps: 'skip-scenario', outputDir: '.features-gen' }),
  timeout: 45000, workers: 1, fullyParallel: false, reporter: 'list',
  outputDir: '../../test-results',
});
