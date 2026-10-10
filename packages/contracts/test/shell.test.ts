import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rpcMethods } from '../src/rpc.ts';
import { shellEventPayloads, shellMethods } from '../src/shell.ts';
import { testRpcMethods } from '../src/test-rpc.ts';

describe('closed shell and export contracts', () => {
  it('requires a bounded logs path only for failed Core state', () => {
    const schema = shellEventPayloads['shell.coreState']!;
    expect(schema.safeParse({ state: 'failed' }).success).toBe(false);
    expect(schema.safeParse({ state: 'failed', logsDir: 'C:/library/logs' }).success).toBe(true);
    expect(schema.safeParse({ state: 'ready', logsDir: 'C:/library/logs' }).success).toBe(false);
    expect(schema.safeParse({ state: 'failed', logsDir: 'x'.repeat(32768) }).success).toBe(false);
  });
  it('never accepts a renderer-supplied path', () => {
    expect(
      shellMethods['shell.chooseExportPath']!.input.safeParse({ path: 'C:/target.json' }).success,
    ).toBe(false);
    expect(
      rpcMethods['systemCheck.export']!.input.safeParse({
        runId: randomUUID(),
        token: randomUUID(),
        path: 'C:/target.json',
      }).success,
    ).toBe(false);
  });
  it('accepts silent cancel and rejects arbitrary routes and states', () => {
    expect(shellMethods['shell.chooseExportPath']!.output.safeParse({ token: null }).success).toBe(
      true,
    );
    expect(
      shellEventPayloads['shell.navigate']!.safeParse({ route: 'https://example.com' }).success,
    ).toBe(false);
    expect(shellEventPayloads['shell.coreState']!.safeParse({ state: 'unknown' }).success).toBe(
      false,
    );
  });
  it('bounds test-only stall controls and rejects fractional durations', () => {
    for (const ms of [-1, 0.5, 60001])
      expect(testRpcMethods['test.coreStall']!.input.safeParse({ ms }).success).toBe(false);
    expect(testRpcMethods['test.coreStall']!.input.safeParse({ ms: 60000 }).success).toBe(true);
  });
});
