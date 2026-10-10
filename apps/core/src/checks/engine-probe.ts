import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { HostKind, RunInput } from '@danesh/contracts/host-protocol.ts';
import type { CheckResult } from '@danesh/contracts/smoke-report.ts';
import { CHECK_TIMEOUT_MS } from '@danesh/contracts/smoke-report.ts';
import type { EngineClient } from '../engine-client.ts';
import { HostExitedError } from '../engine-client.ts';

type Verdict = {
  pass: boolean;
  detail: string;
  fields: Record<string, string | number | boolean>;
  outputSha256?: string;
};

/** Shared shape of the three packaging-probe checks (D-23): assets present, own host, metadata-only fields. */
export async function runProbeCheck(
  checkId: CheckResult['checkId'],
  kind: HostKind,
  engines: EngineClient,
  assets: string[],
  input: RunInput,
  judge: (output: Record<string, unknown>) => Verdict,
): Promise<CheckResult> {
  const missing = assets.filter((path) => !existsSync(path)).map((path) => basename(path));
  if (missing.length)
    return {
      checkId,
      status: 'fail',
      durationMs: 0,
      detail: 'probe asset missing: run pnpm probes:fetch',
      fields: { missing: missing.join(',') },
    };
  try {
    const { output, hostPid, entry } = await engines.withHost(kind, input, CHECK_TIMEOUT_MS.engine);
    const value = output as Record<string, unknown>;
    const verdict = judge(value);
    const libraries = Array.isArray(value.nativeLibraries)
      ? (value.nativeLibraries as string[])
      : [];
    const metrics: Record<string, number> = {};
    for (const key of ['hostCpuUserMs', 'hostCpuSystemMs', 'hostRssAtFinishBytes']) {
      const metric = value[key];
      if (typeof metric === 'number' && Number.isFinite(metric) && metric >= 0)
        metrics[key] = metric;
    }
    return {
      checkId,
      status:
        verdict.pass && verdict.outputSha256 && /^[0-9a-f]{64}$/.test(verdict.outputSha256)
          ? 'pass'
          : 'fail',
      durationMs: 0,
      detail: verdict.detail,
      fields: {
        hostPid,
        corePid: process.pid,
        entry: entry ?? 'unknown',
        assets: assets.map((path) => basename(path)).join(','),
        ...(libraries[0]
          ? { nativeLibrary: libraries[0], nativeLibraryCount: libraries.length }
          : {}),
        ...verdict.fields,
        ...metrics,
      },
      ...(verdict.outputSha256 && /^[0-9a-f]{64}$/.test(verdict.outputSha256)
        ? { outputSha256: verdict.outputSha256 }
        : {}),
    };
  } catch (error) {
    // The orchestrator retries this probe once after supervised backoff, preserving its original deadline.
    if (error instanceof HostExitedError) throw error;
    const fields: Record<string, string | number> = {
      errorClass: error instanceof Error ? error.name : 'Error',
    };
    return {
      checkId,
      status: 'fail',
      durationMs: 0,
      detail: `probe failed: ${String(fields.errorClass)}`,
      fields,
    };
  }
}
