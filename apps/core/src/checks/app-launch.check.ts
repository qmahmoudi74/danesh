import type { Check } from './registry.ts';

export const check: Check = {
  id: 'app-launch',
  run({ init, rendererConnected }) {
    return { checkId: 'app-launch', status: rendererConnected ? 'pass' : 'fail', durationMs: 0, detail: 'برنامه به‌درستی باز شد.', fields: { corePid: process.pid, mainPid: init.mainPid, appVersion: init.appVersion } };
  },
};
