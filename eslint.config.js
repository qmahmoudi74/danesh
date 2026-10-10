import tseslint from 'typescript-eslint';
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist*/**',
      '**/.features-gen/**',
      'test-results/**',
      'playwright-report/**',
      '.claude/**',
      'third_party/**',
      'evidence-tmp/**',
    ],
  },
  // Biome owns general rules; retain the parser/plugin and rules that require TypeScript's type graph.
  ...tseslint.configs.recommendedTypeCheckedOnly
    .filter((config) => config.name !== 'typescript-eslint/eslint-recommended')
    .map((config) => ({
      ...config,
      files: ['**/*.ts', '**/*.tsx'],
    })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // Biome handles @ts-ignore; keep the stronger policy for whole-file suppression and expect-error reasons.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': false,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          'ts-check': false,
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
    },
  },
  { files: ['packages/egress/**'], rules: { 'no-restricted-globals': 'off' } },
  // D-17 / Plan 01-09: the probe fetcher is a build-time developer and CI tool, never shipped; app code keeps the ban.
  {
    files: ['tools/fetch-probes.ts'],
    rules: { 'no-restricted-globals': ['error', 'XMLHttpRequest', 'WebSocket', 'EventSource'] },
  },
  {
    files: ['apps/renderer/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Render untrusted content as text nodes.',
        },
      ],
    },
  },
];
