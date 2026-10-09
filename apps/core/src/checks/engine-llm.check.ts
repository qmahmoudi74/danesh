import { join } from 'node:path';
import type { Check } from './registry.ts';
import { runProbeCheck } from './engine-probe.ts';

export const check: Check = {
  id: 'engine-llm',
  group: 'engines',
  run({ init, engines }) {
    const modelPath = join(init.probesDir, 'llm', 'stories15M-q4_0.gguf');
    return runProbeCheck('engine-llm', 'llm', engines, [modelPath], { type: 'llm-probe', modelPath }, (output) => {
      const tokenCount = Number(output.tokenCount);
      return { pass: tokenCount >= 8, detail: `generated ${tokenCount} tokens at temperature 0`, outputSha256: String(output.outputSha256), fields: { runtime: 'node-llama-cpp 3.22.1 (CPU)', tokenCount, loadMs: Number(output.loadMs), generateMs: Number(output.generateMs) } };
    });
  },
};
