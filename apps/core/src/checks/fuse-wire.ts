import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Electron's fuse block: this sentinel, then a version byte, a length byte and one byte per fuse ('0' off, '1' on). */
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii');
export const FUSES = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments', 'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot', 'GrantFileProtocolExtraPrivileges'] as const;
export type FuseName = typeof FUSES[number];
/** The D-09 production fuse set (ADR 0003). Fuses not listed are left at Electron's default and not judged. */
export const PRODUCTION_FUSES: Partial<Record<FuseName, boolean>> = {
  RunAsNode: false, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true, OnlyLoadAppFromAsar: true, GrantFileProtocolExtraPrivileges: false,
};

export function parseFuseWire(bytes: Buffer): Partial<Record<FuseName, boolean | 'removed'>> | undefined {
  const at = bytes.indexOf(SENTINEL);
  if (at < 0 || at + SENTINEL.length + 2 > bytes.length) return undefined;
  const length = bytes[at + SENTINEL.length + 1]!;
  const wire = bytes.subarray(at + SENTINEL.length + 2, at + SENTINEL.length + 2 + length);
  const fuses: Partial<Record<FuseName, boolean | 'removed'>> = {};
  FUSES.forEach((name, index) => { const value = wire[index]; if (value !== undefined) fuses[name] = value === 0x31 ? true : value === 0x30 ? false : 'removed'; });
  return fuses;
}

export function compareFuses(actual: Partial<Record<FuseName, boolean | 'removed'>>, expected = PRODUCTION_FUSES): FuseName[] {
  return (Object.keys(expected) as FuseName[]).filter((name) => actual[name] !== expected[name]);
}

/** The binary that carries the fuse block: the app executable on Windows/Linux, the Electron framework on macOS. */
export function fuseBinaryPath(exePath: string, platform: string): string {
  return platform === 'darwin' ? join(dirname(exePath), '..', 'Frameworks', 'Electron Framework.framework', 'Electron Framework') : exePath;
}

/** Streams the binary (hundreds of MB) in chunks, keeping an overlap so a sentinel split across chunks is still found. */
export async function readFuseWire(binary: string): Promise<Partial<Record<FuseName, boolean | 'removed'>> | undefined> {
  const file = await open(binary, 'r');
  try {
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    const keep = SENTINEL.length + 2 + 64;
    let carry = Buffer.alloc(0);
    let position = 0;
    for (;;) {
      const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
      if (!bytesRead) return undefined;
      position += bytesRead;
      const window = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
      const at = window.indexOf(SENTINEL);
      if (at >= 0 && at + keep <= window.length) return parseFuseWire(window.subarray(at, at + keep));
      carry = window.subarray(Math.max(0, window.length - keep));
    }
  } finally { await file.close(); }
}
