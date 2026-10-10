import { createSupervisionPolicy, type SupervisionPolicy } from './policy.ts';

export interface ChildHandle {
  pid: number;
  onExit(listener: (code: number) => void): void;
  kill(this: void): void;
  postMessage(message: unknown, transfer?: readonly unknown[]): void;
}
export interface Spawner {
  spawn(kind: string): ChildHandle;
}
export interface SupervisorClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): object | number;
  clearTimeout(timer: object | number): void;
}
export type SupervisorEvent =
  | { type: 'exited'; kind: string; code: number; requested: boolean; restartAttempt: number }
  | { type: 'restarted'; kind: string; attempt: number }
  | { type: 'circuit-open'; kind: string };
type Waiter = {
  promise: Promise<ChildHandle>;
  resolve: (child: ChildHandle) => void;
  reject: (error: Error) => void;
};
type Entry = {
  child?: ChildHandle;
  timer?: object | number;
  waiting?: Waiter;
  policy: SupervisionPolicy;
};

/** Process-free lifecycle logic. The adapter supplies spawning, time and transport. */
export function createSupervisor({
  spawner,
  clock,
  policy = createSupervisionPolicy,
}: {
  spawner: Spawner;
  clock: SupervisorClock;
  policy?: () => SupervisionPolicy;
}) {
  const entries = new Map<string, Entry>();
  const requested = new WeakSet<ChildHandle>();
  const listeners = new Set<(event: SupervisorEvent) => void>();
  const emit = (event: SupervisorEvent) => {
    for (const listener of listeners) listener(event);
  };
  function entryFor(kind: string): Entry {
    let entry = entries.get(kind);
    if (!entry) {
      entry = { policy: policy() };
      entries.set(kind, entry);
    }
    return entry;
  }
  function start(kind: string, entry: Entry, attempt?: number): ChildHandle {
    const child = spawner.spawn(kind);
    entry.child = child;
    entry.policy.onStarted(clock.now());
    child.onExit((code) => {
      const wasRequested = requested.has(child);
      // A stopped generation can acknowledge its exit after its replacement started.
      if (entry.child !== child) {
        emit({ type: 'exited', kind, code, requested: wasRequested, restartAttempt: 0 });
        return;
      }
      entry.child = undefined;
      const decision = entry.policy.onExit({ requested: wasRequested, t: clock.now() });
      emit({
        type: 'exited',
        kind,
        code,
        requested: wasRequested,
        restartAttempt: wasRequested ? 0 : entry.policy.failureCount(),
      });
      if (decision.action === 'circuit-open') {
        entry.waiting?.reject(new Error('CircuitOpen'));
        entry.waiting = undefined;
        emit({ type: 'circuit-open', kind });
      } else if (decision.action === 'restart') {
        entry.timer = clock.setTimeout(() => {
          entry.timer = undefined;
          try {
            start(kind, entry, decision.attempt);
          } catch (error) {
            entry.waiting?.reject(error instanceof Error ? error : new Error('SpawnFailed'));
            entry.waiting = undefined;
          }
        }, decision.afterMs);
      }
    });
    entry.waiting?.resolve(child);
    entry.waiting = undefined;
    if (attempt !== undefined) emit({ type: 'restarted', kind, attempt });
    return child;
  }
  function spawn(kind: string): Promise<ChildHandle> {
    const entry = entryFor(kind);
    if (entry.policy.isCircuitOpen()) return Promise.reject(new Error('CircuitOpen'));
    if (entry.child) return Promise.resolve(entry.child);
    if (entry.waiting) return entry.waiting.promise;
    if (entry.timer === undefined) {
      try {
        return Promise.resolve(start(kind, entry));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('SpawnFailed'));
      }
    }
    const waiting = Promise.withResolvers<ChildHandle>();
    entry.waiting = waiting;
    return waiting.promise;
  }
  function requestStop(kind: string): void {
    const entry = entries.get(kind);
    if (!entry) return;
    if (entry.timer !== undefined) clock.clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.waiting?.reject(new Error('Stopped'));
    entry.waiting = undefined;
    const child = entry.child;
    entry.child = undefined;
    if (child) {
      requested.add(child);
      child.kill();
    }
  }
  return {
    spawn,
    requestStop,
    subscribe: (listener: (event: SupervisorEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
