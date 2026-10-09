import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createWorker } from 'tesseract.js';

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const current = row[j]!; row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = current; }
  }
  return row[b.length]!;
}

/** Packaging probe (D-23): tesseract.js fully offline. The image is passed as bytes so Unicode install paths are safe (D-13). */
export async function runOcrProbe({ langDir, imagePath, expectedFirstWord }: { langDir: string; imagePath: string; expectedFirstWord: string }): Promise<{ firstWord: string; matches: boolean; confidence: number; outputSha256: string; durationMs: number }> {
  const started = performance.now();
  const worker = await createWorker('eng', 1, { langPath: langDir, gzip: false, cacheMethod: 'none' });
  try {
    const { data } = await worker.recognize(await readFile(imagePath));
    const firstWord = data.text.trim().split(/\s+/)[0] ?? '';
    return { firstWord, matches: editDistance(firstWord.toLowerCase(), expectedFirstWord.toLowerCase()) <= 1, confidence: Math.round(data.confidence), outputSha256: createHash('sha256').update(data.text, 'utf8').digest('hex'), durationMs: Math.round(performance.now() - started) };
  } finally { await worker.terminate(); }
}
