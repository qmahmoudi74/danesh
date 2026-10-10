import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { setTimeout as delay, setImmediate as yieldTurn } from 'node:timers/promises';
import type { Init } from '@danesh/contracts/control.ts';
import {
  CHECK_ORDER,
  CHECK_TIMEOUT_MS,
  type CheckResult,
  type SmokeReport,
  SmokeReportSchema,
} from '@danesh/contracts/smoke-report.ts';
import type { CheckRunFixtureSchema } from '@danesh/contracts/test-rpc.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import type { LibraryOpen } from '@danesh/storage/db.ts';
import type { z } from 'zod';
import { type Check, checks as registeredChecks } from './checks/registry.ts';
import type { EngineClient } from './engine-client.ts';

type Fixture = z.infer<typeof CheckRunFixtureSchema>;
export type Responsiveness = { intervalMs: number; samplesMs: number[] };
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class SystemCheck {
  private readonly reports = new Map<string, SmokeReport>();
  private readonly targets = new Map<string, { path: string; expires: number }>();
  private readonly now: () => number;
  private readonly checks: Check[];
  private readonly timeouts: { engine: number; default: number };
  private readonly engines: EngineClient | undefined;
  private readonly responsiveness = new Map<
    string,
    {
      settled: boolean;
      resolve: (value: Responsiveness | undefined) => void;
      promise: Promise<Responsiveness | undefined>;
    }
  >();
  constructor(
    now: () => number = Date.now,
    options: {
      checks?: Check[];
      timeouts?: { engine: number; default: number };
      engines?: EngineClient;
    } = {},
  ) {
    this.now = now;
    this.checks = options.checks ?? registeredChecks;
    this.timeouts = options.timeouts ?? CHECK_TIMEOUT_MS;
    this.engines = options.engines;
  }
  get(runId: string): SmokeReport | undefined {
    return this.reports.get(runId);
  }
  addTarget(token: string, path: string, ttlMs = 60_000): void {
    if (!isAbsolute(path)) throw new Error('Export target must be absolute');
    for (const [key, target] of this.targets)
      if (target.expires <= this.now()) this.targets.delete(key);
    if (this.targets.size >= 100) throw new Error('Too many export targets');
    this.targets.set(token, { path, expires: this.now() + ttlMs });
  }
  async export(
    runId: string,
    token: string,
  ): Promise<
    { ok: true } | { ok: false; reason: 'unknown-token' | 'unknown-run' | 'write-failed' }
  > {
    const target = this.targets.get(token);
    this.targets.delete(token);
    if (!target || target.expires <= this.now()) return { ok: false, reason: 'unknown-token' };
    const report = this.reports.get(runId);
    if (!report) return { ok: false, reason: 'unknown-run' };
    const temporary = `${target.path}.tmp-${process.pid}-${randomUUID()}`;
    let created = false;
    try {
      const content = JSON.stringify(SmokeReportSchema.parse(report), null, 2) + '\n';
      const file = await open(temporary, 'wx');
      created = true;
      try {
        await file.writeFile(content, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, target.path);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'write-failed' };
    } finally {
      if (created) await unlink(temporary).catch(() => undefined);
    }
  }
  private applicable(facts: Init): Check[] {
    return this.checks.filter((check) => check.applies?.(facts) ?? true);
  }
  checkIds(facts: Init, fixture?: Fixture): string[] {
    return (__TEST_HOOKS__ && fixture?.checks ? fixture.checks : this.applicable(facts)).map(
      (check) => ('checkId' in check ? check.checkId : check.id),
    );
  }
  /** Renderer heartbeat lateness for a run (ADR 0003 PK5); the ui-responsive check waits for it. */
  reportResponsiveness(runId: string, intervalMs: number, samplesMs: number[]): void {
    if (this.reports.has(runId)) return; // the run already finished; nothing is waiting
    const waiting = this.responsiveness.get(runId);
    if (waiting && !waiting.settled) {
      waiting.settled = true;
      waiting.resolve({ intervalMs, samplesMs });
    } else if (!waiting)
      this.responsiveness.set(runId, {
        settled: true,
        resolve: () => undefined,
        promise: Promise.resolve({ intervalMs, samplesMs }),
      });
  }
  private responsivenessFor(runId: string): Promise<Responsiveness | undefined> {
    let entry = this.responsiveness.get(runId);
    if (!entry) {
      let resolve: (value: Responsiveness | undefined) => void = () => undefined;
      const promise = new Promise<Responsiveness | undefined>((done) => {
        resolve = done;
      });
      entry = { settled: false, resolve, promise };
      this.responsiveness.set(runId, entry);
    }
    return entry.promise;
  }
  private selection(facts: Init, fixture?: Fixture): Check[] {
    if (!(__TEST_HOOKS__ && fixture?.checks)) return this.applicable(facts);
    const canned: Check[] = fixture.checks.map((result) => ({
      id: result.checkId,
      run: () => result,
    }));
    const live = this.applicable(facts).filter((check) => fixture.live?.includes(check.id));
    const order = (id: string) => {
      const index = (CHECK_ORDER as readonly string[]).indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...canned.filter((check) => !live.some((real) => real.id === check.id)), ...live].sort(
      (a, b) => order(a.id) - order(b.id),
    );
  }

  async run(
    runId: string,
    port: UtilityPort,
    facts: Init,
    library: LibraryOpen | undefined,
    fixture?: Fixture,
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    const results: CheckResult[] = [];
    const selected = this.selection(facts, fixture);
    const progress = (checkId: string, status: string) =>
      port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId, status } });
    for (const check of selected) progress(check.id, 'pending');
    if (__TEST_HOOKS__ && fixture) await delay(50);
    else await yieldTurn();
    const context = {
      init: facts,
      library,
      rendererConnected: true,
      engines: this.engines!,
      responsiveness: (timeoutMs: number) => withTimeout(this.responsivenessFor(runId), timeoutMs),
    };
    // Each check has its own limit; a crash or timeout fails only that check and the run always reaches the report.
    const runOne = async (check: Check, index: number): Promise<CheckResult | null> => {
      const start = performance.now();
      if (__TEST_HOOKS__ && fixture?.delayMs && (index === 0 || fixture.delayMs <= 1000))
        await delay(fixture.delayMs);
      else await yieldTurn();
      const limit =
        check.group === 'engines' || check.id.startsWith('engine-')
          ? this.timeouts.engine
          : this.timeouts.default;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<CheckResult>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              checkId: check.id,
              status: 'fail',
              durationMs: limit,
              detail: 'timeout',
              fields: { timeoutMs: limit },
            }),
          limit,
        );
      });
      let result: CheckResult | null;
      try {
        result = await Promise.race([Promise.resolve(check.run(context)), timedOut]);
      } catch {
        result = {
          checkId: check.id,
          status: 'fail',
          durationMs: 0,
          detail: 'بررسی انجام نشد.',
          fields: {},
        };
      } finally {
        clearTimeout(timer);
      }
      if (result) result.durationMs = Math.max(0, Math.round(performance.now() - start));
      return result;
    };
    let index = 0;
    while (index < selected.length) {
      // Engine probes start together (each in its own host); results are still reported in canonical order.
      let end = index + 1;
      if (selected[index]!.group === 'engines')
        while (end < selected.length && selected[end]!.group === 'engines') end++;
      const batch = selected.slice(index, end);
      for (const check of batch) progress(check.id, 'running');
      const outcomes = await Promise.all(
        batch.map((check, offset) => runOne(check, index + offset)),
      );
      for (const result of outcomes) {
        if (!result) continue;
        results.push(result);
        progress(result.checkId, result.status);
      }
      index += batch.length;
    }
    this.responsiveness.delete(runId);
    this.reports.set(
      runId,
      SmokeReportSchema.parse({
        schemaVersion: 1,
        appVersion: facts.appVersion,
        electronVersion: facts.electronVersion,
        platform: facts.platform,
        arch: facts.arch,
        startedAt,
        finishedAt: new Date().toISOString(),
        overall: results.every((r) => r.status === 'pass') ? 'pass' : 'fail',
        checks: results,
      }),
    );
    if (this.reports.size > 100) {
      const oldest = this.reports.keys().next().value;
      if (oldest) this.reports.delete(oldest);
    }
    port.postMessage({ topic: 'systemCheck.finished', payload: { runId } });
  }
}
