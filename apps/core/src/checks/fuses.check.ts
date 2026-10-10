import { compareFuses, fuseBinaryPath, PRODUCTION_FUSES, readFuseWire } from './fuse-wire.ts';
import type { Check } from './registry.ts';

/**
 * Verifies the packaged binary carries the D-09 production fuse set. An unpackaged development run uses the stock
 * Electron binary, which has no Danesh fuses to verify, so the row is omitted there rather than shown as a fake pass
 * or a meaningless failure. The packaged test build intentionally fails it (inspect fuse on).
 */
export const check: Check = {
  id: 'fuses',
  applies: (init) => init.packaged,
  async run({ init }) {
    const fields: Record<string, string | boolean> = {
      binary: fuseBinaryPath(init.exePath, init.platform),
    };
    let wire: Awaited<ReturnType<typeof readFuseWire>>;
    try {
      wire = await readFuseWire(fields.binary as string);
    } catch {
      return {
        checkId: 'fuses',
        status: 'fail',
        durationMs: 0,
        detail: 'fuse wire unreadable',
        fields,
      };
    }
    if (!wire)
      return {
        checkId: 'fuses',
        status: 'fail',
        durationMs: 0,
        detail: 'fuse sentinel not found',
        fields,
      };
    for (const name of Object.keys(PRODUCTION_FUSES))
      fields[name] = String(wire[name as keyof typeof wire] ?? 'missing');
    const differing = compareFuses(wire);
    if (differing.length) fields.differing = differing.join(',');
    return {
      checkId: 'fuses',
      status: differing.length ? 'fail' : 'pass',
      durationMs: 0,
      detail: differing.length
        ? `differs from D-09: ${differing.join(', ')}`
        : 'D-09 production fuses set',
      fields,
    };
  },
};
