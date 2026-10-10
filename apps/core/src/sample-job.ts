import { createHash } from 'node:crypto';
import { SampleChunkResultSchema } from '@danesh/contracts/jobs.ts';
import type { JsonlLogger } from '@danesh/logging/jsonl.ts';
import type { Cas } from '@danesh/storage/cas.ts';
import type { JobsRepo } from '@danesh/storage/jobs-repo.ts';
import sample from '../assets/sample-durable-job.txt?raw';
import type { EngineClient } from './engine-client.ts';

const KIND = 'sample.durable';
const INPUT_REF = 'bundled:sample-durable-v1';
/** Only the bundled original text enters this job. There is no path or user-content input. */
export function createSampleJob({
  repo,
  cas,
  engines,
  bootId,
  notify,
  logger,
}: {
  repo: JobsRepo;
  cas: Pick<Cas, 'put'>;
  engines: Pick<EngineClient, 'withHost'>;
  bootId: string;
  notify: (jobId: string) => void;
  logger: Pick<JsonlLogger, 'log'>;
}) {
  const active = new Set<string>();
  let disposed = false;
  let notification: ReturnType<typeof setTimeout> | undefined;
  let changedJob: string | undefined;
  let delayMs = 400;
  let failIndex: number | undefined;
  let chunkCount = 12;
  function changed(jobId: string): void {
    changedJob = jobId;
    if (notification || disposed) return;
    notification = setTimeout(() => {
      notification = undefined;
      if (!disposed && changedJob) notify(changedJob);
    }, 100);
  }
  async function run(jobId: string): Promise<void> {
    const total = repo.progress(jobId).total;
    const text = sample.normalize('NFC');
    try {
      while (!disposed) {
        const task = repo.claimNext(jobId, bootId);
        changed(jobId);
        if (!task) break;
        const index = task.unitOrder + 1;
        const chunk = text.slice(
          Math.floor((task.unitOrder * text.length) / total),
          Math.floor((index * text.length) / total),
        );
        try {
          const { output } = await engines.withHost('sample', {
            type: 'sampleChunk',
            index,
            text: chunk,
            delayMs,
            fail: __TEST_HOOKS__ && index === failIndex,
          });
          if (disposed) break;
          const result = SampleChunkResultSchema.parse(output);
          if (
            result.index !== index ||
            result.length !== chunk.length ||
            result.sha256 !== createHash('sha256').update(chunk).digest('hex')
          )
            throw Object.assign(new Error('Invalid sample result'), {
              name: 'InvalidSampleResult',
            });
          const bytes = Buffer.from(
            JSON.stringify({ index: result.index, sha256: result.sha256, length: result.length }),
          );
          const stored = await cas.put(bytes);
          if (disposed) break;
          repo.commit(task.taskId, task.attempt, stored.sha256);
        } catch (error) {
          if (disposed) break;
          repo.failAttempt(task.taskId, error instanceof Error ? error.name : 'TaskError');
        }
        changed(jobId);
      }
    } catch {
      logger.log('sample-job.failed', {}, 'error');
      repo.failJob(jobId);
      changed(jobId);
    } finally {
      active.delete(jobId);
    }
  }
  function schedule(jobId: string): void {
    if (active.has(jobId) || disposed) return;
    active.add(jobId);
    setImmediate(() => {
      void run(jobId).catch(() => logger.log('sample-job.failed', {}, 'error'));
    });
  }
  return {
    get: () => repo.latestJob(KIND),
    start: () => {
      const existing = repo.activeJobs(KIND)[0];
      if (existing) return { jobId: existing };
      const jobId = repo.createJob(
        KIND,
        INPUT_REF,
        Array.from({ length: chunkCount }, (_, unitOrder) => ({
          unitOrder,
          unitKey: String(unitOrder),
        })),
      );
      schedule(jobId);
      changed(jobId);
      return { jobId };
    },
    retry: (jobId: string) => {
      repo.retry(jobId);
      schedule(jobId);
      changed(jobId);
      return { jobId };
    },
    resume: () => {
      for (const jobId of repo.activeJobs(KIND)) schedule(jobId);
    },
    setFault: (index: number, mode: 'always-fail' | 'none') => {
      if (__TEST_HOOKS__) failIndex = mode === 'none' ? undefined : index;
    },
    setDelay: (ms: number) => {
      if (__TEST_HOOKS__) delayMs = ms;
    },
    setChunks: (n: number) => {
      if (__TEST_HOOKS__) chunkCount = n;
    },
    dispose: () => {
      disposed = true;
      if (notification) clearTimeout(notification);
    },
  };
}
export type SampleJob = ReturnType<typeof createSampleJob>;
