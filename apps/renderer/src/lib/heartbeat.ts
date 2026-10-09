import { eventPayloads } from '@danesh/contracts/rpc.ts';

/** Integer lateness samples of a fixed-interval timer: how late the renderer's event loop let each tick run. */
export function startHeartbeat(intervalMs = 50): () => number[] {
  const samples: number[] = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (samples.length < 4000) samples.push(Math.max(0, Math.round(now - last - intervalMs)));
    last = now;
  }, intervalMs);
  return () => {
    clearInterval(timer);
    return samples;
  };
}

const MIN_WINDOW_MS = 6000;
const INTERVAL_MS = 50;
// Run ids already measured; only the most recent are kept so a long session cannot grow this without bound.
const MAX_REMEMBERED_RUNS = 20;
const measured = new Set<string>();

/**
 * Measures renderer responsiveness for every System check run, from the UI and from headless smoke mode alike: the
 * heartbeat starts when the first engine probe starts running and stops once every engine row has finished and at
 * least 6 s have passed; the samples go to Core for the ui-responsive check (ADR 0003 PK5).
 */
export function installResponsivenessProbe(): () => void {
  const runs = new Map<
    string,
    { engines: Set<string>; stop?: () => number[]; startedAt?: number; done?: boolean }
  >();
  const finish = (runId: string) => {
    const run = runs.get(runId);
    if (!run?.stop || run.done) return;
    run.done = true;
    const wait = Math.max(0, MIN_WINDOW_MS - (performance.now() - run.startedAt!));
    setTimeout(() => {
      const samplesMs = run.stop!();
      runs.delete(runId);
      void window.danesh
        .call('systemCheck.reportResponsiveness', { runId, intervalMs: INTERVAL_MS, samplesMs })
        .catch(() => undefined);
    }, wait);
  };
  return window.danesh.on('systemCheck.progress', (payload) => {
    const event = eventPayloads['systemCheck.progress']!.safeParse(payload);
    if (!event.success) return;
    const { runId, checkId, status } = event.data as {
      runId: string;
      checkId: string;
      status: string;
    };
    if (!checkId.startsWith('engine-') || (measured.has(runId) && !runs.has(runId))) return;
    let run = runs.get(runId);
    if (!run) {
      run = { engines: new Set() };
      runs.set(runId, run);
    }
    if (status === 'pending') {
      run.engines.add(checkId);
      return;
    }
    if (status === 'running' && !run.stop) {
      measured.add(runId);
      if (measured.size > MAX_REMEMBERED_RUNS)
        measured.delete(measured.values().next().value as string);
      run.startedAt = performance.now();
      run.stop = startHeartbeat(INTERVAL_MS);
      return;
    }
    if (status === 'pass' || status === 'fail' || status === 'not-run') {
      run.engines.delete(checkId);
      if (!run.engines.size) finish(runId);
    }
  });
}
