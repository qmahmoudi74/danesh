import { CoreToMainSchema } from '@danesh/contracts/control.ts';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import type { HostKind } from '@danesh/contracts/host-protocol.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';

export interface CoreControlHandlers {
  ready: (corePid: number) => void;
  spawnHost: (kind: HostKind) => void;
  stopHost: (kind: HostKind) => void;
  exportTargetReady: (token: string) => void;
}

/** Main is the receiver of Core's control channel: every message is strictly validated, invalid ones are logged and dropped. */
export function handleCoreControl(
  message: unknown,
  handlers: CoreControlHandlers,
  logger: Pick<JsonlLogger, 'log'>,
): void {
  const parsed = CoreToMainSchema.safeParse(message);
  if (!parsed.success) {
    let byteLength = 0;
    try {
      byteLength = utf8ByteLength(message);
    } catch {
      /* still rejected */
    }
    logger.log(
      'control.rejected',
      { schema: 'core-control', sender: 'core', errorClass: 'InvalidMessage', byteLength },
      'warn',
    );
    return;
  }
  const control = parsed.data;
  if (control.type === 'ready') handlers.ready(control.corePid);
  else if (control.type === 'export-target-ready') handlers.exportTargetReady(control.token);
  else if (control.type === 'stop-host') handlers.stopHost(control.kind);
  else handlers.spawnHost(control.kind);
}
