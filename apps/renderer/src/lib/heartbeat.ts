import type { ResponsivenessDiagnostics } from '@danesh/contracts/responsiveness.ts';
import { eventPayloads } from '@danesh/contracts/rpc.ts';

/** Integer lateness samples of a fixed-interval timer: how late the renderer's event loop let each tick run. */
export function startHeartbeat(
  intervalMs = 50,
  record?: (latenessMs: number, timestampMs: number) => void,
): () => number[] {
  const samples: number[] = [];
  const startedAt = performance.now();
  let last = startedAt;
  const timer = setInterval(() => {
    const now = performance.now();
    if (samples.length < 4000) {
      const lateness = Math.max(0, Math.round(now - last - intervalMs));
      samples.push(lateness);
      record?.(lateness, now);
    }
    last = now;
  }, intervalMs);
  return () => {
    clearInterval(timer);
    return samples;
  };
}

let idleSamplesMs: number[] | undefined;
/** A separate smoke-only idle window; these samples never enter the acceptance heartbeat. */
export async function measureSmokeIdle(signal: AbortSignal): Promise<void> {
  const stop = startHeartbeat();
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 2000);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
  const samples = stop();
  if (!signal.aborted) idleSamplesMs = samples.slice(0, 100);
}

function observeLongTasks(startedAt: number, diagnostics: ResponsivenessDiagnostics): () => void {
  if (!diagnostics.longTasksSupported) return () => {};
  const record = (entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      if (entry.startTime < startedAt || diagnostics.longTasks.length >= 100) continue;
      diagnostics.longTasks.push({
        startMs: Math.round(entry.startTime - startedAt),
        durationMs: Math.round(entry.duration),
      });
    }
  };
  const observer = new PerformanceObserver((list) => record(list.getEntries()));
  observer.observe({ type: 'longtask', buffered: false });
  return () => {
    record(observer.takeRecords());
    observer.disconnect();
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
    {
      engines: Set<string>;
      stop?: () => number[];
      startedAt?: number;
      done?: boolean;
      diagnostics?: ResponsivenessDiagnostics;
      stopObserver?: () => void;
      finishTimer?: ReturnType<typeof setTimeout>;
    }
  >();
  const finish = (runId: string) => {
    const run = runs.get(runId);
    if (!run?.stop || run.done) return;
    run.done = true;
    const wait = Math.max(0, MIN_WINDOW_MS - (performance.now() - run.startedAt!));
    run.finishTimer = setTimeout(() => {
      const samplesMs = run.stop!();
      run.stopObserver?.();
      runs.delete(runId);
      void window.danesh
        .call('systemCheck.reportResponsiveness', {
          runId,
          intervalMs: INTERVAL_MS,
          samplesMs,
          ...(run.diagnostics ? { diagnostics: run.diagnostics } : {}),
        })
        .catch(() => undefined);
    }, wait);
  };
  const unsubscribe = window.danesh.on('systemCheck.progress', (payload) => {
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
      if (idleSamplesMs) {
        const diagnostics: ResponsivenessDiagnostics = {
          startedAtEpochMs: performance.timeOrigin + run.startedAt,
          idleSamplesMs,
          sampleElapsedMs: [],
          longTasksSupported:
            typeof PerformanceObserver !== 'undefined' &&
            PerformanceObserver.supportedEntryTypes.includes('longtask'),
          longTasks: [],
          visibility: document.visibilityState,
        };
        idleSamplesMs = undefined;
        run.diagnostics = diagnostics;
        run.stopObserver = observeLongTasks(run.startedAt, diagnostics);
        run.stop = startHeartbeat(INTERVAL_MS, (_lateness, timestamp) =>
          diagnostics.sampleElapsedMs.push(Math.round(timestamp - run.startedAt!)),
        );
      } else run.stop = startHeartbeat(INTERVAL_MS);
      return;
    }
    if (status === 'pass' || status === 'fail' || status === 'not-run') {
      run.engines.delete(checkId);
      if (!run.engines.size) finish(runId);
    }
  });
  return () => {
    unsubscribe();
    for (const run of runs.values()) {
      clearTimeout(run.finishTimer);
      run.stop?.();
      run.stopObserver?.();
    }
    runs.clear();
  };
}
