import { join } from 'node:path';
import { runProbeCheck } from './engine-probe.ts';
import type { Check } from './registry.ts';

export const check: Check = {
  id: 'engine-tts',
  group: 'engines',
  run({ init, engines }) {
    const modelPath = join(init.probesDir, 'tts', 'fa_IR-mana-medium.onnx');
    const configPath = `${modelPath}.json`;
    return runProbeCheck(
      'engine-tts',
      'tts',
      engines,
      [modelPath, configPath],
      { type: 'tts-probe', modelPath, configPath },
      (output) => {
        const sampleCount = Number(output.sampleCount);
        const peak = Number(output.peak);
        return {
          pass: sampleCount >= 4000 && output.allFinite === true && peak > 0,
          detail: `synthesized ${sampleCount} samples`,
          outputSha256: String(output.outputSha256),
          fields: {
            runtime: 'onnxruntime-node 1.30.0 (CPU, no espeak-ng)',
            sampleCount,
            peak,
            loadedFrom: String(output.loadedFrom),
            durationMs: Number(output.durationMs),
          },
        };
      },
    );
  },
};
