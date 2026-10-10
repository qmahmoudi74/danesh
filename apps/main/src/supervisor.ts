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
  const exits = new Map<string, number>();
  const supervisor = createSupervisor({
    spawner: {
      spawn(kind) {
        const entry = entries[kind];
        if (!entry) throw new Error('Unknown child kind');
        const child = utilityProcess.fork(join(import.meta.dirname, entry), [], {
          serviceName: kind === 'core' ? 'Danesh Core' : `Danesh ${kind}`,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(__TEST_HOOKS__ && kind !== 'core' && process.env.DANESH_TEST_HOST_HEAP_MB === '64'
            ? { execArgv: ['--js-flags=--max-old-space-size=64'] }
            : {}),
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
    const prefix = event.kind === 'core' ? 'core' : 'host';
    if (event.type === 'exited') {
      exits.set(event.kind, event.code);
      logger.log(
        event.requested ? `${prefix}.stopped` : `${prefix}.crashed`,
        {
          kind: event.kind,
          exitCode: event.code,
          attempt: event.restartAttempt,
        },
        event.requested ? 'info' : 'warn',
      );
    } else if (event.type === 'restarted')
      logger.log(`${prefix}.restarted`, {
        kind: event.kind,
        exitCode: exits.get(event.kind),
        attempt: event.attempt,
      });
    else logger.log(`${prefix}.circuit-open`, { kind: event.kind }, 'error');
  });
  return {
    ...supervisor,
    requestStop(this: void, kind: string): void {
      logger.log(kind === 'core' ? 'core.stop-requested' : 'host.stop-requested', { kind });
      supervisor.requestStop(kind);
    },
    /** An unrequested stop: its exit still goes through crash policy. */
    killUnexpected(this: void, kind: string): void {
      const pid = children.get(kind)?.pid;
      if (!pid) return;
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        logger.log('host.kill-failed', { kind, pid }, 'warn');
      }
    },
    stopAll(): void {
      for (const kind of Object.keys(entries)) {
        logger.log(kind === 'core' ? 'core.stop-requested' : 'host.stop-requested', { kind });
        supervisor.requestStop(kind);
      }
    },
  };
}
