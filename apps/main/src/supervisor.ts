import { join } from 'node:path';
import { createSupervisor } from '@danesh/domain/supervision/supervisor.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { utilityProcess } from 'electron';

/** Electron owns transport and process handles; the existing domain supervisor owns restart policy. */
export function createUtilitySupervisor({
  entries,
  onSpawn,
  logger,
}: {
  entries: Record<string, string>;
  onSpawn: (kind: string, child: Electron.UtilityProcess) => void;
  logger: Pick<JsonlLogger, 'log'>;
}) {
  const children = new Map<string, Electron.UtilityProcess>();
  const supervisor = createSupervisor({
    spawner: {
      spawn(kind) {
        const entry = entries[kind];
        if (!entry) throw new Error('Unknown child kind');
        const child = utilityProcess.fork(join(import.meta.dirname, entry), [], {
          serviceName: `Danesh ${kind}`,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        children.set(kind, child);
        child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
        child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        child.once('exit', () => {
          if (children.get(kind) === child) children.delete(kind);
        });
        onSpawn(kind, child);
        return {
          get pid() {
            return child.pid ?? 0;
          },
          onExit: (listener) => {
            child.once('exit', listener);
          },
          kill: () => {
            child.kill();
          },
          postMessage: (message, transfer) =>
            child.postMessage(
              message,
              transfer ? ([...transfer] as Electron.MessagePortMain[]) : [],
            ),
        };
      },
    },
    clock: {
      now: Date.now,
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    },
  });
  supervisor.subscribe((event) => {
    if (event.type === 'exited')
      logger.log(
        event.requested ? 'host.stopped' : 'host.crashed',
        {
          kind: event.kind,
          exitCode: event.code,
          attempt: event.restartAttempt,
        },
        event.requested ? 'info' : 'warn',
      );
    else if (event.type === 'restarted')
      logger.log('host.restarted', { kind: event.kind, attempt: event.attempt });
    else logger.log('host.circuit-open', { kind: event.kind }, 'error');
  });
  return {
    ...supervisor,
    /** An unrequested stop: its exit still goes through crash policy. */
    killUnexpected(this: void, kind: string): void {
      const pid = children.get(kind)?.pid;
      if (pid) process.kill(pid, 'SIGKILL');
    },
    stopAll(): void {
      for (const kind of Object.keys(entries)) supervisor.requestStop(kind);
    },
  };
}
