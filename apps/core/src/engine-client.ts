import { randomUUID } from 'node:crypto';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import { type HostKind, HostToCoreSchema, type RunInput } from '@danesh/contracts/host-protocol.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';

export class HostExitedError extends Error {
  override readonly name = 'HostExited';
  readonly exitCode: number;
  readonly restartAttempt: number;
  constructor(kind: HostKind, exitCode: number, restartAttempt = 1) {
    super(`${kind} host exited`);
    this.exitCode = exitCode;
    this.restartAttempt = restartAttempt;
  }
}
type Host = {
  port: UtilityPort;
  pid: number;
  entry: string | undefined;
  lastHeartbeat: number;
  watchdog: ReturnType<typeof setInterval>;
};
export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpen';
}
type Waiter = {
  promise: Promise<Host>;
  resolve: (host: Host) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Task = {
  kind: HostKind;
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Core's side of the engine hosts: Main forks a utilityProcess per kind on request and brokers its port; Core
 * validates everything the host sends, runs one task, and asks Main to stop the host again. A host that exits while
 * a task is pending fails that task with HostExited, and only that task.
 */
export function createEngineClient({
  requestSpawn,
  requestStop,
  requestKill,
  logger,
  spawnTimeoutMs = 30_000,
  watchdogMs = 5000,
}: {
  requestSpawn: (kind: HostKind) => void;
  requestStop: (kind: HostKind) => void;
  requestKill?: (kind: HostKind, reason: 'watchdog' | 'test') => void;
  logger: Pick<JsonlLogger, 'log'>;
  spawnTimeoutMs?: number;
  watchdogMs?: number;
}) {
  const hosts = new Map<HostKind, Host>();
  const waiting = new Map<HostKind, Waiter>();
  const tasks = new Map<string, Task>();
  const faults = new Map<HostKind, number>();
  const killNext = new Set<HostKind>();
  const circuits = new Set<HostKind>();
  const ports = new Map<HostKind, UtilityPort>();

  function failPending(kind: HostKind, error: Error): void {
    const waiter = waiting.get(kind);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiting.delete(kind);
      waiter.reject(error);
    }
    for (const [id, task] of tasks) {
      if (task.kind !== kind) continue;
      clearTimeout(task.timer);
      tasks.delete(id);
      task.reject(error);
    }
  }
  function removeHost(kind: HostKind): void {
    const host = hosts.get(kind);
    if (host) clearInterval(host.watchdog);
    hosts.delete(kind);
    ports.delete(kind);
  }

  const attach = (kind: HostKind, port: UtilityPort): void => {
    ports.set(kind, port);
    port.on('message', ({ data }) => {
      if (ports.get(kind) !== port) return;
      const message = HostToCoreSchema.safeParse(data);
      if (!message.success) {
        let byteLength = 0;
        try {
          byteLength = utf8ByteLength(data);
        } catch {
          /* still rejected */
        }
        logger.log(
          'host.rejected',
          {
            schema: 'host-message',
            sender: `host:${kind}`,
            errorClass: 'InvalidMessage',
            byteLength,
          },
          'warn',
        );
        failPending(
          kind,
          Object.assign(new Error('Invalid host message'), { name: 'HostProtocolError' }),
        );
        return;
      }
      const value = message.data;
      if (value.type === 'heartbeat') {
        const host = hosts.get(kind);
        if (host?.port === port) host.lastHeartbeat = Date.now();
        return;
      }
      if (value.type === 'log') {
        logger.log(value.event, { ...value.fields, sender: `host:${kind}` });
        return;
      }
      if (value.type === 'rejected') {
        logger.log(
          'rpc.rejected',
          {
            schema: value.schema,
            sender: `host:${kind}`,
            errorClass: value.errorClass,
            byteLength: value.byteLength,
          },
          'warn',
        );
        return;
      }
      if (value.type === 'hello-ack') {
        if (value.kind !== kind) {
          logger.log(
            'host.rejected',
            { sender: `host:${kind}`, errorClass: 'KindMismatch' },
            'warn',
          );
          return;
        }
        let killed = false;
        const watchdog = setInterval(
          () => {
            if (killed || Date.now() - host.lastHeartbeat < watchdogMs) return;
            killed = true;
            logger.log('host.watchdog', { kind, pid: host.pid }, 'warn');
            requestKill?.(kind, 'watchdog');
          },
          Math.min(1000, watchdogMs),
        );
        watchdog.unref();
        const host: Host = {
          port,
          pid: value.hostPid,
          entry: value.entry,
          lastHeartbeat: Date.now(),
          watchdog,
        };
        hosts.set(kind, host);
        const waiter = waiting.get(kind);
        if (waiter) {
          clearTimeout(waiter.timer);
          waiting.delete(kind);
          waiter.resolve(host);
        }
        return;
      }
      const task = tasks.get(value.taskId);
      if (!task || task.kind !== kind) return;
      clearTimeout(task.timer);
      tasks.delete(value.taskId);
      if (value.ok) task.resolve(value.output);
      else
        task.reject(
          Object.assign(new Error(value.errorClass), {
            name: value.errorClass.replace(/[^A-Za-z]/g, '').slice(0, 64) || 'HostError',
          }),
        );
    });
    port.start();
    port.postMessage({ type: 'hello' });
  };

  const hostExited = (
    kind: HostKind,
    exitCode: number,
    requested: boolean,
    restartAttempt = 1,
  ): void => {
    // withHost/session already removed a stopped host. Its late acknowledgement belongs to that old host.
    if (requested) return;
    removeHost(kind);
    logger.log('host.exit', { kind, exitCode, attempt: restartAttempt }, 'warn');
    failPending(kind, new HostExitedError(kind, exitCode, restartAttempt));
  };

  const ensureHost = (kind: HostKind): Promise<Host> => {
    if (circuits.has(kind)) return Promise.reject(new CircuitOpenError());
    const existing = hosts.get(kind);
    if (existing) return Promise.resolve(existing);
    const pending = waiting.get(kind);
    if (pending) return pending.promise;
    const { promise, resolve, reject } = Promise.withResolvers<Host>();
    const timer = setTimeout(() => {
      waiting.delete(kind);
      reject(Object.assign(new Error('Host did not start'), { name: 'HostStartTimeout' }));
    }, spawnTimeoutMs);
    waiting.set(kind, { promise, resolve, reject, timer });
    requestSpawn(kind);
    return promise;
  };

  const run = (kind: HostKind, host: Host, input: RunInput, timeoutMs: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const taskId = randomUUID();
      const timer = setTimeout(() => {
        tasks.delete(taskId);
        reject(Object.assign(new Error('Host task timed out'), { name: 'HostTimeout' }));
      }, timeoutMs);
      tasks.set(taskId, { kind, resolve, reject, timer });
      host.port.postMessage({ type: 'run', taskId, input });
      if (__TEST_HOOKS__ && killNext.delete(kind)) requestKill?.(kind, 'test');
    });

  return {
    attach,
    hostExited,
    hostStartFailed(kind: HostKind, errorClass: 'CircuitOpen' | 'HostSpawnFailed'): void {
      if (errorClass === 'CircuitOpen') circuits.add(kind);
      failPending(
        kind,
        errorClass === 'CircuitOpen'
          ? new CircuitOpenError()
          : Object.assign(new Error('Host failed to spawn'), { name: 'HostSpawnFailed' }),
      );
    },
    killFault(kind: HostKind, when: 'now' | 'next-task'): void {
      if (!__TEST_HOOKS__) return;
      if (when === 'next-task') killNext.add(kind);
      else requestKill?.(kind, 'test');
    },
    async injectFault(
      kind: HostKind,
      mode: Extract<RunInput, { type: 'fault' }>['mode'],
      when: 'now' | 'next-task',
    ): Promise<void> {
      if (!__TEST_HOOKS__) return;
      const host = await ensureHost(kind);
      await run(kind, host, { type: 'fault', mode, when }, 5000);
    },
    /** Test builds only: the next task in that host crashes it. */
    armFault(kind: HostKind): void {
      if (__TEST_HOOKS__) faults.set(kind, 2);
    },
    /** Keeps one host running across several tasks (a document's pages); `close` stops it. */
    async session(kind: HostKind) {
      const host = await ensureHost(kind);
      return {
        hostPid: host.pid,
        run: (input: RunInput, timeoutMs = 120_000) => run(kind, host, input, timeoutMs),
        close: () => {
          if (hosts.get(kind) !== host) return;
          removeHost(kind);
          requestStop(kind);
        },
      };
    },
    async withHost(
      kind: HostKind,
      input: RunInput,
      timeoutMs = 120_000,
    ): Promise<{ output: unknown; hostPid: number; entry: string | undefined }> {
      const host = await ensureHost(kind);
      try {
        const remaining = __TEST_HOOKS__ ? (faults.get(kind) ?? 0) : 0;
        if (remaining > 0) {
          if (remaining === 1) faults.delete(kind);
          else faults.set(kind, remaining - 1);
          await run(kind, host, { type: 'fault', mode: 'crash' }, timeoutMs);
        }
        return {
          output: await run(kind, host, input, timeoutMs),
          hostPid: host.pid,
          entry: host.entry,
        };
      } finally {
        // A crash already removed this generation. Stopping now would cancel its pending backoff.
        if (hosts.get(kind) === host) {
          removeHost(kind);
          requestStop(kind);
        }
      }
    },
  };
}
export type EngineClient = ReturnType<typeof createEngineClient>;
