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
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
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
