import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { createDiagRejectedHandler, createRpcServer } from '../../../apps/core/src/rpc-server.ts';
import { createJsonlLogger } from '../../logging/src/jsonl.ts';
import { createRpcClient, type RpcClient } from '../src/client.ts';
import { utf8ByteLength, validateRequest } from '../src/envelope.ts';
import { type RpcMethod, rpcMethods } from '../src/rpc.ts';
import { z } from '../src/schema.ts';
import type { UtilityPort } from '../src/utility-port.ts';

const feature = await loadFeature(resolve('features/core/ipc-validation.feature'));
const TEXT_LIMIT = 64;
// A fixture contract with a free-text field, used where the real contract has none (byte-limit cases).
const methods: Record<string, RpcMethod> = {
  ...rpcMethods,
  'fixture.text': {
    input: z.strictObject({ text: z.string() }),
    output: z.strictObject({ length: z.number().int() }),
    maxInputBytes: TEXT_LIMIT,
  },
  'fixture.effect': {
    input: z.strictObject({ n: z.number().int() }),
    output: z.strictObject({ n: z.number().int() }),
    maxInputBytes: 64,
  },
};
const RECORD_KEYS = [
  'byteLength',
  'code',
  'errorClass',
  'event',
  'level',
  'process',
  'schema',
  'sender',
  'ts',
];

interface World {
  dir: string;
  logFile: string;
  client: RpcClient;
  posted: unknown[];
  replies: unknown[];
  effects: string[];
  dispatchCore: (raw: unknown) => Promise<void>;
  corePort: UtilityPort;
  handlerCalls: ReturnType<typeof vi.fn>;
}
function connect(
  options: { maxBytes?: number; maxFiles?: number; silentCore?: boolean } = {},
): World {
  const dir = mkdtempSync(join(tmpdir(), 'danesh-ipc-'));
  const logger = createJsonlLogger({
    dir: join(dir, 'logs'),
    name: 'core',
    ...(options.maxBytes ? { maxBytes: options.maxBytes } : {}),
    ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
  });
  const world = {
    dir,
    logFile: join(dir, 'logs', 'core.jsonl'),
    posted: [],
    replies: [],
    effects: [],
  } as unknown as World;
  const handlerCalls = vi.fn();
  world.handlerCalls = handlerCalls;
  const server = createRpcServer({
    methods,
    logger,
    sender: 'renderer',
    ready: () => true,
    handlers: {
      'system.ping': (input: { n: number }) => {
        handlerCalls('system.ping');
        return { ...input, corePid: process.pid };
      },
      'fixture.text': (input: { text: string }) => {
        handlerCalls('fixture.text');
        return { length: input.text.length };
      },
      'fixture.effect': (input: { n: number }) => {
        handlerCalls('fixture.effect');
        world.effects.push(`db:${input.n}`, `job:${input.n}`, `engine:${input.n}`);
        return input;
      },
      'diag.rejected': createDiagRejectedHandler(methods, logger),
    },
  });
  world.corePort = {
    on: () => undefined,
    start: () => undefined,
    postMessage: (message) => {
      world.replies.push(message);
      queueMicrotask(() => world.client.receive(message));
    },
  };
  world.dispatchCore = (raw) => server.dispatch(world.corePort, raw);
  world.client = createRpcClient({
    methods,
    events: {},
    onEvent: () => undefined,
    onReject: (rejection) => world.client.report(rejection),
  });
  world.client.attach((message) => {
    world.posted.push(message);
    if (!options.silentCore) void server.dispatch(world.corePort, message);
  });
  return world;
}
const records = (world: World) =>
  existsSync(world.logFile)
    ? readFileSync(world.logFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
const settle = () => new Promise((done) => setTimeout(done, 5));
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
};

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('A valid ping returns its integer and the Core process id', ({ Given, When, Then }) => {
    let world: World;
    let output: unknown;
    Given('a connected preload and Core using the closed RPC contract map', () => {
      world = connect();
    });
    When('the renderer calls "system.ping" with integer 42', async () => {
      output = await world.client.call('system.ping', { n: 42 });
    });
    Then('the response contains integer 42 and the Core process id', () => {
      expect(output).toEqual({ n: 42, corePid: process.pid });
    });
  });

  ScenarioOutline(
    'Method names must match the contract map exactly',
    ({ Given, When, Then, And }, variables) => {
      let world: World;
      let method: string;
      let codes: string[];
      Given('a connected preload and Core using the closed RPC contract map', () => {
        world = connect();
      });
      When('a request uses the method decoded from JSON <method_json>', async () => {
        method = JSON.parse(variables.method_json as string) as string;
        const preload = await codeOf(world.client.call(method, { n: 1 }));
        await world.dispatchCore({ id: 99, method, input: { n: 1 } });
        await settle();
        codes = [
          preload,
          (
            world.replies.find((reply) => (reply as { id: number }).id === 99) as {
              error: { code: string };
            }
          ).error.code,
        ];
      });
      Then('the request is rejected as UNKNOWN_METHOD', () => {
        expect(codes).toEqual(['UNKNOWN_METHOD', 'UNKNOWN_METHOD']);
        expect(world.handlerCalls).not.toHaveBeenCalled();
      });
      And('a local rejection record is written without the request body', () => {
        const rejected = records(world).filter((record) => record.event === 'rpc.rejected');
        expect(rejected.map((record) => [record.sender, record.schema, record.errorClass])).toEqual(
          [
            ['preload', 'unknown-method', 'UnknownMethod'],
            ['renderer', 'unknown-method', 'UnknownMethod'],
          ],
        );
        for (const record of rejected)
          expect(Object.keys(record).every((key) => RECORD_KEYS.includes(key))).toBe(true);
        if (method.trim()) expect(readFileSync(world.logFile, 'utf8')).not.toContain(`"${method}"`);
      });
    },
  );

  ScenarioOutline(
    'Required request fields are validated independently at both boundaries',
    ({ Given, When, Then, And }, variables) => {
      let world: World;
      let raw: Record<string, unknown>;
      const fixtures: Record<string, Record<string, unknown>> = {
        'a missing method': { id: 5, input: { n: 1 } },
        'a null input': { id: 5, method: 'system.ping', input: null },
        'an undefined input': { id: 5, method: 'system.ping' },
        'an empty input object requiring fields': { id: 5, method: 'system.ping', input: {} },
      };
      Given('a request fixture with <invalid_fields>', () => {
        world = connect();
        raw = fixtures[variables.invalid_fields as string]!;
        expect(raw).toBeDefined();
      });
      When('the request is submitted to the preload validator', async () => {
        const preloadView = validateRequest(raw, methods);
        expect(preloadView.ok).toBe(false);
        expect(await codeOf(world.client.call(raw.method as string, raw.input))).toBe(
          'INVALID_INPUT',
        );
      });
      Then('strict validation rejects it before sending', () => {
        // The only message that left the preload is the metadata-only rejection report.
        expect(
          world.posted.every(
            (message) => (message as { method: string }).method === 'diag.rejected',
          ),
        ).toBe(true);
      });
      When('the same request bypasses preload and reaches Core', async () => {
        await world.dispatchCore(raw);
      });
      Then('strict validation rejects it before dispatch', () => {
        expect(world.handlerCalls).not.toHaveBeenCalled();
        expect(world.replies.at(-1)).toMatchObject({
          id: 5,
          ok: false,
          error: { code: 'INVALID_INPUT' },
        });
      });
      And('the rejection record contains only schema name, sender and error class', async () => {
        await settle();
        const rejected = records(world).filter((record) => record.event === 'rpc.rejected');
        expect(rejected.map((record) => record.sender).sort()).toEqual(['preload', 'renderer']);
        for (const record of rejected) {
          expect(Object.keys(record).every((key) => RECORD_KEYS.includes(key))).toBe(true);
          expect(record).not.toHaveProperty('input');
        }
      });
    },
  );

  ScenarioOutline(
    'Invalid requests cause no handler side effects',
    ({ Given, When, Then, And }, variables) => {
      let world: World;
      Given('valid requests with recorded database, job and engine effects', () => {
        world = connect();
      });
      When('a schema-invalid request arrives <position> valid requests', async () => {
        const invalid = { id: 50, method: 'fixture.effect', input: { n: 'not-an-int' } };
        const valid = [
          { id: 1, method: 'fixture.effect', input: { n: 1 } },
          { id: 2, method: 'fixture.effect', input: { n: 2 } },
        ];
        const order = {
          before: [invalid, ...valid],
          between: [valid[0], invalid, valid[1]],
          after: [...valid, invalid],
        }[variables.position as 'before'];
        for (const request of order) await world.dispatchCore(request);
      });
      Then(
        'no database write, job creation or engine call is attributable to the invalid request',
        () => {
          expect(world.effects.some((effect) => effect.endsWith(':not-an-int'))).toBe(false);
          expect(world.replies.find((reply) => (reply as { id: number }).id === 50)).toMatchObject({
            ok: false,
            error: { code: 'INVALID_INPUT' },
          });
        },
      );
      And('valid requests retain their expected effects', () => {
        expect(world.effects).toEqual(['db:1', 'job:1', 'engine:1', 'db:2', 'job:2', 'engine:2']);
      });
    },
  );

  Scenario(
    'Payload limits count serialized UTF-8 bytes and are enforced by Core',
    ({ Given, And, When, Then }) => {
      let world: World;
      let atLimit: { text: string };
      let over: { text: string };
      const results: Record<string, string[]> = {};
      Given(
        "schema-valid payload fixtures at a contract method's declared maximum UTF-8 byte size and one byte over",
        () => {
          world = connect();
          const envelopeBytes = utf8ByteLength({ text: '' });
          const persianLetters = Math.floor((TEXT_LIMIT - envelopeBytes) / 2);
          atLimit = {
            text:
              'ا'.repeat(persianLetters) +
              'a'.repeat(TEXT_LIMIT - envelopeBytes - persianLetters * 2),
          };
          over = { text: atLimit.text + 'a' };
          expect(utf8ByteLength(atLimit)).toBe(TEXT_LIMIT);
          expect(utf8ByteLength(over)).toBe(TEXT_LIMIT + 1);
        },
      );
      And('the fixtures contain multi-byte Persian text', () => {
        expect(atLimit.text).toMatch(/[؀-ۿ]/);
      });
      When('each fixture is submitted through preload and directly to Core', async () => {
        for (const [name, input] of [
          ['atLimit', atLimit],
          ['over', over],
        ] as const) {
          const preload = await codeOf(world.client.call('fixture.text', input));
          await world.dispatchCore({ id: 70, method: 'fixture.text', input });
          const core = world.replies.at(-1) as { ok: boolean; error?: { code: string } };
          results[name] = [preload, core.ok ? 'ok' : core.error!.code];
        }
      });
      Then('the payload exactly at the limit is accepted at both boundaries', () => {
        expect(results.atLimit).toEqual(['ok', 'ok']);
      });
      And('the payload one byte over is rejected as PAYLOAD_TOO_LARGE at both boundaries', () => {
        expect(results.over).toEqual(['PAYLOAD_TOO_LARGE', 'PAYLOAD_TOO_LARGE']);
      });
      And(
        'the measured size equals serialized UTF-8 bytes rather than JavaScript string length',
        () => {
          expect(utf8ByteLength(over)).toBe(Buffer.byteLength(JSON.stringify(over), 'utf8'));
          expect(JSON.stringify(over).length).toBeLessThan(TEXT_LIMIT);
        },
      );
    },
  );

  Scenario('Rejection logs exclude Unicode payload content', ({ Given, When, Then, And }) => {
    let world: World;
    const payload = 'دانش‌آموز‮⁦\ud800';
    Given(
      'an invalid payload containing Persian text, ZWNJ U+200C, bidi control characters and a lone UTF-16 surrogate',
      () => {
        world = connect();
      },
    );
    When('Core rejects the payload', async () => {
      await world.dispatchCore({ id: 3, method: 'system.ping', input: { n: payload } });
      expect(world.replies.at(-1)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    });
    Then(
      'its rejection record contains only schema name, sender, error class and payload byte length',
      () => {
        const [record] = records(world);
        expect(record).toMatchObject({
          event: 'rpc.rejected',
          schema: 'system.ping',
          sender: 'renderer',
          errorClass: 'SchemaMismatch',
          byteLength: utf8ByteLength({ n: payload }),
        });
        expect(Object.keys(record!).every((key) => RECORD_KEYS.includes(key))).toBe(true);
      },
    );
    And('the log contains neither the payload characters nor their escaped representations', () => {
      const text = readFileSync(world.logFile, 'utf8');
      expect(text).not.toMatch(/[؀-ۿ‌‮⁦]/);
      for (const escaped of ['\\u200c', '\\u202e', '\\u2066', '\\ud800', '\\u062f', 'دانش'])
        expect(text.toLowerCase()).not.toContain(escaped);
    });
  });

  Scenario('Rejection leaves the connection usable', ({ Given, When, And, Then }) => {
    let world: World;
    let output: unknown;
    Given('a connected preload and Core using the closed RPC contract map', () => {
      world = connect();
    });
    When('an invalid request is rejected', async () => {
      await world.client.callUnchecked('system.ping', { n: 'x' }).catch(() => undefined);
      expect(world.replies.at(-1)).toMatchObject({ ok: false });
    });
    And('a valid "system.ping" request is sent on the same connection', async () => {
      output = await world.client.call('system.ping', { n: 8 });
    });
    Then('the valid ping is answered successfully', () => {
      expect(output).toEqual({ n: 8, corePid: process.pid });
    });
  });

  Scenario('Closing the Core connection settles pending calls', ({ Given, When, Then, And }) => {
    let world: World;
    let calls: Promise<string>[];
    Given('unresolved calls on the private Core connection', () => {
      world = connect({ silentCore: true });
      calls = [1, 2, 3].map((n) => codeOf(world.client.call('system.ping', { n }, 60_000)));
    });
    When('the Core connection closes', async () => {
      await settle();
      expect(world.client.pendingCount).toBe(3);
      world.client.close();
    });
    Then('every pending call fails with UNAVAILABLE', async () => {
      expect(await Promise.all(calls)).toEqual(['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE']);
    });
    And('no pending call remains unresolved', async () => {
      expect(world.client.pendingCount).toBe(0);
      expect(await codeOf(world.client.call('system.ping', { n: 4 }, 50))).toBe('UNAVAILABLE');
    });
  });

  Scenario(
    'Local rejection logs rotate within their configured bounds',
    ({ Given, When, Then, And }) => {
      let world: World;
      Given('a library with configured log size and file-count limits', () => {
        world = connect({ maxBytes: 2048, maxFiles: 3 });
      });
      When('enough invalid requests are rejected to trigger log rotation', async () => {
        for (let id = 1; id <= 120; id++)
          await world.dispatchCore({ id, method: 'system.ping', input: { n: `دانش-${id}` } });
      });
      Then(
        'rejection records are stored under the library in "logs/core.jsonl" and its rotated files',
        () => {
          expect(readdirSync(join(world.dir, 'logs')).sort()).toEqual([
            'core.1.jsonl',
            'core.2.jsonl',
            'core.jsonl',
          ]);
        },
      );
      And('rotation respects the configured size threshold and maximum file count', () => {
        for (const file of readdirSync(join(world.dir, 'logs')))
          expect(statSync(join(world.dir, 'logs', file)).size).toBeLessThanOrEqual(2048);
      });
      And('the records contain no payload bodies', () => {
        for (const file of readdirSync(join(world.dir, 'logs')))
          expect(readFileSync(join(world.dir, 'logs', file), 'utf8')).not.toMatch(
            /دانش|\\u062f|"input"/,
          );
      });
    },
  );
});
