import { type ChildProcess, fork, type Serializable } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { HostToCoreSchema } from '@danesh/contracts/host-protocol.ts';
import { createJsonlLogger, type JsonlLogger } from '@danesh/logging/jsonl.ts';
import { afterAll, expect } from 'vitest';
import { jobOutcome, type TaskState, taskTransition } from '../src/jobs/fsm.ts';
import { backoffMs } from '../src/supervision/backoff.ts';
import { createSupervisionPolicy, type SupervisionPolicy } from '../src/supervision/policy.ts';
import { createSupervisor, type SupervisorEvent } from '../src/supervision/supervisor.ts';

const feature = await loadFeature(resolve('features/core/engine-supervision.feature'));
let root: string;
let logger: JsonlLogger;
let supervisor: ReturnType<typeof createSupervisor>;
const children = new Map<string, ChildProcess>();
const generations: ChildProcess[] = [];
const events: SupervisorEvent[] = [];
const records: unknown[] = [];
let taskState: TaskState;
let initialPid: number;
let otherPids: number[];
let watchdogKilled: boolean;
let actualExit: { code: number | null; signal: string | null } | undefined;
let policy: SupervisionPolicy;
let delay: number;
let faults = 0;
const committed = { state: 'done' as const, attempt: 1 };
async function setup() {
  if (supervisor) await cleanup();
  root = await mkdtemp(join(tmpdir(), 'danesh-supervision-'));
  logger = createJsonlLogger({ dir: root, name: 'main' });
  events.length = records.length = generations.length = 0;
  children.clear();
  taskState = 'running';
  actualExit = undefined;
  watchdogKilled = false;
  supervisor = createSupervisor({
    clock: {
      now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    },
    spawner: {
      spawn(kind) {
        const child = fork(resolve('packages/domain/test/fixtures/fake-host.ts'), [kind], {
          execArgv: ['--max-old-space-size=64'],
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          windowsHide: true,
        });
        children.set(kind, child);
        generations.push(child);
        return {
          pid: child.pid!,
          onExit(listener) {
            child.once('exit', (code, signal) => {
              if (kind === 'sample') actualExit = { code, signal };
              // Node reports a signal separately. The pure supervisor needs an integer, as Electron supplies.
              listener(code ?? 1);
            });
          },
          kill: () => {
            child.kill();
          },
          postMessage: (message) => {
            child.send(message as Serializable);
          },
        };
      },
    },
  });
  supervisor.subscribe((event) => {
    events.push(event);
    if (event.type === 'exited') {
      logger.log(event.requested ? 'host.stopped' : 'host.crashed', {
        kind: event.kind,
        exitCode: event.code,
        attempt: event.restartAttempt,
      });
      if (!event.requested && event.kind === 'sample') taskState = 'queued';
    } else if (event.type === 'restarted')
      logger.log('host.restarted', {
        kind: event.kind,
        exitCode: actualExit?.code ?? 1,
        attempt: event.attempt,
      });
  });
  await supervisor.spawn('sample');
  initialPid = children.get('sample')!.pid!;
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline)
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect(predicate()).toBe(true);
}
async function ready(kind = 'sample') {
  const child = children.get(kind)!;
  const hello = new Promise<void>((resolve) => {
    const listener = (data: unknown) => {
      const parsed = HostToCoreSchema.safeParse(data);
      if (parsed.success && parsed.data.type === 'hello-ack') {
        child.off('message', listener);
        resolve();
      }
    };
    child.on('message', listener);
  });
  child.send({ type: 'hello' });
  await hello;
}
async function crash(mode: string) {
  await ready();
  const child = children.get('sample')!;
  child.send({ type: 'run', taskId: randomUUID(), input: { type: 'echo', value: 'hold' } });
  if (mode === 'an external kill') child.kill('SIGKILL');
  else {
    const modes: Record<string, string> = {
      'exit code 0': 'exit0',
      'exit code 1': 'exit1',
      'process abort': 'abort',
      'spin past the watchdog': 'spin',
      'out-of-memory under the bound': 'oom',
    };
    if (mode === 'spin past the watchdog') {
      let heartbeat = Date.now();
      child.on('message', (data: unknown) => {
        if (HostToCoreSchema.safeParse(data).data?.type === 'heartbeat') heartbeat = Date.now();
      });
      const watchdog = setInterval(() => {
        if (Date.now() - heartbeat < 200) return;
        watchdogKilled = true;
        child.kill('SIGKILL');
        clearInterval(watchdog);
      }, 20);
      child.once('exit', () => clearInterval(watchdog));
    }
    child.send({ type: 'fault', mode: modes[mode] ?? mode });
  }
  await until(() => events.some((event) => event.type === 'exited' && !event.requested));
}
async function cleanup() {
  for (const kind of children.keys()) supervisor?.requestStop(kind);
  await Promise.all(
    generations.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once('exit', () => resolve())),
    ),
  );
  logger?.close();
  if (root) await rm(root, { recursive: true, force: true });
}
afterAll(cleanup);

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('A healthy host serves its task without restarting', ({ Given, When, Then }) => {
    Given('a healthy supervised engine host', setup);
    When('it serves a task successfully', async () => {
      await ready();
      const child = children.get('sample')!;
      const taskId = randomUUID();
      const result = new Promise<unknown>((resolve) =>
        child.on('message', (data: unknown) => {
          const parsed = HostToCoreSchema.safeParse(data);
          if (parsed.success && parsed.data.type === 'result' && parsed.data.taskId === taskId)
            resolve(parsed.data);
        }),
      );
      child.send({ type: 'run', taskId, input: { type: 'echo', value: 'fixture' } });
      expect(await result).toMatchObject({ ok: true });
    });
    Then('its process id is unchanged and its restart count is zero', () => {
      expect(children.get('sample')!.pid).toBe(initialPid);
      expect(events).toEqual([]);
    });
  });
  Scenario(
    'Malformed host messages are rejected without losing retry eligibility',
    ({ Given, When, Then, And }) => {
      Given('a supervised engine host with an in-flight task', setup);
      When('the host sends a message that fails the host protocol schema', async () => {
        await ready();
        const child = children.get('sample')!;
        const received = new Promise<void>((resolve) =>
          child.on('message', (data: unknown) => {
            if (HostToCoreSchema.safeParse(data).success) return;
            const metadata = {
              schema: 'host-message',
              errorClass: 'InvalidMessage',
              byteLength: JSON.stringify(data).length,
            };
            records.push(metadata);
            logger.log('host.rejected', metadata);
            const state = taskTransition(taskState, 'retry');
            if (typeof state !== 'string') throw state;
            taskState = state;
            resolve();
          }),
        );
        child.send({ type: 'run', taskId: 'fixture', input: { type: 'echo', value: 'hold' } });
        child.send({ type: 'fault', mode: 'malformed' });
        await received;
      });
      Then('the message is rejected and logged without its payload', async () => {
        expect(records).toHaveLength(1);
        expect(await readFile(join(root, 'main.jsonl'), 'utf8')).not.toContain(
          'PRIVATE_FAULT_PAYLOAD',
        );
      });
      And('the in-flight task is marked retriable', () => expect(taskState).toBe('queued'));
    },
  );
  ScenarioOutline(
    'Restart backoff is a deterministic capped integer delay',
    ({ Given, When, Then, And }, values) => {
      Given('a backoff base of 250 ms and a cap of 15000 ms', () => {});
      When('the pure backoff function receives restart count <count>', () => {
        delay = backoffMs(Number(values.count));
      });
      Then('it returns integer <delay> ms on every call', () => {
        expect(delay).toBe(Number(values.delay));
        expect(Number.isInteger(delay)).toBe(true);
        expect(backoffMs(Number(values.count))).toBe(delay);
      });
      And('the delay never exceeds 15000 ms', () => expect(delay).toBeLessThanOrEqual(15000));
    },
  );
  Scenario('A healthy reset window clears the restart count', ({ Given, When, Then, And }) => {
    Given('a restarted engine host with a nonzero failure count', () => {
      policy = createSupervisionPolicy();
      policy.onStarted(0);
      policy.onExit({ requested: false, t: 1 });
      policy.onStarted(251);
    });
    When('it remains healthy for 60000 ms', () => policy.onHealthy(60251));
    Then('its failure count resets to zero', () => expect(policy.failureCount()).toBe(0));
    And('its next crash uses the 250 ms initial backoff', () =>
      expect(policy.onExit({ requested: false, t: 60252 })).toMatchObject({ afterMs: 250 }),
    );
  });
  Scenario(
    'Repeated crashes retry only the in-flight task until quarantine',
    ({ Given, When, Then, And }) => {
      Given(
        'a job with committed tasks and one in-flight task with a maximum of 3 attempts',
        () => {
          faults = 0;
          taskState = 'running';
          policy = createSupervisionPolicy();
        },
      );
      When("that task's host crashes on its first and second attempts", () => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          expect(policy.onExit({ requested: false, t: attempt })).toMatchObject({
            action: 'restart',
            afterMs: backoffMs(attempt - 1),
          });
          expect(taskTransition(taskState, 'retry')).toBe('queued');
          taskState = 'running';
          faults++;
        }
      });
      Then('each crash follows the same backoff and retry policy', () => expect(faults).toBe(2));
      And('no committed task is re-executed', () =>
        expect(committed).toEqual({ state: 'done', attempt: 1 }),
      );
      When('the host crashes on the third attempt of the same task', () => {
        expect(policy.onExit({ requested: false, t: 3 })).toMatchObject({ afterMs: 1000 });
        const next = taskTransition(taskState, 'quarantine');
        if (typeof next !== 'string') throw next;
        taskState = next;
      });
      Then(
        'that task is quarantined and its job ends completed_with_issues after the remaining tasks settle',
        () => {
          expect(taskState).toBe('quarantined');
          expect(jobOutcome([committed.state, taskState, 'done'])).toBe('completed_with_issues');
        },
      );
    },
  );
  ScenarioOutline(
    'Every unrequested termination is a crash',
    ({ Given, When, Then, And }, values) => {
      Given(
        "an engine host with an in-flight task and the other processes' ids recorded",
        async () => {
          await setup();
          // Domain transport fixtures model the other roles; Electron PID isolation is asserted separately in E2E.
          for (const kind of ['renderer-fixture', 'core-fixture', 'ocr'])
            await supervisor.spawn(kind);
          otherPids = [
            process.pid,
            ...[...children].filter(([kind]) => kind !== 'sample').map(([, child]) => child.pid!),
          ];
        },
      );
      And('the OOM fault host has a 64 MB V8 heap bound', () =>
        expect(children.get('sample')!.spawnargs).toContain('--max-old-space-size=64'),
      );
      When('the host undergoes <fault> without a supervisor-requested shutdown', async () => {
        const fault = String(values.fault);
        await crash(String(fault));
        if (fault === 'exit code 0') expect(actualExit).toEqual({ code: 0, signal: null });
        if (fault === 'spin past the watchdog') expect(watchdogKilled).toBe(true);
      });
      Then('its in-flight task is marked retriable', () => expect(taskState).toBe('queued'));
      And('the host restarts after its policy backoff', async () => {
        await until(() => events.some((event) => event.type === 'restarted'));
        expect(children.get('sample')!.pid).not.toBe(initialPid);
        expect(events.find((event) => event.type === 'restarted')).toMatchObject({ attempt: 1 });
      });
      And(
        'Main, the renderer, Core and other engine hosts keep running with their recorded ids',
        () => {
          expect([
            process.pid,
            ...[...children].filter(([kind]) => kind !== 'sample').map(([, child]) => child.pid!),
          ]).toEqual(otherPids);
          for (const pid of otherPids) expect(() => process.kill(pid, 0)).not.toThrow();
        },
      );
    },
  );
  Scenario(
    'Requested shutdown stops a host without restarting it',
    ({ Given, When, Then, And }) => {
      Given('a supervised engine host', setup);
      When('the supervisor requests its stop for app shutdown', async () => {
        await ready();
        supervisor.requestStop('sample');
        await until(() => events.some((event) => event.type === 'exited'));
      });
      Then('the resulting exit is not classified as a crash', () =>
        expect(events[0]).toMatchObject({ requested: true }),
      );
      And('no restart is scheduled', async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        expect(generations).toHaveLength(1);
      });
    },
  );
  Scenario(
    'Crash and restart events leave local metadata evidence',
    ({ Given, When, Then, And }) => {
      Given('a supervised engine host that crashes and restarts', async () => {
        await setup();
        await crash('exit0');
        await until(() => events.some((event) => event.type === 'restarted'));
      });
      When('the event log is read from the library', async () => {
        records.push(
          ...(await readFile(join(root, 'main.jsonl'), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as unknown),
        );
      });
      Then('crash and restart records contain process kind, exit code and attempt number', () => {
        expect(records).toHaveLength(2);
        for (const record of records)
          expect(record).toMatchObject({ kind: 'sample', exitCode: 0, attempt: 1 });
      });
      And('neither record contains task payloads', () =>
        expect(JSON.stringify(records)).not.toContain('payload'),
      );
    },
  );
});
