import { setTimeout as delay } from 'node:timers/promises';
import { createCas } from '../../src/cas.ts';

const [blobsDir, tmpDir] = process.argv.slice(2);
if (!blobsDir || !tmpDir) throw new Error('CAS directories required');
async function* stream() {
  const chunk = Buffer.alloc(64 * 1024, 9);
  for (let index = 0; index < 100; index++) {
    yield chunk;
    // Resuming the generator means the preceding chunk has actually reached the temporary file.
    if (index === 0) process.stdout.write('partial-written\n');
    await delay(200);
  }
}
await createCas({ blobsDir, tmpDir }).put(stream());
