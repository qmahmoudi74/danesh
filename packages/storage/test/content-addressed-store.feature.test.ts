import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { afterAll, expect } from 'vitest';
import { type Cas, CasIntegrityError, createCas } from '../src/cas.ts';
import { interruptCasWrite, interruptedCasHash } from './cas-fixture.ts';

const feature = await loadFeature(resolve('features/core/content-addressed-store.feature'));
const parents: string[] = [];
const bytes = Buffer.from('دانش artifact');
const hash = createHash('sha256').update(bytes).digest('hex');
async function setup() {
  const parent = await fs.mkdtemp(join(tmpdir(), 'danesh-cas-feature-'));
  parents.push(parent);
  const root = join(parent, 'دانش آزمون', 'کتابخانه');
  const paths = { blobsDir: join(root, 'blobs'), tmpDir: join(root, 'tmp') };
  return { ...paths, cas: createCas(paths) };
}
afterAll(async () => {
  for (const parent of parents)
    await fs.rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
type Setup = Awaited<ReturnType<typeof setup>>;
type Result = Awaited<ReturnType<Cas['put']>>;
async function* stream() {
  yield await Promise.resolve(bytes.subarray(0, 5));
  yield bytes.subarray(5);
}

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario(
    'Stored bytes are addressed and read back by their SHA-256',
    ({ Given, When, Then, And }) => {
      let context: Setup;
      let result: Result;
      Given('an artifact byte stream and its expected SHA-256', async () => {
        context = await setup();
      });
      When('the content-addressed store writes the artifact', async () => {
        result = await context.cas.put(stream());
      });
      Then('its key is the lowercase 64-hex SHA-256', () => {
        expect(result.sha256).toBe(hash);
      });
      And('its path is "blobs/sha256/<first 2 hex>/<64 hex>" derived only from the hash', () => {
        expect(context.cas.pathFor(result.sha256)).toBe(
          join(context.blobsDir, 'sha256', hash.slice(0, 2), hash),
        );
      });
      And('reading by that key returns exactly the original bytes', async () => {
        expect(await context.cas.get(hash)).toEqual(bytes);
      });
    },
  );
  Scenario('Corrupted stored bytes are rejected on read', ({ Given, When, Then }) => {
    let context: Setup;
    let failure: unknown;
    Given('a stored blob whose bytes have been changed after publication', async () => {
      context = await setup();
      await context.cas.put(bytes);
      await fs.writeFile(context.cas.pathFor(hash), 'corrupt');
    });
    When('the blob is read by its original hash', async () => {
      try {
        await context.cas.get(hash);
      } catch (error) {
        failure = error;
      }
    });
    Then('the store rejects the read with an integrity error', () => {
      expect(failure).toBeInstanceOf(CasIntegrityError);
    });
  });
  Scenario('A zero-byte artifact is a valid stored blob', ({ Given, When, Then, And }) => {
    let context: Setup;
    let result: Result;
    let read: Buffer;
    Given('an empty artifact byte stream', async () => {
      context = await setup();
    });
    When('the content-addressed store writes and reads the artifact', async () => {
      result = await context.cas.put(new Uint8Array());
      read = await context.cas.get(result.sha256);
    });
    Then('the key equals the SHA-256 of empty input', () => {
      expect(result.sha256).toBe(createHash('sha256').digest('hex'));
    });
    And('reading returns zero bytes rather than a missing-blob result', () => {
      expect(read).toEqual(Buffer.alloc(0));
    });
  });
  ScenarioOutline(
    'Duplicate writes publish one blob without rewriting it',
    ({ Given, When, Then, And }, { ordering }) => {
      let context: Setup;
      let results: Result[];
      let inode: bigint;
      let mtime: bigint;
      Given('two artifact streams with identical bytes', async () => {
        context = await setup();
      });
      When('the streams are stored <ordering>', async () => {
        if (ordering === 'concurrently')
          results = await Promise.all([context.cas.put(stream()), context.cas.put(stream())]);
        else results = [await context.cas.put(stream()), await context.cas.put(stream())];
        const stat = await fs.stat(context.cas.pathFor(hash), { bigint: true });
        inode = stat.ino;
        mtime = stat.mtimeNs;
        await context.cas.put(stream());
      });
      Then('both writes return the same hash and exactly one final blob exists', async () => {
        expect(results.map((result) => result.sha256)).toEqual([hash, hash]);
        expect(results.filter((result) => result.existed)).toHaveLength(1);
        expect(await fs.readdir(join(context.blobsDir, 'sha256', hash.slice(0, 2)))).toEqual([
          hash,
        ]);
      });
      And('the later publication does not rewrite the existing final file', async () => {
        const stat = await fs.stat(context.cas.pathFor(hash), { bigint: true });
        expect(stat.ino).toBe(inode);
        expect(stat.mtimeNs).toBe(mtime);
      });
    },
  );
  ScenarioOutline(
    'Transient Windows publication errors use bounded retries',
    ({ Given, When, Then, And }, { error }) => {
      let context: Setup;
      let attempts = 0;
      let started: number;
      let elapsed: number;
      let result: Result;
      Given('a publish operation that transiently fails with <error>', async () => {
        if (typeof error !== 'string') throw new TypeError('Expected a filesystem error code');
        context = await setup();
        context.cas = createCas({
          ...context,
          fs: {
            ...fs,
            link: async (from, to) => {
              attempts++;
              if (attempts <= 2) throw Object.assign(new Error('locked'), { code: error });
              await fs.link(from, to);
            },
          },
        });
      });
      And('an existing final blob with the expected bytes', async () => {
        await createCas(context).put(bytes);
      });
      When('the content-addressed store publishes the same bytes', async () => {
        started = performance.now();
        result = await context.cas.put(bytes);
        elapsed = performance.now() - started;
      });
      Then('retries use bounded backoff rather than an unbounded loop', () => {
        expect(attempts).toBe(3);
        expect(elapsed).toBeGreaterThanOrEqual(140);
      });
      And("success requires verifying the existing final file's hash", async () => {
        expect(result.existed).toBe(true);
        await fs.writeFile(context.cas.pathFor(hash), 'corrupt');
        await expect(context.cas.put(bytes)).rejects.toBeInstanceOf(CasIntegrityError);
      });
    },
  );
  Scenario('Killing a writer leaves no partial final blob', ({ Given, When, Then }) => {
    let context: Setup;
    Given('an artifact stream whose write has not finished', async () => {
      context = await setup();
    });
    When('the writer process is killed mid-write', async () => {
      await interruptCasWrite(context.blobsDir, context.tmpDir);
    });
    Then('no partial blob exists at the final hash path', async () => {
      expect(await context.cas.has(interruptedCasHash())).toBe(false);
    });
    When('the store starts again', async () => {
      context.cas = createCas(context);
      await context.cas.sweepTmp();
    });
    Then('orphaned temporary files are swept before further writes', async () => {
      expect(await fs.readdir(context.tmpDir)).toEqual([]);
      expect(await context.cas.get((await context.cas.put(bytes)).sha256)).toEqual(bytes);
    });
  });
  Scenario('Aborting a write cleans up unpublished bytes', ({ Given, When, Then }) => {
    let context: Setup;
    Given('an artifact write stream in progress', async () => {
      context = await setup();
    });
    When('the write is aborted before publication', async () => {
      async function* aborted() {
        yield await Promise.resolve(bytes);
        throw new Error('aborted');
      }
      await expect(context.cas.put(aborted())).rejects.toThrow('aborted');
    });
    Then('neither a final blob nor its temporary file remains', async () => {
      expect(await context.cas.has(hash)).toBe(false);
      expect(await fs.readdir(context.tmpDir)).toEqual([]);
    });
  });
  Scenario('A published blob remains verifiable after restart', ({ Given, When, Then }) => {
    let context: Setup;
    Given('an artifact stored successfully by its hash', async () => {
      context = await setup();
      await context.cas.put(bytes);
    });
    When('the store is closed and reopened with the same library', () => {
      context.cas = createCas(context);
    });
    Then('reading the artifact returns the original bytes with a matching SHA-256', async () => {
      const read = await context.cas.get(hash);
      expect(read).toEqual(bytes);
      expect(createHash('sha256').update(read).digest('hex')).toBe(hash);
    });
  });
});
