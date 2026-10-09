import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSmokeArgs } from '../src/smoke-mode.ts';

describe('smoke-mode arguments', () => {
  it('is inactive without --smoke-test and refuses unsafe outputs before anything runs', () => {
    const dir = mkdtempSync(join(tmpdir(), ' دانش smoke '));
    try {
      expect(parseSmokeArgs(['Danesh.exe'], [])).toBeNull();
      expect(
        parseSmokeArgs(
          ['Danesh.exe', '--smoke-test', `--smoke-out=${join(dir, 'report.json')}`],
          ['C:\\Apps\\Danesh'],
        ),
      ).toEqual({ outPath: join(dir, 'report.json') });
      for (const argv of [
        ['--smoke-test'],
        ['--smoke-test', '--smoke-out=report.json'],
        ['--smoke-test', `--smoke-out=${join(dir, 'report.txt')}`],
        ['--smoke-test', `--smoke-out=${join(dir, 'nested', 'report.json')}`],
      ])
        expect(parseSmokeArgs(argv, [])).toHaveProperty('error');
      expect(
        parseSmokeArgs(['--smoke-test', `--smoke-out=${join(dir, 'report.json')}`], [dir]),
      ).toHaveProperty('error');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
