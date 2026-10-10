import { randomUUID } from 'node:crypto';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import { type HostKind, HostToCoreSchema, type RunInput } from '@danesh/contracts/host-protocol.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';

export class HostExitedError extends Error {
  override readonly name = 'HostExited';
  readonly exitCode: number;
  constructor(kind: HostKind, exitCode: number) {
    super(`${kind} host exited`);
    this.exitCode = exitCode;
  }
}
type Host = { port: UtilityPort; pid: number; entry: string | undefined };
type Waiter = {
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
  logger,
  spawnTimeoutMs = 30_000,
}: {
  requestSpawn: (kind: HostKind) => void;
  requestStop: (kind: HostKind) => void;
  logger: Pick<JsonlLogger, 'log'>;
  spawnTimeoutMs?: number;
}) {
  const hosts = new Map<HostKind, Host>();
  const waiting = new Map<HostKind, Waiter>();
  const tasks = new Map<string, Task>();
  const faults = new Set<HostKind>();

  const attach = (kind: HostKind, port: UtilityPort): void => {
    port.on('message', ({ data }) => {
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
        return;
      }
      const value = message.data;
      if (value.type === 'heartbeat') return;
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
        const host = { port, pid: value.hostPid, entry: value.entry };
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

  const hostExited = (kind: HostKind, exitCode: number, requested: boolean): void => {
    hosts.delete(kind);
    if (!requested) logger.log('host.exit', { kind, exitCode }, 'warn');
    const waiter = waiting.get(kind);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiting.delete(kind);
      waiter.reject(new HostExitedError(kind, exitCode));
    }
    for (const [id, task] of tasks)
      if (task.kind === kind) {
        clearTimeout(task.timer);
        tasks.delete(id);
        task.reject(new HostExitedError(kind, exitCode));
      }
  };

  const ensureHost = (kind: HostKind): Promise<Host> => {
    const existing = hosts.get(kind);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(kind);
        reject(Object.assign(new Error('Host did not start'), { name: 'HostStartTimeout' }));
      }, spawnTimeoutMs);
      waiting.set(kind, { resolve, reject, timer });
      requestSpawn(kind);
    });
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
    });

  return {
    attach,
    hostExited,
    /** Test builds only: the next task in that host crashes it. */
    armFault(kind: HostKind): void {
      faults.add(kind);
    },
    async withHost(
      kind: HostKind,
      input: RunInput,
      timeoutMs = 120_000,
    ): Promise<{ output: unknown; hostPid: number; entry: string | undefined }> {
      const host = await ensureHost(kind);
      try {
        if (__TEST_HOOKS__ && faults.delete(kind))
          await run(kind, host, { type: 'fault', mode: 'crash' }, timeoutMs);
        return {
          output: await run(kind, host, input, timeoutMs),
          hostPid: host.pid,
          entry: host.entry,
        };
      } finally {
        hosts.delete(kind);
        requestStop(kind);
      }
    },
  };
}
export type EngineClient = ReturnType<typeof createEngineClient>;
