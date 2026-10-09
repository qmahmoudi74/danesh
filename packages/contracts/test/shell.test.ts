import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { shellMethods, shellEventPayloads } from '../src/shell.ts';
import { rpcMethods } from '../src/rpc.ts';
import { testRpcMethods } from '../src/test-rpc.ts';
describe('closed shell and export contracts', () => {
  it('never accepts a renderer-supplied path', () => {
    expect(shellMethods['shell.chooseExportPath']!.input.safeParse({ path: 'C:/target.json' }).success).toBe(false);
    expect(rpcMethods['systemCheck.export']!.input.safeParse({ runId: randomUUID(), token: randomUUID(), path: 'C:/target.json' }).success).toBe(false);
  });
  it('accepts silent cancel and rejects arbitrary routes and states', () => {
    expect(shellMethods['shell.chooseExportPath']!.output.safeParse({ token: null }).success).toBe(true);
    expect(shellEventPayloads['shell.navigate']!.safeParse({ route: 'https://example.com' }).success).toBe(false);
    expect(shellEventPayloads['shell.coreState']!.safeParse({ state: 'unknown' }).success).toBe(false);
  });
  it('bounds test-only stall controls and rejects fractional durations', () => {
    for (const ms of [-1, 0.5, 60001]) expect(testRpcMethods['test.coreStall']!.input.safeParse({ ms }).success).toBe(false);
    expect(testRpcMethods['test.coreStall']!.input.safeParse({ ms: 60000 }).success).toBe(true);
  });
});
