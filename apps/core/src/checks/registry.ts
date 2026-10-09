import { CHECK_ORDER, type CheckResult } from '@danesh/contracts/smoke-report.ts';
import type { Init } from '@danesh/contracts/control.ts';
import type { Db } from '@danesh/storage/db.ts';

export type CheckContext = { init: Init; db: Db; rendererConnected: boolean };
/**
 * applies() decides up front whether a check belongs in this run (a non-applicable check is never listed, never shown
 * as passed). run() returning null is the same verdict reached late and is likewise omitted.
 */
export type Check = { id: CheckResult['checkId']; applies?: (init: Init) => boolean; run(context: CheckContext): CheckResult | null | Promise<CheckResult | null> };
const modules = import.meta.glob<{ check: Check }>('./*.check.ts', { eager: true });
export const checks = Object.values(modules).map((module) => module.check).sort((a, b) => (CHECK_ORDER as readonly string[]).indexOf(a.id) - (CHECK_ORDER as readonly string[]).indexOf(b.id));
