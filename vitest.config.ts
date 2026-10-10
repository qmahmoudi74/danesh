import { defineConfig } from 'vitest/config';
import { daneshAliases } from './aliases.ts';

const dirs: Record<string, string> = {
  contracts: 'packages/contracts',
  domain: 'packages/domain',
  storage: 'packages/storage',
  egress: 'packages/egress',
  'engine-api': 'packages/engine-api',
  engines: 'packages/engines',
  logging: 'packages/logging',
  core: 'apps/core',
  main: 'apps/main',
  renderer: 'apps/renderer',
  tools: 'tools',
};
export default defineConfig({
  test: {
    projects: Object.entries(dirs).map(([name, dir]) => ({
      resolve: { alias: daneshAliases(import.meta.dirname) },
      define: { __TEST_HOOKS__: true },
      test: {
        name,
        environment: 'node',
        include: [name === 'tools' ? 'tools/**/*.test.ts' : `${dir}/test/**/*.test.ts`],
      },
    })),
  },
});
