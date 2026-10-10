import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { SampleChunkInputSchema } from '@danesh/contracts/jobs.ts';
import { startHost } from './host-runtime.ts';

startHost({
  kind: 'sample',
  entryUrl: import.meta.url,
  handlers: {
    echo: (input: { value: string }) => ({ type: 'echo', value: input.value }),
    sampleChunk: async (input) => {
      const chunk = SampleChunkInputSchema.parse(input);
      await delay(__TEST_HOOKS__ ? chunk.delayMs : 400);
      if (__TEST_HOOKS__ && chunk.fail)
        throw Object.assign(new Error('Sample chunk failure'), { name: 'SampleChunkFailed' });
      const text = chunk.text.normalize('NFC');
      return {
        index: chunk.index,
        sha256: createHash('sha256').update(text).digest('hex'),
        length: text.length,
      };
    },
  },
});
