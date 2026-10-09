import { describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runLlmProbe } from '../llm-probe/src/probe.ts';
import { editDistance, runOcrProbe } from '../ocr-probe/src/probe.ts';
import { phonemeIds, runTtsProbe, TTS_PHONEMES } from '../tts-probe/src/probe.ts';

const probes = resolve('resources/probes');
const lock = JSON.parse(readFileSync(resolve('tools/probes.lock.json'), 'utf8')) as { entries: { target: string; expectedFirstWord?: string }[] };
const HEX64 = /^[0-9a-f]{64}$/;

// Probes run from a copy under a folder with Persian letters, a space and ZWNJ (D-13: full Unicode paths).
function persianCopy(): string {
  const missing = lock.entries.filter((entry) => !existsSync(join(probes, entry.target))).map((entry) => entry.target);
  if (missing.length) throw new Error(`Probe assets missing (${missing.join(', ')}): run pnpm probes:fetch`);
  const root = join(mkdtempSync(join(tmpdir(), 'danesh-probes-')), 'دانش آزمون', 'مدل‌ها');
  for (const entry of lock.entries) { mkdirSync(join(root, entry.target, '..'), { recursive: true }); copyFileSync(join(probes, entry.target), join(root, entry.target)); }
  return root;
}

describe('packaging probes from a Persian + space + ZWNJ folder', () => {
  const root = persianCopy();
  it('LLM: generates at least 8 tokens at temperature 0 with a full hash', async () => {
    const output = await runLlmProbe({ modelPath: join(root, 'llm', 'stories15M-q4_0.gguf') });
    expect(output.tokenCount).toBeGreaterThanOrEqual(8);
    expect(output.outputSha256).toMatch(HEX64);
    expect((await runLlmProbe({ modelPath: join(root, 'llm', 'stories15M-q4_0.gguf') })).outputSha256).toBe(output.outputSha256);
  }, 120_000);
  it('OCR: recognizes the pinned first word offline', async () => {
    const expected = lock.entries.find((entry) => entry.expectedFirstWord)!.expectedFirstWord!;
    const output = await runOcrProbe({ langDir: join(root, 'ocr'), imagePath: join(root, 'ocr', 'testocr.png'), expectedFirstWord: expected });
    expect(output.matches).toBe(true);
    expect(output.outputSha256).toMatch(HEX64);
  }, 120_000);
  it('TTS: synthesizes finite, non-silent audio from hand-fed phoneme ids', async () => {
    const output = await runTtsProbe({ modelPath: join(root, 'tts', 'fa_IR-mana-medium.onnx'), configPath: join(root, 'tts', 'fa_IR-mana-medium.onnx.json') });
    expect(output.sampleCount).toBeGreaterThanOrEqual(4000);
    expect(output.allFinite).toBe(true); expect(output.peak).toBeGreaterThan(0);
    expect(output.outputSha256).toMatch(HEX64);
  }, 120_000);
  it('cleans up', () => { rmSync(join(root, '..', '..'), { recursive: true, force: true }); });
});

describe('probe helpers', () => {
  it('builds Piper phoneme ids with BOS, pads and EOS and rejects unknown symbols', () => {
    const map = { '^': [1], _: [0], $: [2], a: [14], ' ': [3] };
    expect(phonemeIds(map, 'a a')).toEqual([1, 0, 14, 0, 3, 0, 14, 0, 2]);
    expect(() => phonemeIds(map, 'z')).toThrow('Phoneme not in voice map');
    expect([...TTS_PHONEMES].every((symbol) => /[a-z ]/.test(symbol))).toBe(true);
  });
  it('measures edit distance for the fuzzy first-word match', () => {
    expect(editDistance('this', 'this')).toBe(0); expect(editDistance('thls', 'this')).toBe(1); expect(editDistance('that', 'this')).toBe(2);
  });
});
