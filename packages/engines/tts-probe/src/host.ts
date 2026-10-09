import { startHost, loadedLibraries } from '@danesh/engine-api/host-runtime.ts';
import { runTtsProbe } from './probe.ts';

startHost({ kind: 'tts', entryUrl: import.meta.url, handlers: { 'tts-probe': async (input: { modelPath: string; configPath: string }) => ({ ...await runTtsProbe(input), nativeLibraries: loadedLibraries(/onnxruntime/i) }) } });
