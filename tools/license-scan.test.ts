import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type BinaryEntry,
  checkBinary,
  checkBuildOnlyDependencies,
  checkCoverage,
  generateNotices,
  type LicensePolicy,
  licenseAllowed,
  noticesCurrent,
  parseLockedPackages,
  runPnpm,
} from './license-scan.ts';

const policy = JSON.parse(readFileSync('tools/license-policy.json', 'utf8')) as LicensePolicy;
const pkg = (license?: string) => ({ name: 'fixture', version: '1.0.0', license });
const binary = (license: string): BinaryEntry => ({
  component: 'fixture',
  license,
  shippedIn: 'fixture',
  source: 'https://example.invalid',
  reviewedOn: '2026-10-10',
  obligations: [],
  status: 'reviewed',
});

it.runIf(process.platform === 'win32')('runs a Windows pnpm.cmd shim and preserves failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'danesh-pnpm-shim-'));
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unsafe fixture cleanup');
  const shim = join(root, 'pnpm.cmd');
  vi.stubEnv('npm_execpath', undefined);
  vi.stubEnv('PATH', `${root};${process.env.SystemRoot}\\System32`);
  try {
    writeFileSync(shim, '@echo off\r\necho {"shim":true}\r\n');
    expect(JSON.parse(runPnpm(['licenses', 'list', '--json'], root))).toEqual({ shim: true });
    expect(() => runPnpm(['--json&echo'], root)).toThrow('Unsupported pnpm command argument');
    writeFileSync(shim, '@echo off\r\nexit /b 7\r\n');
    expect(() => runPnpm(['licenses', 'list', '--json'], root)).toThrow();
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
describe('license gate', () => {
  it.each([
    'MIT',
    'MIT OR GPL-3.0-only',
    '(BSD-2-Clause OR MIT OR Apache-2.0)',
    'Apache 2.0',
    'Apache-2.0 WITH LLVM-exception',
  ])('accepts a permitted branch: %s', (license) => {
    expect(licenseAllowed(pkg(license), policy)).toBe(true);
  });
  it.each([
    'MIT AND GPL-3.0-only',
    'GPL-2.0+',
    'LGPL-2.1-or-later',
    'AGPL-3.0-only',
    '',
    'UNKNOWN',
    'BSD',
    'SEE LICENSE IN LICENSE.md',
    'MIT OR made-up',
    'MIT AND CC-BY-4.0',
  ])('rejects unapproved declaration: %s', (license) => {
    expect(licenseAllowed(pkg(license), policy)).toBe(false);
  });
  it('rejects absent license', () => {
    expect(licenseAllowed(pkg(), policy)).toBe(false);
  });
  it.each([
    'CC-BY-NC-4.0',
    'CC-BY-NC-SA-4.0',
    'CPML',
    'Coqui Public Model License',
    'MIT OR non-commercial',
  ])('never waives a non-commercial declaration: %s', (license) => {
    const reviewed = {
      ...policy,
      reviewedExceptions: [
        {
          name: 'fixture',
          version: '1.0.0',
          license,
          reason: 'test',
          reviewedOn: '2026-10-10',
          scope: 'data' as const,
          evidence: ['fixture'],
        },
      ],
    };
    expect(licenseAllowed(pkg(license), reviewed)).toBe(false);
    expect(checkBinary(binary(license), reviewed)).toBeDefined();
  });
  it('allows an exact reviewed SEE LICENSE declaration only', () => {
    const license = 'SEE LICENSE IN LICENSE.md';
    const reviewed = {
      ...policy,
      reviewedExceptions: [
        {
          name: 'fixture',
          version: '1.0.0',
          license,
          reason: 'verified text',
          reviewedOn: '2026-10-10',
          scope: 'verified-grant' as const,
          evidence: ['license.md'],
        },
      ],
    };
    expect(licenseAllowed(pkg(license), reviewed)).toBe(true);
    expect(licenseAllowed({ ...pkg(license), version: '2.0.0' }, reviewed)).toBe(false);
  });
  it('checks own MIT packages through the same allowlist', () => {
    expect(licenseAllowed({ name: 'danesh', version: '0.1.0', license: 'MIT' }, policy)).toBe(true);
    expect(
      licenseAllowed(
        { name: 'danesh', version: '0.1.0', license: 'MIT' },
        { ...policy, allowed: [] },
      ),
    ).toBe(false);
  });
  it('checks package identity as well as coverage count', () => {
    expect(checkCoverage([pkg('MIT')], ['other@1.0.0'])).toHaveLength(1);
  });
  it('rejects a build-only exception reachable through nested production edges', () => {
    expect(
      checkBuildOnlyDependencies(
        [{ dependencies: { wrapper: { dependencies: { lightningcss: {} } } } }],
        policy,
      ),
    ).toHaveLength(1);
  });
  it('fails a binary manifest containing AGPL or GPL', () => {
    expect(checkBinary(binary('AGPL-3.0-only'), policy)).toBeDefined();
    expect(checkBinary(binary('GPL-2.0-only'), policy)).toBeDefined();
  });
  it('generates verbatim Apache NOTICE and full font license, detects missing or edited output', () => {
    const generated = generateNotices(
      [pkg('Apache-2.0')],
      () => 'Copyright fixture\r\nNOTICE text',
      'FULL OFL TEXT',
    );
    expect(generated).toContain('fixture@1.0.0 (Apache-2.0)\nCopyright fixture\r\nNOTICE text');
    expect(generated).toContain('FULL OFL TEXT');
    expect(noticesCurrent(generated, undefined)).toBe(false);
    expect(noticesCurrent(generated, generated + 'edit')).toBe(false);
    expect(noticesCurrent(generated, generated)).toBe(true);
  });
  it('reads both package sections in the real frozen lockfile', () => {
    expect(parseLockedPackages(readFileSync('pnpm-lock.yaml', 'utf8'))).toHaveLength(747);
  });
  it('refuses an incomplete lockfile inventory', () => {
    expect(() =>
      parseLockedPackages(
        "lockfileVersion: '9.0'\npackages:\n  fixture@1.0.0:\n    resolution: {}\n",
      ),
    ).toThrow();
  });
});
