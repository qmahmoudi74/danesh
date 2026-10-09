import { CoreToHostSchema, HostPortSchema } from '@danesh/contracts/host-protocol.ts';
import { utf8ByteLength } from '@danesh/contracts/envelope.ts';
import { parentPort } from '@danesh/contracts/utility-port.ts';

parentPort().on('message', ({ data, ports }) => {
  if (!HostPortSchema.safeParse(data).success || !ports[0]) { console.error('Invalid host control message'); return; }
  const port = ports[0];
  port.on('message', ({ data: request }) => {
    const parsed = CoreToHostSchema.safeParse(request);
    if (!parsed.success) {
      const taskId = typeof request === 'object' && request !== null && 'taskId' in request && typeof request.taskId === 'string' && request.taskId.length ? request.taskId : 'invalid';
      let byteLength = 0;
      try { byteLength = utf8ByteLength(request); } catch { /* unserializable input is still rejected */ }
      // Core writes the record: metadata only, never the command body.
      port.postMessage({ type: 'rejected', schema: 'host-command', errorClass: 'InvalidMessage', byteLength });
      port.postMessage({ type: 'result', taskId, ok: false, errorClass: 'InvalidMessage' });
    } else if (parsed.data.type === 'hello') port.postMessage({ type: 'hello-ack', hostPid: process.pid, kind: 'sample' });
    else port.postMessage({ type: 'result', taskId: parsed.data.taskId, ok: true, output: parsed.data.input });
  });
  port.start();
  const timer = setInterval(() => port.postMessage({ type: 'heartbeat' }), 1000);
  timer.unref();
});
