import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';

/** Fixed phoneme string; every symbol exists in the voice's phoneme_id_map, so no espeak-ng or G2P is involved. */
export const TTS_PHONEMES = 'salam donja';
export function phonemeIds(map: Record<string, number[]>, phonemes: string): number[] {
  const id = (symbol: string) => {
    const ids = map[symbol];
    if (!ids) throw new Error(`Phoneme not in voice map: ${symbol}`);
    return ids;
  };
  // Piper layout: BOS, pad, then each phoneme followed by pad, then EOS.
  return [
    ...id('^'),
    ...id('_'),
    ...[...phonemes].flatMap((symbol) => [...id(symbol), ...id('_')]),
    ...id('$'),
  ];
}

/** Packaging probe (D-23): ONNX Runtime runs the voice deterministically (noise 0); no quality claim is made. */
export async function runTtsProbe({
  modelPath,
  configPath,
}: {
  modelPath: string;
  configPath: string;
}): Promise<{
  sampleCount: number;
  peak: number;
  allFinite: boolean;
  outputSha256: string;
  loadedFrom: 'path' | 'buffer';
  durationMs: number;
}> {
  const started = performance.now();
  const config = JSON.parse(await readFile(configPath, 'utf8')) as {
    phoneme_id_map: Record<string, number[]>;
  };
  const ids = phonemeIds(config.phoneme_id_map, TTS_PHONEMES);
  let session: ort.InferenceSession;
  let loadedFrom: 'path' | 'buffer' = 'path';
  try {
    session = await ort.InferenceSession.create(modelPath);
  } catch {
    loadedFrom = 'buffer';
    session = await ort.InferenceSession.create(await readFile(modelPath));
  }
  try {
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([0, 1, 0]), [3]),
    };
    const output = (await session.run(feeds)).output!.data as Float32Array;
    let peak = 0;
    let allFinite = true;
    for (const sample of output) {
      if (!Number.isFinite(sample)) allFinite = false;
      else peak = Math.max(peak, Math.abs(sample));
    }
    return {
      sampleCount: output.length,
      peak: Math.round(peak * 1e6) / 1e6,
      allFinite,
      outputSha256: createHash('sha256')
        .update(Buffer.from(output.buffer, output.byteOffset, output.byteLength))
        .digest('hex'),
      loadedFrom,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    await session.release();
  }
}
