import { startHost } from './host-runtime.ts';

startHost({
  kind: 'sample',
  entryUrl: import.meta.url,
  handlers: { echo: (input: { value: string }) => ({ type: 'echo', value: input.value }) },
});
