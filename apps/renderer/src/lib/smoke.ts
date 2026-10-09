import { eventPayloads, rpcMethods } from '@danesh/contracts/rpc.ts';
import { shellEventPayloads } from '@danesh/contracts/shell.ts';
import { type SmokeReport, SmokeReportSchema } from '@danesh/contracts/smoke-report.ts';

/** Runs one System check through Core's normal run → finished → get path and resolves with its id and report. */
export function runSystemCheckOnce(): Promise<{ runId: string; report: SmokeReport }> {
  return new Promise((resolve, reject) => {
    const finished = new Set<string>();
    let runId: string | undefined;
    const settle = () => {
      if (!runId || !finished.has(runId)) return;
      unsubscribe();
      const id = runId;
      void window.danesh
        .call('systemCheck.get', { runId: id })
        .then((output) => resolve({ runId: id, report: SmokeReportSchema.parse(output) }), reject);
    };
    // Subscribe before starting so a fast run cannot finish unseen.
    const unsubscribe = window.danesh.on('systemCheck.finished', (payload) => {
      const event = eventPayloads['systemCheck.finished']!.safeParse(payload);
      if (event.success) {
        finished.add((event.data as { runId: string }).runId);
        settle();
      }
    });
    window.danesh.call('systemCheck.run', {}).then(
      (output) => {
        runId = (rpcMethods['systemCheck.run']!.output.parse(output) as { runId: string }).runId;
        settle();
      },
      (error: unknown) => {
        unsubscribe();
        reject(error instanceof Error ? error : new Error('UNAVAILABLE'));
      },
    );
  });
}

let started = false;
/**
 * Headless smoke mode (--smoke-test): Main sends a single-use export token; the renderer runs the System check, exports
 * the report with that token and tells Main the overall result. A failed run or export is reported as fail.
 */
export function installSmokeRunner(): () => void {
  return window.danesh.on('shell.smokeRun', (payload) => {
    const event = shellEventPayloads['shell.smokeRun']!.safeParse(payload);
    if (!event.success || started) return;
    started = true;
    const { token } = event.data as { token: string };
    void (async () => {
      let overall: 'pass' | 'fail' = 'fail';
      try {
        const { runId, report } = await runSystemCheckOnce();
        const exported = rpcMethods['systemCheck.export']!.output.parse(
          await window.danesh.call('systemCheck.export', { runId, token }),
        ) as { ok: boolean };
        overall = exported.ok && report.overall === 'pass' ? 'pass' : 'fail';
      } catch {
        overall = 'fail';
      }
      await window.danesh.call('shell.smokeDone', { overall });
    })();
  });
}
