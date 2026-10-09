import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import { app, type Session, session } from 'electron';
import { shouldBlockRequest } from './policy/web-preferences.ts';

let blocked = 0;
const guarded = new WeakSet<Session>();

/** Count of Chromium requests cancelled so far; the egress-zero check reads it (Plan 01-15). */
export function getChromiumBlockedCount(): number {
  return blocked;
}

function guard(
  target: Session,
  logger: Pick<JsonlLogger, 'log'>,
  devUrl: string | undefined,
): void {
  if (guarded.has(target)) return;
  guarded.add(target);
  target.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (details, respond) => {
      const decision = shouldBlockRequest(details.url, devUrl);
      if (decision.block) {
        blocked++;
        logger.log('egress.blocked', { host: decision.host, count: blocked }, 'warn');
      }
      respond({ cancel: decision.block });
    },
  );
  target.setSpellCheckerEnabled(false);
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
}

/**
 * Layer L1 of the default-deny egress policy (D-17): Chromium may not reach the network from any session. Only the host
 * of a blocked request is logged, never its path or query. Install before the first window exists.
 */
export function installChromiumEgressBlock(
  logger: Pick<JsonlLogger, 'log'>,
  devUrl: string | undefined,
): void {
  guard(session.defaultSession, logger, devUrl);
  app.on('session-created', (created) => guard(created, logger, devUrl));
}
