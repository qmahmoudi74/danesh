import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { CHECK_TIMEOUT_MS, SmokeReportSchema, type SmokeReport, type CheckResult } from '@danesh/contracts/smoke-report.ts';
import type { Init } from '@danesh/contracts/control.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import type { Db } from '@danesh/storage/db.ts';
import { checks as registeredChecks, type Check } from './checks/registry.ts';
import { setTimeout as delay, setImmediate as yieldTurn } from 'node:timers/promises';
import type { z } from 'zod';
import type { CheckRunFixtureSchema } from '@danesh/contracts/test-rpc.ts';
type Fixture = z.infer<typeof CheckRunFixtureSchema>;

export class SystemCheck {
  private readonly reports = new Map<string, SmokeReport>();
  private readonly targets = new Map<string, { path: string; expires: number }>();
  private readonly now: () => number;
  private readonly checks: Check[];
  private readonly timeouts: { engine: number; default: number };
  constructor(now: () => number = Date.now, options: { checks?: Check[]; timeouts?: { engine: number; default: number } } = {}) {
    this.now = now; this.checks = options.checks ?? registeredChecks; this.timeouts = options.timeouts ?? CHECK_TIMEOUT_MS;
  }
  get(runId: string): SmokeReport | undefined { return this.reports.get(runId); }
  addTarget(token: string, path: string, ttlMs = 60_000): void {
    if (!isAbsolute(path)) throw new Error('Export target must be absolute');
    for (const [key, target] of this.targets) if (target.expires <= this.now()) this.targets.delete(key);
    if (this.targets.size >= 100) throw new Error('Too many export targets');
    this.targets.set(token, { path, expires: this.now() + ttlMs });
  }
  async export(runId: string, token: string): Promise<{ ok: true } | { ok: false; reason: 'unknown-token' | 'unknown-run' | 'write-failed' }> {
    const target = this.targets.get(token); this.targets.delete(token);
    if (!target || target.expires <= this.now()) return { ok: false, reason: 'unknown-token' };
    const report = this.reports.get(runId);
    if (!report) return { ok: false, reason: 'unknown-run' };
    const temporary = `${target.path}.tmp-${process.pid}-${randomUUID()}`;
    let created = false;
    try {
      const content = JSON.stringify(SmokeReportSchema.parse(report), null, 2) + '\n';
      const file = await open(temporary, 'wx'); created = true;
      try { await file.writeFile(content, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, target.path);
      return { ok: true };
    } catch { return { ok: false, reason: 'write-failed' }; }
    finally { if (created) await unlink(temporary).catch(() => undefined); }
  }
  private applicable(facts: Init): Check[] { return this.checks.filter((check) => check.applies?.(facts) ?? true); }
  checkIds(facts: Init, fixture?: Fixture): string[] { return (__TEST_HOOKS__ && fixture?.checks ? fixture.checks : this.applicable(facts)).map((check) => 'checkId' in check ? check.checkId : check.id); }
  async run(runId: string, port: UtilityPort, facts: Init, database: Db, fixture?: Fixture): Promise<void> {
    const startedAt = new Date().toISOString();
    const results: CheckResult[] = [];
    const selected: Check[] = __TEST_HOOKS__ && fixture?.checks ? fixture.checks.map((result) => ({ id: result.checkId, run: () => result })) : this.applicable(facts);
    for (const check of selected) port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId: check.id, status: 'pending' } });
    if (__TEST_HOOKS__ && fixture) await delay(50); else await yieldTurn();
    for (const [index, check] of selected.entries()) {
      port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId: check.id, status: 'running' } });
      const start = performance.now();
      if (__TEST_HOOKS__ && fixture?.delayMs && (index === 0 || fixture.delayMs <= 1000)) await delay(fixture.delayMs);
      else await yieldTurn();
      let result: CheckResult | null;
      const limit = check.id.startsWith('engine-') ? this.timeouts.engine : this.timeouts.default;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<CheckResult>((resolve) => { timer = setTimeout(() => resolve({ checkId: check.id, status: 'fail', durationMs: limit, detail: 'timeout', fields: { timeoutMs: limit } }), limit); });
      try { result = await Promise.race([Promise.resolve(check.run({ init: facts, db: database, rendererConnected: true })), timedOut]); }
      catch { result = { checkId: check.id, status: 'fail', durationMs: 0, detail: 'بررسی انجام نشد.', fields: {} }; }
      finally { clearTimeout(timer); }
      if (!result) continue;
      result.durationMs = Math.max(0, Math.round(performance.now() - start));
      results.push(result);
      port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId: check.id, status: result.status } });
    }
    this.reports.set(runId, SmokeReportSchema.parse({ schemaVersion: 1, appVersion: facts.appVersion, electronVersion: facts.electronVersion, platform: facts.platform, arch: facts.arch, startedAt, finishedAt: new Date().toISOString(), overall: results.every((r) => r.status === 'pass') ? 'pass' : 'fail', checks: results }));
    if (this.reports.size > 100) { const oldest = this.reports.keys().next().value; if (oldest) this.reports.delete(oldest); }
    port.postMessage({ topic: 'systemCheck.finished', payload: { runId } });
  }
}
