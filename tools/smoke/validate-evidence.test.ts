import { describe, expect, it } from 'vitest';
import { validateEvidence } from './validate-evidence.ts';

const check = (checkId: string, status = 'pass', fields: Record<string, string | number> = {}) => ({ checkId, status, durationMs: 1, detail: 'd', fields });
const report = (checks: ReturnType<typeof check>[], platform = 'win32') => ({ schemaVersion: 1, appVersion: '0.1.0', electronVersion: '44.7.0', platform, arch: 'x64', startedAt: '2026-10-10T00:00:00.000Z', finishedAt: '2026-10-10T00:00:01.000Z', overall: checks.every((item) => item.status === 'pass') ? 'pass' : 'fail', checks });
const persianDb = check('database', 'pass', { dbPath: 'C:\\Users\\کاربر آزمون دانش\\AppData\\Local\\Danesh\\danesh.db' });

describe('Tier B / CI evidence validation', () => {
  it('accepts a passing export with a Persian path on the required OS and checks', () => {
    expect(validateEvidence(report([check('app-launch'), persianDb, check('fuses')]), { requirePersianPath: true, requireOs: 'win32', requireChecks: ['database', 'fuses'] }).problems).toEqual([]);
  });
  it('accepts the runner evidence wrapper', () => {
    expect(validateEvidence({ verdict: 'pass', appReport: report([check('app-launch'), persianDb]) }).problems).toEqual([]);
  });
  it('flags a missing required check', () => {
    expect(validateEvidence(report([check('app-launch'), persianDb]), { requireChecks: ['fuses'] }).problems).toEqual(['required check fuses is missing']);
  });
  it('flags a failed check and the overall failure', () => {
    const problems = validateEvidence(report([check('app-launch'), check('database', 'fail')]), { requireChecks: ['database'] }).problems;
    expect(problems).toEqual(['overall is fail; failing checks: database', 'required check database is fail']);
  });
  it('flags an ASCII-only library path', () => {
    expect(validateEvidence(report([check('app-launch'), check('database', 'pass', { dbPath: 'C:\\Users\\tester\\AppData\\Local\\Danesh\\danesh.db' })]), { requirePersianPath: true }).problems).toEqual(['no reported library path contains both Persian letters and a space']);
  });
  it('flags the wrong operating system and invalid reports', () => {
    expect(validateEvidence(report([check('app-launch')], 'darwin'), { requireOs: 'win32' }).problems).toEqual(['platform is darwin, expected win32']);
    expect(validateEvidence({ checks: [] }).problems[0]).toMatch(/^not a valid smoke report/);
  });
});
