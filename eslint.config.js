import tseslint from 'typescript-eslint';
export default [
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist*/**', '**/.features-gen/**', 'test-results/**', 'playwright-report/**', '.claude/**', 'third_party/**', 'evidence-tmp/**'] },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: ['**/*.ts', '**/*.tsx'] })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
    },
  },
  { files: ['packages/egress/**'], rules: { 'no-restricted-globals': 'off' } },
  { files: ['apps/renderer/**/*.tsx'], rules: { 'no-restricted-syntax': ['error', { selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: 'Render untrusted content as text nodes.' }] } },
];
