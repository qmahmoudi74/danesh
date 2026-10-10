import 'vite/client';
import type { DaneshApi } from '../packages/contracts/src/rpc.ts';

declare global {
  const __TEST_HOOKS__: boolean;
  interface Window {
    danesh: DaneshApi;
  }
}
