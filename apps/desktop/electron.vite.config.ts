import { resolve } from 'node:path';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { daneshAliases } from '../../aliases.ts';

export default defineConfig(({ mode }) => {
  const alias = daneshAliases(resolve(import.meta.dirname, '../..'));
  const define = { __TEST_HOOKS__: JSON.stringify(mode === 'test') };
  const onwarn: import('rollup').WarningHandlerWithDefault = (warning, warn) => {
    if (
      warning.id?.replaceAll('\\', '/').includes('/node_modules/zod/') &&
      warning.message.includes('@__PURE__')
    )
      return;
    warn(warning);
  };
  return {
    main: {
      resolve: { alias },
      define,
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(import.meta.dirname, '../main/src/index.ts'),
            core: resolve(import.meta.dirname, '../core/src/index.ts'),
            'engine-sample': resolve(
              import.meta.dirname,
              '../../packages/engine-api/src/sample-host.ts',
            ),
            'engine-llm': resolve(
              import.meta.dirname,
              '../../packages/engines/llm-probe/src/host.ts',
            ),
            'engine-ocr': resolve(
              import.meta.dirname,
              '../../packages/engines/ocr-probe/src/host.ts',
            ),
            'engine-tts': resolve(
              import.meta.dirname,
              '../../packages/engines/tts-probe/src/host.ts',
            ),
          },
          output: { format: 'es' },
          onwarn,
        },
      },
    },
    preload: {
      resolve: { alias },
      define,
      build: {
        rollupOptions: {
          input: { index: resolve(import.meta.dirname, '../preload/src/index.ts') },
          output: { format: 'cjs', entryFileNames: '[name].cjs' },
          onwarn,
        },
      },
    },
    renderer: {
      root: resolve(import.meta.dirname, '../renderer'),
      resolve: { alias },
      define,
      plugins: [react(), tailwind()],
      build: {
        rollupOptions: { input: resolve(import.meta.dirname, '../renderer/index.html'), onwarn },
      },
    },
  };
});
