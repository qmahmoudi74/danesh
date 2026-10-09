import { randomUUID } from 'node:crypto';
import { MainToCoreSchema, type Init } from '@danesh/contracts/control.ts';
import { RpcRequestSchema, rpcMethods, type RpcErrorCode } from '@danesh/contracts/rpc.ts';
import { SmokeReportSchema, type SmokeReport, type CheckResult } from '@danesh/contracts/smoke-report.ts';
import { parentPort, type UtilityPort } from '@danesh/contracts/utility-port.ts';
import { openLibraryDb, type Db } from '@danesh/storage/db.ts';
import { checks } from './checks/registry.ts';

const parent = parentPort();
let init: Init | undefined;
let db: Db | undefined;
const reports = new Map<string, SmokeReport>();

function runChecks(runId: string, port: UtilityPort, facts: Init, database: Db): void {
  const startedAt = new Date().toISOString();
  const results: CheckResult[] = [];
  for (const check of checks) {
    port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId: check.id, status: 'running' } });
    const start = performance.now();
    let result: CheckResult | null;
    try { result = check.run({ init: facts, db: database, rendererConnected: true }); }
    catch { result = { checkId: check.id, status: 'fail', durationMs: 0, detail: 'بررسی انجام نشد.', fields: {} }; }
    if (!result) continue;
    result.durationMs = Math.max(0, Math.round(performance.now() - start));
    results.push(result);
    port.postMessage({ topic: 'systemCheck.progress', payload: { runId, checkId: check.id, status: result.status } });
  }
  reports.set(runId, SmokeReportSchema.parse({ schemaVersion: 1, appVersion: facts.appVersion, electronVersion: facts.electronVersion, platform: facts.platform, arch: facts.arch, startedAt, finishedAt: new Date().toISOString(), overall: results.every((r) => r.status === 'pass') ? 'pass' : 'fail', checks: results }));
  if (reports.size > 100) { const oldest = reports.keys().next().value; if (oldest) reports.delete(oldest); }
  port.postMessage({ topic: 'systemCheck.finished', payload: { runId } });
}

function attachRenderer(port: UtilityPort): void {
  port.on('message', ({ data }) => {
    const request = RpcRequestSchema.safeParse(data);
    if (!request.success) return;
    const { id, method, input } = request.data;
    const reject = (code: RpcErrorCode) => port.postMessage({ id, ok: false, error: { code } });
    const contract = rpcMethods[method];
    if (!contract) return reject('UNKNOWN_METHOD');
    if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > contract.maxInputBytes) return reject('PAYLOAD_TOO_LARGE');
    const parsed = contract.input.safeParse(input);
    if (!parsed.success) return reject('INVALID_INPUT');
    if (!init || !db) return reject('UNAVAILABLE');
    try {
      let output: unknown;
      if (method === 'system.ping') output = { ...parsed.data as { n: number }, corePid: process.pid };
      else if (method === 'systemCheck.run') {
        const runId = randomUUID(); output = { runId };
        const facts = init, database = db;
        setImmediate(() => runChecks(runId, port, facts, database));
      } else if (method === 'systemCheck.get') output = reports.get((parsed.data as { runId: string }).runId);
      else return reject('UNKNOWN_METHOD');
      const validated = contract.output.safeParse(output);
      if (!validated.success) return reject('UNAVAILABLE');
      port.postMessage({ id, ok: true, output: validated.data });
    } catch { reject('INTERNAL'); }
  });
  port.start();
}

parent.on('message', (message) => {
  const control = MainToCoreSchema.safeParse(message.data);
  if (!control.success) { console.error('Invalid Main control message'); return; }
  if (control.data.type === 'init') {
    if (init) return;
    init = control.data; db = openLibraryDb(init.libraryRoot, init.appVersion);
    parent.postMessage({ type: 'ready', corePid: process.pid });
  } else if (message.ports[0]) attachRenderer(message.ports[0]);
});
process.on('exit', () => db?.close());
