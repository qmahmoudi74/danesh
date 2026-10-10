import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJsonlLogger } from '../src/jsonl.ts';

const withDir = (run: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'danesh-log-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const lines = (path: string) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('JSON-lines logger', () => {
  it('writes allowlisted scalar metadata and drops everything else', () =>
    withDir((dir) => {
      const logger = createJsonlLogger({ dir, name: 'core' });
      logger.log(
        'rpc.rejected',
        {
          schema: 'system.ping',
          sender: 'renderer',
          byteLength: 12,
          input: { n: 'secret' },
          path: 'C:/Users/x',
          detail: 'free text',
          pid: Number.NaN,
        },
        'warn',
      );
      const [record] = lines(join(dir, 'core.jsonl'));
      expect(record).toMatchObject({
        level: 'warn',
        process: 'core',
        event: 'rpc.rejected',
        schema: 'system.ping',
        sender: 'renderer',
        byteLength: 12,
        droppedFields: 4,
      });
      expect(Object.keys(record!).sort()).toEqual([
        'byteLength',
        'droppedFields',
        'event',
        'level',
        'process',
        'schema',
        'sender',
        'ts',
      ]);
      expect(readFileSync(join(dir, 'core.jsonl'), 'utf8')).not.toMatch(
        /secret|C:\/Users|free text/,
      );
    }));
  it('caps long strings and sanitizes event names', () =>
    withDir((dir) => {
      const logger = createJsonlLogger({ dir, name: 'main' });
      logger.log('ok.event', { schema: 'x'.repeat(201) });
      logger.log('دانش <script>', { count: 1 });
      const [first, second] = lines(join(dir, 'main.jsonl'));
      expect(first!.schema).toEqual({ truncated: true });
      expect(second!.event).toBe('invalid-event');
    }));
  it('rotates within the size threshold and file-count limit', () =>
    withDir((dir) => {
      const logger = createJsonlLogger({ dir, name: 'core', maxBytes: 1024, maxFiles: 3 });
      // Forty records exceed retention several times without hundreds of redundant
      // synchronous filesystem operations competing with the SQLite durability tests.
      const recordCount = 40;
      for (let index = 0; index < recordCount; index++)
        logger.log('rpc.rejected', {
          schema: 'system.ping',
          sender: 'renderer',
          errorClass: 'SchemaMismatch',
          byteLength: index,
        });
      expect(readdirSync(dir).sort()).toEqual(['core.1.jsonl', 'core.2.jsonl', 'core.jsonl']);
      for (const file of readdirSync(dir))
        expect(statSync(join(dir, file)).size).toBeLessThanOrEqual(1024);
      // The newest record is in the live file and the oldest ones were discarded.
      const retained = ['core.2.jsonl', 'core.1.jsonl', 'core.jsonl'].flatMap((file) =>
        lines(join(dir, file)).map((record) => record.byteLength),
      );
      expect(retained.at(-1)).toBe(recordCount - 1);
      const oldest = retained[0] as number;
      expect(oldest).toBeGreaterThan(0);
      expect(retained).toEqual(
        Array.from({ length: recordCount - oldest }, (_, index) => oldest + index),
      );
    }));
  it('rejects unsafe names and bounds, and stops writing after close', () =>
    withDir((dir) => {
      expect(() => createJsonlLogger({ dir, name: '../core' })).toThrow();
      expect(() => createJsonlLogger({ dir, name: 'core', maxFiles: 0 })).toThrow();
      const logger = createJsonlLogger({ dir, name: 'core' });
      logger.close();
      logger.log('late.event');
      expect(readdirSync(dir)).toEqual([]);
    }));
});
