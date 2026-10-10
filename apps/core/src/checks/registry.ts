import type { Init } from '@danesh/contracts/control.ts';
import { CHECK_ORDER, type CheckResult } from '@danesh/contracts/smoke-report.ts';
import type { LibraryOpen } from '@danesh/storage/db.ts';
import type { EngineClient } from '../engine-client.ts';

export type CheckContext = {
  init: Init;
  library: LibraryOpen | undefined;
  rendererConnected: boolean;
  engines: EngineClient;
  responsiveness: (
    timeoutMs: number,
  ) => Promise<{ intervalMs: number; samplesMs: number[] } | undefined>;
};
/**
 * applies() decides up front whether a check belongs in this run (a non-applicable check is never listed, never shown
 * as passed). run() returning null is the same verdict reached late and is likewise omitted.
 */
export type Check = {
  id: CheckResult['checkId'];
  group?: 'engines';
  applies?: (init: Init) => boolean;
  run(context: CheckContext): CheckResult | null | Promise<CheckResult | null>;
};
const modules = import.meta.glob<{ check: Check }>('./*.check.ts', { eager: true });
export const checks = Object.values(modules)
  .map((module) => module.check)
  .sort(
    (a, b) =>
      (CHECK_ORDER as readonly string[]).indexOf(a.id) -
      (CHECK_ORDER as readonly string[]).indexOf(b.id),
  );
