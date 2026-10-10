import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareFuses,
  fuseBinaryPath,
  parseFuseWire,
  readFuseWire,
} from '../src/checks/fuse-wire.ts';

const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const wire = (states: string) =>
  Buffer.concat([
    Buffer.from(SENTINEL, 'ascii'),
    Buffer.from([1, states.length]),
    Buffer.from(states, 'ascii'),
  ]);

describe('fuse wire', () => {
  it('parses the production wire and reports no differences', () => {
    const fuses = parseFuseWire(wire('00001101'))!;
    expect(fuses).toMatchObject({
      RunAsNode: false,
      EnableNodeCliInspectArguments: false,
      EnableEmbeddedAsarIntegrityValidation: true,
      OnlyLoadAppFromAsar: true,
      GrantFileProtocolExtraPrivileges: true,
    });
    expect(compareFuses(parseFuseWire(wire('00001100'))!)).toEqual([]);
  });
  it('names each differing or removed fuse, and handles a missing sentinel', () => {
    expect(compareFuses(parseFuseWire(wire('00011100'))!)).toEqual([
      'EnableNodeCliInspectArguments',
    ]);
    expect(compareFuses(parseFuseWire(wire('r0001100'))!)).toEqual(['RunAsNode']);
    expect(parseFuseWire(Buffer.from('no fuses here'))).toBeUndefined();
  });
  it('finds a sentinel that straddles the 4 MiB read boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'danesh-fuse-'));
    try {
      const binary = join(dir, 'Danesh.exe');
      writeFileSync(
        binary,
        Buffer.concat([
          Buffer.alloc(4 * 1024 * 1024 - 10, 0x41),
          wire('00001100'),
          Buffer.alloc(100),
        ]),
      );
      expect(compareFuses((await readFuseWire(binary))!)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('reads the framework binary on macOS and the executable elsewhere', () => {
    expect(
      fuseBinaryPath('/Applications/Danesh.app/Contents/MacOS/Danesh', 'darwin').replaceAll(
        '\\',
        '/',
      ),
    ).toBe(
      '/Applications/Danesh.app/Contents/Frameworks/Electron Framework.framework/Electron Framework',
    );
    expect(fuseBinaryPath('C:\\Danesh\\Danesh.exe', 'win32')).toBe('C:\\Danesh\\Danesh.exe');
  });
});
