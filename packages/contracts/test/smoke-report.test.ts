import { describe, expect, it } from 'vitest';
import { CHECK_ORDER, CHECK_TIMEOUT_MS, SmokeReportSchema } from '../src/smoke-report.ts';

const check = {
  checkId: 'app-launch',
  status: 'pass',
  durationMs: 1,
  detail: 'Ready',
  fields: { pid: 123 },
};
const report = {
  schemaVersion: 1,
  appVersion: '0.1.0',
  electronVersion: '44.7.0',
  platform: 'win32',
  arch: 'x64',
  startedAt: '2026-10-09T00:00:00.000Z',
  finishedAt: '2026-10-09T00:00:01.000Z',
  overall: 'pass',
  checks: [check],
};
describe('SmokeReport contract', () => {
  it('fixes the ten unique check ids and their order', () => {
    expect(CHECK_ORDER).toEqual([
      'app-launch',
      'database',
      'cas-storage',
      'engine-llm',
      'engine-ocr',
      'engine-tts',
      'ui-responsive',
      'egress-zero',
      'fuses',
      'codesign',
    ]);
    expect(new Set(CHECK_ORDER).size).toBe(10);
  });
  it('accepts a real-shaped report', () => {
    expect(SmokeReportSchema.safeParse(report).success).toBe(true);
  });
  it('rejects empty checks', () => {
    expect(SmokeReportSchema.safeParse({ ...report, checks: [] }).success).toBe(false);
  });
  it('rejects duplicate ids', () => {
    expect(SmokeReportSchema.safeParse({ ...report, checks: [check, check] }).success).toBe(false);
  });
  it('rejects out-of-order ids', () => {
    expect(
      SmokeReportSchema.safeParse({ ...report, checks: [{ ...check, checkId: 'database' }, check] })
        .success,
    ).toBe(false);
  });
  it('rejects fractional durations', () => {
    expect(
      SmokeReportSchema.safeParse({ ...report, checks: [{ ...check, durationMs: 1.5 }] }).success,
    ).toBe(false);
  });
  it('rejects a truncated output hash', () => {
    expect(
      SmokeReportSchema.safeParse({
        ...report,
        checks: [{ ...check, outputSha256: 'a'.repeat(63) }],
      }).success,
    ).toBe(false);
  });
  it('rejects undeclared fields', () => {
    expect(SmokeReportSchema.safeParse({ ...report, unexpected: true }).success).toBe(false);
  });
  it('accepts bounded future ids without changing known-check order', () => {
    expect(
      SmokeReportSchema.safeParse({
        ...report,
        checks: [check, { ...check, checkId: 'future-check' }, { ...check, checkId: 'database' }],
      }).success,
    ).toBe(true);
  });
  it('rejects duplicate unknown ids and markup ids', () => {
    const future = { ...check, checkId: 'future-check' };
    expect(SmokeReportSchema.safeParse({ ...report, checks: [future, future] }).success).toBe(
      false,
    );
    expect(
      SmokeReportSchema.safeParse({ ...report, checks: [{ ...check, checkId: '<script>' }] })
        .success,
    ).toBe(false);
  });
  it('rejects negative durations and malformed full hashes', () => {
    expect(
      SmokeReportSchema.safeParse({ ...report, checks: [{ ...check, durationMs: -1 }] }).success,
    ).toBe(false);
    for (const outputSha256 of ['a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)])
      expect(
        SmokeReportSchema.safeParse({ ...report, checks: [{ ...check, outputSha256 }] }).success,
      ).toBe(false);
    expect(
      SmokeReportSchema.safeParse({
        ...report,
        checks: [{ ...check, outputSha256: 'a'.repeat(64) }],
      }).success,
    ).toBe(true);
  });
  it('rejects an overall pass unless every check passed', () => {
    for (const status of ['fail', 'not-run']) {
      const checks = [check, { ...check, checkId: 'database', status }];
      expect(SmokeReportSchema.safeParse({ ...report, checks }).success).toBe(false);
      expect(SmokeReportSchema.safeParse({ ...report, overall: 'fail', checks }).success).toBe(
        true,
      );
    }
    expect(SmokeReportSchema.safeParse({ ...report, overall: 'fail' }).success).toBe(false);
  });
  it('sizes check timeouts for first-run conditions', () => {
    expect(CHECK_TIMEOUT_MS).toEqual({ engine: 90_000, default: 15_000 });
  });
});
