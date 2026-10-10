export type FaultMode = 'crash' | 'exit0' | 'exit1' | 'abort' | 'spin' | 'oom' | 'malformed';

/** The entire executable fault table is eliminated when __TEST_HOOKS__ is false. */
export const faults = __TEST_HOOKS__
  ? {
      execute(mode: FaultMode): never {
        console.error('DANESH_TEST_FAULTS_SENTINEL', mode);
        if (mode === 'exit0') process.exit(0);
        if (mode === 'exit1' || mode === 'crash') process.exit(1);
        if (mode === 'abort') process.abort();
        if (mode === 'spin') {
          for (;;) {
            // An observable call keeps Rollup from eliminating the deliberately endless loop.
            process.hrtime.bigint();
          }
        }
        if (mode === 'oom') {
          if (process.env.DANESH_TEST_HOST_HEAP_MB !== '64') throw new Error('FaultHeapNotBounded');
          const retained: number[][] = [];
          for (;;) retained.push(new Array<number>(65536).fill(retained.length));
        }
        throw new Error('InvalidFaultMode');
      },
    }
  : undefined;
