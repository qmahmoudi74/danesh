// Plain Node fixture, never bundled into the app. The parent owns its heap bound and lifetime.
const kind = process.argv[2] ?? 'sample';
let taskId = 'none';
setInterval(() => process.send?.({ type: 'heartbeat' }), 20).unref();
process.on('message', (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  if (message.type === 'hello') {
    process.send?.({ type: 'hello-ack', kind, hostPid: process.pid });
  } else if (message.type === 'run' && 'taskId' in message && typeof message.taskId === 'string') {
    taskId = message.taskId;
    if (
      'input' in message &&
      typeof message.input === 'object' &&
      message.input !== null &&
      'value' in message.input &&
      message.input.value !== 'hold'
    )
      process.send?.({ type: 'result', taskId, ok: true, output: message.input });
  } else if (message.type === 'fault' && 'mode' in message) {
    const mode = message.mode;
    if (mode === 'malformed') {
      process.send?.({ type: 'result', taskId, ok: true, payload: 'PRIVATE_FAULT_PAYLOAD' });
      return;
    }
    if (mode === 'exit0') process.exit(0);
    if (mode === 'exit1') process.exit(1);
    if (mode === 'abort') process.abort();
    if (mode === 'spin')
      for (;;) {
        /* Test watchdog must terminate this child. */
      }
    if (mode === 'oom') {
      const retained: number[][] = [];
      for (;;) retained.push(new Array<number>(65536).fill(retained.length));
    }
  }
});
