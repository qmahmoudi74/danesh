import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testRepository } from '../../../tools/lib/test-repo.ts';
import { check as appLaunch } from '../src/checks/app-launch.check.ts';
import { check as database } from '../src/checks/database.check.ts';
import { SystemCheck } from '../src/system-check.ts';

// These tests cover export capabilities, so they pin the two local checks instead of starting engines.
const localChecks = { checks: [appLaunch, database] };

import type { Init } from '@danesh/contracts/control.ts';
import { SmokeReportSchema } from '@danesh/contracts/smoke-report.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import { type Db, openLibraryDb } from '@danesh/storage/db.ts';

describe('Core report export capabilities', () => {
  let repo: ReturnType<typeof testRepository>;
  let db: Db;
  let facts: Init;
  const port: UtilityPort = { on() {}, start() {}, postMessage() {} };
  beforeEach(() => {
    repo = testRepository();
    db = openLibraryDb(repo.root);
    facts = {
      type: 'init',
      libraryRoot: repo.root,
      appVersion: '0.1.0',
      electronVersion: '44.7.0',
      platform: 'win32',
      arch: 'x64',
      mainPid: 1,
      exePath: 'test',
      osName: 'Windows_NT',
      osVersion: '10.0',
      locale: 'fa-IR',
      packaged: false,
      probesDir: join(repo.root, 'probes'),
    };
  });
  afterEach(() => {
    db.close();
    repo.cleanup();
  });
  it('writes the real stored report atomically and consumes its token', async () => {
    const service = new SystemCheck(Date.now, localChecks);
    const runId = randomUUID(),
      token = randomUUID(),
      path = join(repo.root, 'report.json');
    await service.run(runId, port, facts, { state: 'ready', db });
    await writeFile(path, 'old file');
    service.addTarget(token, path);
    expect(await service.export(runId, token)).toEqual({ ok: true });
    expect(SmokeReportSchema.parse(JSON.parse(await readFile(path, 'utf8')))).toEqual(
      service.get(runId),
    );
    expect(await service.export(runId, token)).toEqual({ ok: false, reason: 'unknown-token' });
    expect((await readdir(repo.root)).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });
  it('rejects expired capabilities at the exact 60-second boundary', async () => {
    let now = 100;
    const service = new SystemCheck(() => now, localChecks);
    const runId = randomUUID(),
      token = randomUUID();
    await service.run(runId, port, facts, { state: 'ready', db });
    service.addTarget(token, join(repo.root, 'report.json'));
    now += 60000;
    expect(await service.export(runId, token)).toEqual({ ok: false, reason: 'unknown-token' });
    expect((await readdir(repo.root)).includes('report.json')).toBe(false);
  });
  it('consumes tokens even when a report does not exist', async () => {
    const service = new SystemCheck(Date.now, localChecks),
      token = randomUUID();
    service.addTarget(token, join(repo.root, 'report.json'));
    expect(await service.export(randomUUID(), token)).toEqual({ ok: false, reason: 'unknown-run' });
    expect(await service.export(randomUUID(), token)).toEqual({
      ok: false,
      reason: 'unknown-token',
    });
  });
  it('returns a typed write failure without creating a target or temporary file', async () => {
    const service = new SystemCheck(Date.now, localChecks),
      runId = randomUUID(),
      token = randomUUID();
    await service.run(runId, port, facts, { state: 'ready', db });
    service.addTarget(token, join(repo.root, 'missing', 'report.json'));
    expect(await service.export(runId, token)).toEqual({ ok: false, reason: 'write-failed' });
    expect(await service.export(runId, token)).toEqual({ ok: false, reason: 'unknown-token' });
  });
  it('rejects relative export targets and bounds outstanding capabilities', () => {
    const service = new SystemCheck(Date.now, localChecks);
    expect(() => service.addTarget(randomUUID(), 'relative.json')).toThrow('absolute');
    for (let index = 0; index < 100; index++)
      service.addTarget(randomUUID(), join(repo.root, `${index}.json`));
    expect(() => service.addTarget(randomUUID(), join(repo.root, 'overflow.json'))).toThrow(
      'Too many',
    );
  });
  it('fails a check that exceeds its timeout and still runs the next one, never passing an unrun check', async () => {
    const hung = { id: 'app-launch', run: () => new Promise<never>(() => undefined) };
    const next = {
      id: 'database',
      run: () => ({
        checkId: 'database',
        status: 'pass' as const,
        durationMs: 0,
        detail: 'ok',
        fields: {},
      }),
    };
    const service = new SystemCheck(Date.now, {
      checks: [hung, next],
      timeouts: { engine: 20, default: 20 },
    });
    const runId = randomUUID();
    await service.run(runId, port, facts, { state: 'ready', db });
    const report = service.get(runId)!;
    expect(report.checks.map((check) => [check.checkId, check.status, check.detail])).toEqual([
      ['app-launch', 'fail', 'timeout'],
      ['database', 'pass', 'ok'],
    ]);
    expect(report.overall).toBe('fail');
  });
});
