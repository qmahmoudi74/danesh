import type { CheckResult } from '@danesh/contracts/smoke-report.ts';
import type { Check } from './registry.ts';

const PAYLOAD = Buffer.from('danesh cas check v1', 'utf8');
export const check: Check = {
  id: 'cas-storage',
  async run({ library, cas }): Promise<CheckResult> {
    if (library?.state !== 'ready' || !cas) {
      return {
        checkId: 'cas-storage',
        status: 'fail',
        durationMs: 0,
        detail:
          'نوشتن در پوشهٔ داده‌های برنامه انجام نشد. فضای خالی دیسک و دسترسی به پوشه را بررسی کنید.',
        fields: { libraryState: library?.state ?? 'unavailable' },
      };
    }
    try {
      const result = await cas.put(PAYLOAD);
      if (!(await cas.get(result.sha256)).equals(PAYLOAD))
        throw new Error('CAS read-back mismatch');
      return {
        checkId: 'cas-storage',
        status: 'pass',
        durationMs: 0,
        detail: 'نوشتن و خواندن فایل در پوشهٔ داده‌های برنامه درست کار می‌کند.',
        fields: {
          sha256: result.sha256,
          size: result.size,
          existed: result.existed,
          shard: result.sha256.slice(0, 2),
        },
      };
    } catch (error) {
      return {
        checkId: 'cas-storage',
        status: 'fail',
        durationMs: 0,
        detail:
          'نوشتن در پوشهٔ داده‌های برنامه انجام نشد. فضای خالی دیسک و دسترسی به پوشه را بررسی کنید.',
        fields: { errorClass: error instanceof Error ? error.name : 'Error' },
      };
    }
  },
};
