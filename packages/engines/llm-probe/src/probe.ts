import { createHash } from 'node:crypto';
import { getLlama, LlamaCompletion } from 'node-llama-cpp';

export const LLM_PROMPT = 'Once upon a time';
/** Packaging probe (D-23): proves llama.cpp loads and generates in this process; says nothing about product quality. */
export async function runLlmProbe({ modelPath }: { modelPath: string }): Promise<{ text: string; tokenCount: number; outputSha256: string; loadMs: number; generateMs: number }> {
  const started = performance.now();
  // Windows ships a CPU build, so the probe pins the CPU. macOS ships only the Metal build; gpu:false would ask for a
  // CPU-only Mac binary that does not exist, so it uses the default selection there.
  const llama = await getLlama({ gpu: process.platform === 'darwin' ? 'auto' : false, build: 'never', skipDownload: true });
  try {
    const model = await llama.loadModel({ modelPath });
    const loadMs = Math.round(performance.now() - started);
    try {
      const context = await model.createContext({ contextSize: 256 });
      try {
        const completion = new LlamaCompletion({ contextSequence: context.getSequence() });
        const generated = performance.now();
        const text = await completion.generateCompletion(LLM_PROMPT, { maxTokens: 24, temperature: 0 });
        return { text, tokenCount: model.tokenize(text).length, outputSha256: createHash('sha256').update(text, 'utf8').digest('hex'), loadMs, generateMs: Math.round(performance.now() - generated) };
      } finally { await context.dispose(); }
    } finally { await model.dispose(); }
  } finally { await llama.dispose(); }
}
