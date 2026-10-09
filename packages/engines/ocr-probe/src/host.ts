import { startHost } from '@danesh/engine-api/host-runtime.ts';
import { runOcrProbe } from './probe.ts';

startHost({ kind: 'ocr', entryUrl: import.meta.url, handlers: { 'ocr-probe': (input: { langDir: string; imagePath: string; expectedFirstWord: string }) => runOcrProbe(input) } });
