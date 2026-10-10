import { type SampleJobSnapshot, SampleJobSnapshotSchema } from '@danesh/contracts/jobs.ts';
import { eventPayloads } from '@danesh/contracts/rpc.ts';
import { shellEventPayloads } from '@danesh/contracts/shell.ts';
import { useEffect, useRef, useState } from 'react';

/** Home and System Check share the same validated snapshot; events are invalidations, not progress estimates. */
export function useSampleJob() {
  const [job, setJob] = useState<SampleJobSnapshot | null>();
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  async function refresh(): Promise<void> {
    const request = ++revision.current;
    try {
      const value = SampleJobSnapshotSchema.nullable().parse(
        await window.danesh.call('sampleJob.get', {}),
      );
      if (mounted.current && request === revision.current) {
        setJob(value);
        setError(false);
      }
    } catch {
      if (mounted.current && request === revision.current) setError(true);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const changed = window.danesh.on('sampleJob.changed', (input) => {
      if (eventPayloads['sampleJob.changed']!.safeParse(input).success) void refresh();
    });
    const ready = window.danesh.on('shell.coreState', (input) => {
      const parsed = shellEventPayloads['shell.coreState']!.safeParse(input);
      if (parsed.success && (parsed.data as { state: string }).state === 'ready') void refresh();
    });
    void refresh();
    return () => {
      mounted.current = false;
      changed();
      ready();
    };
  }, []);
  return { job, error, refresh };
}
