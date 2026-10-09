import { describe, expect, it, vi } from 'vitest';
import { z } from '@danesh/contracts/schema.ts';
import type { RpcMethod } from '@danesh/contracts/rpc.ts';
import type { UtilityPort } from '@danesh/contracts/utility-port.ts';
import { createRpcServer, RpcHandlerError } from '../src/rpc-server.ts';

const methods: Record<string, RpcMethod> = {
  'fixture.write': { input: z.strictObject({ n: z.number().int() }), output: z.strictObject({ n: z.number().int() }), maxInputBytes: 64 },
  'fixture.broken': { input: z.strictObject({}), output: z.strictObject({ ok: z.literal(true) }), maxInputBytes: 64 },
};
function harness(ready = true) {
  const replies: unknown[] = [];
  const records: { event: string; fields: Record<string, unknown> }[] = [];
  const effects: number[] = [];
  const port: UtilityPort = { on: () => undefined, start: () => undefined, postMessage: (message) => replies.push(message) };
  const write = vi.fn((input: { n: number }) => { effects.push(input.n); return input; });
  const server = createRpcServer({
    methods, sender: 'renderer', ready: () => ready,
    logger: { log: (event, fields = {}) => records.push({ event, fields }) },
    handlers: { 'fixture.write': write, 'fixture.broken': () => ({ ok: false }) },
  });
  return { server, port, replies, records, effects, write };
}

describe('Core RPC server', () => {
  it('dispatches only validated requests, whatever their order relative to invalid ones', async () => {
    const { server, port, replies, effects, write } = harness();
    for (const request of [{ id: 1, method: 'fixture.write', input: { n: 'x' } }, { id: 2, method: 'fixture.write', input: { n: 1 } }, { id: 3, method: 'fixture.write ', input: { n: 2 } }, { id: 4, method: 'fixture.write', input: { n: 3 } }, { id: 5, method: 'fixture.write', input: { n: 4, extra: 1 } }]) await server.dispatch(port, request);
    expect(effects).toEqual([1, 3]); expect(write).toHaveBeenCalledTimes(2);
    expect(replies).toEqual([
      { id: 1, ok: false, error: { code: 'INVALID_INPUT', schema: 'fixture.write' } },
      { id: 2, ok: true, output: { n: 1 } },
      { id: 3, ok: false, error: { code: 'UNKNOWN_METHOD', schema: 'unknown-method' } },
      { id: 4, ok: true, output: { n: 3 } },
      { id: 5, ok: false, error: { code: 'INVALID_INPUT', schema: 'fixture.write' } },
    ]);
  });
  it('logs every rejection as metadata and answers envelope errors only when an id is known', async () => {
    const { server, port, replies, records } = harness();
    await server.dispatch(port, { method: 'fixture.write', input: { n: 1 } });
    await server.dispatch(port, { id: 9, input: { n: 1 } });
    await server.dispatch(port, 'not an object');
    expect(replies).toEqual([{ id: 9, ok: false, error: { code: 'INVALID_INPUT', schema: 'envelope' } }]);
    expect(records.map((record) => [record.event, record.fields.schema, record.fields.errorClass])).toEqual([['rpc.rejected', 'envelope', 'InvalidEnvelope'], ['rpc.rejected', 'envelope', 'InvalidEnvelope'], ['rpc.rejected', 'envelope', 'InvalidEnvelope']]);
    for (const record of records) expect(Object.keys(record.fields).sort()).toEqual(['byteLength', 'code', 'errorClass', 'schema', 'sender']);
  });
  it('answers UNAVAILABLE before Core is ready, and validates handler output', async () => {
    const notReady = harness(false);
    await notReady.server.dispatch(notReady.port, { id: 1, method: 'fixture.write', input: { n: 1 } });
    expect(notReady.replies).toEqual([{ id: 1, ok: false, error: { code: 'UNAVAILABLE' } }]); expect(notReady.effects).toEqual([]);
    const { server, port, replies } = harness();
    await server.dispatch(port, { id: 2, method: 'fixture.broken', input: {} });
    expect(replies).toEqual([{ id: 2, ok: false, error: { code: 'UNAVAILABLE' } }]);
  });
  it('maps typed handler errors and hides unexpected ones as INTERNAL', async () => {
    const replies: unknown[] = [];
    const port: UtilityPort = { on: () => undefined, start: () => undefined, postMessage: (message) => replies.push(message) };
    const server = createRpcServer({ methods, sender: 'renderer', ready: () => true, logger: { log: () => undefined }, handlers: { 'fixture.write': () => { throw new RpcHandlerError('READ_ONLY'); }, 'fixture.broken': () => { throw new TypeError('C:/secret/path'); } } });
    await server.dispatch(port, { id: 1, method: 'fixture.write', input: { n: 1 } });
    await server.dispatch(port, { id: 2, method: 'fixture.broken', input: {} });
    expect(replies).toEqual([{ id: 1, ok: false, error: { code: 'READ_ONLY' } }, { id: 2, ok: false, error: { code: 'INTERNAL' } }]);
  });
});
