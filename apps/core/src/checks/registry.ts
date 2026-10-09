import { CHECK_ORDER, type CheckResult } from '@danesh/contracts/smoke-report.ts';
import type { Init } from '@danesh/contracts/control.ts';
import type { Db } from '@danesh/storage/db.ts';

export type CheckContext = { init: Init; db: Db; rendererConnected: boolean };
export type Check = { id: CheckResult['checkId']; run(context: CheckContext): CheckResult | null };
const modules = import.meta.glob<{ check: Check }>('./*.check.ts', { eager: true });
export const checks = Object.values(modules).map((module) => module.check).sort((a, b) => CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id));
