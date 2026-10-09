import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildManifest, compareFuseWire, defaultInstallPathLength, diffManifest, isSafeSmokeOut, LONG_PERSIAN_USER, PRODUCTION_FUSES, utf16Length } from './smoke-lib.ts';

describe('packaged smoke helpers', () => {
  it('counts UTF-16 code units, not bytes or graphemes', () => {
    expect(utf16Length('دانش')).toBe(4);
    expect(utf16Length('a😀')).toBe(3);
    expect(utf16Length('کتابخانهٔ من')).toBe(12);
    expect(utf16Length(LONG_PERSIAN_USER)).toBe(40);
  });
  it('diffs manifests by missing, extra and changed files', () => {
    const a = { rel: 'app.asar', size: 1, sha256: 'a'.repeat(64) };
    const b = { rel: 'licenses/LICENSE', size: 2, sha256: 'b'.repeat(64) };
    expect(diffManifest([a, b], [a, b])).toEqual({ missing: [], extra: [], changed: [], ok: true });
    expect(diffManifest([a, b], [a, { ...b, sha256: 'c'.repeat(64) }, { rel: 'x', size: 0, sha256: 'd'.repeat(64) }])).toEqual({ missing: [], extra: ['x'], changed: ['licenses/LICENSE'], ok: false });
    expect(diffManifest([a, b], [a]).missing).toEqual(['licenses/LICENSE']);
  });
  it('flags any one differing D-09 fuse, and missing or removed ones', () => {
    expect(compareFuseWire({ ...PRODUCTION_FUSES, EnableCookieEncryption: true })).toEqual([]);
    for (const name of Object.keys(PRODUCTION_FUSES)) expect(compareFuseWire({ ...PRODUCTION_FUSES, [name]: !PRODUCTION_FUSES[name] })).toEqual([name]);
    expect(compareFuseWire({ ...PRODUCTION_FUSES, RunAsNode: 'removed' })).toEqual(['RunAsNode']);
    expect(compareFuseWire({})).toHaveLength(6);
  });
  it('bounds installed paths for a 40-character Persian user name', () => {
    expect(defaultInstallPathLength(LONG_PERSIAN_USER, 'app.asar')).toBe('C:\\Users\\'.length + 40 + '\\AppData\\Local\\Programs\\Danesh\\resources\\app.asar'.length);
  });
  it('builds a manifest with hashes and the longest relative path', () => {
    const root = mkdtempSync(join(tmpdir(), 'danesh-manifest-'));
    try {
      mkdirSync(join(root, 'licenses')); writeFileSync(join(root, 'licenses', 'LICENSE'), 'MIT'); writeFileSync(join(root, 'app.asar'), '');
      const manifest = buildManifest(root);
      expect(manifest.entries.map((entry) => entry.rel)).toEqual(['app.asar', 'licenses/LICENSE']);
      expect(manifest.entries[1]).toEqual({ rel: 'licenses/LICENSE', size: 3, sha256: createHash('sha256').update('MIT').digest('hex') });
      expect(manifest.maxRelUtf16).toBe('licenses/LICENSE'.length);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('accepts only absolute .json smoke outputs outside the app', () => {
    const root = mkdtempSync(join(tmpdir(), 'دانش smoke '));
    try {
      expect(isSafeSmokeOut(join(root, 'report.json'), ['C:\\Program Files\\Danesh'])).toBe(true);
      expect(isSafeSmokeOut('report.json', [])).toBe(false);
      expect(isSafeSmokeOut(join(root, 'report.txt'), [])).toBe(false);
      expect(isSafeSmokeOut(join(root, 'missing', 'report.json'), [])).toBe(false);
      expect(isSafeSmokeOut(join(root, 'report.json'), [root])).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
