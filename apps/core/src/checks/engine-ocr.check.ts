import { join } from 'node:path';
import { runProbeCheck } from './engine-probe.ts';
import type { Check } from './registry.ts';

/** Expected first word of the pinned sample image (tools/probes.lock.json, entry ocr-sample). */
const EXPECTED_FIRST_WORD = 'This';

export const check: Check = {
  id: 'engine-ocr',
  group: 'engines',
  run({ init, engines }) {
    const langDir = join(init.probesDir, 'ocr');
    const imagePath = join(langDir, 'testocr.png');
    return runProbeCheck(
      'engine-ocr',
      'ocr',
      engines,
      [join(langDir, 'eng.traineddata'), imagePath],
      { type: 'ocr-probe', langDir, imagePath, expectedFirstWord: EXPECTED_FIRST_WORD },
      (output) => ({
        pass: output.matches === true,
        detail: `first word ${output.matches === true ? 'matches' : 'does not match'} the sample`,
        outputSha256: String(output.outputSha256),
        fields: {
          runtime: 'tesseract.js 7.0.0 (offline)',
          firstWord: String(output.firstWord).slice(0, 64),
          expectedFirstWord: EXPECTED_FIRST_WORD,
          confidence: Number(output.confidence),
          durationMs: Number(output.durationMs),
        },
      }),
    );
  },
};
