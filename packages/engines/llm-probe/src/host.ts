import { loadedLibraries, startHost } from '@danesh/engine-api/host-runtime.ts';
import { runLlmProbe } from './probe.ts';

startHost({
  kind: 'llm',
  entryUrl: import.meta.url,
  handlers: {
    'llm-probe': async (input: { modelPath: string }) => ({
      ...(await runLlmProbe(input)),
      nativeLibraries: loadedLibraries(/llama|ggml/i),
    }),
  },
});
