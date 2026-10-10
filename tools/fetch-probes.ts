// Fetches the packaging-probe assets pinned in tools/probes.lock.json (Plan 01-09, D-23). A developer/CI build tool,
// never shipped in the app: commit-pinned URLs, size + SHA-256 verified while streaming, atomic rename, no runtime use.
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type ProbeEntry = {
  id: string;
  url: string;
  size: number;
  sha256: string;
  license: string;
  licenseStatus: string;
  target: string;
  expectedFirstWord?: string;
};
export type ProbeLock = { maxTotalBytes: number; entries: ProbeEntry[] };
const PINNED =
  /^https:\/\/(huggingface\.co\/[^/]+\/[^/]+\/resolve\/[0-9a-f]{40}\/|raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/)/;

/** Refuses a lock that could ship something it must not, before any download starts. */
export function validateLock(lock: ProbeLock, nonCommercialPatterns: string[]): string[] {
  const errors: string[] = [];
  const total = lock.entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > lock.maxTotalBytes)
    errors.push(
      `probe assets total ${total} bytes, above the ${lock.maxTotalBytes}-byte budget (D-23)`,
    );
  for (const entry of lock.entries) {
    if (!PINNED.test(entry.url)) errors.push(`${entry.id}: URL is not pinned to a 40-hex commit`);
    if (!/^[0-9a-f]{64}$/.test(entry.sha256))
      errors.push(`${entry.id}: sha256 must be 64 lowercase hex`);
    if (!Number.isInteger(entry.size) || entry.size <= 0)
      errors.push(`${entry.id}: size must be a positive integer`);
    if (entry.target.includes('..') || entry.target.startsWith('/'))
      errors.push(`${entry.id}: target escapes resources/probes`);
    if (
      nonCommercialPatterns.some((pattern) =>
        entry.license.toUpperCase().includes(pattern.toUpperCase()),
      )
    )
      errors.push(
        `${entry.id}: license ${entry.license} is non-commercial and is never bundled while D-COMMERCIAL is open (ADR 0004)`,
      );
  }
  return errors;
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function fetchEntry(entry: ProbeEntry, root: string): Promise<'cached' | 'downloaded'> {
  const target = join(root, entry.target);
  if (
    existsSync(target) &&
    statSync(target).size === entry.size &&
    (await sha256Of(target)) === entry.sha256
  )
    return 'cached';
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  rmSync(partial, { force: true });
  const response = await fetch(entry.url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${entry.id}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  let bytes = 0;
  const file = await open(partial, 'wx');
  try {
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      bytes += chunk.byteLength;
      if (bytes > entry.size) throw new Error(`${entry.id}: more bytes than the pinned size`);
      hash.update(chunk);
      await file.write(chunk);
    }
    await file.sync();
  } finally {
    await file.close();
  }
  const digest = hash.digest('hex');
  if (bytes !== entry.size || digest !== entry.sha256) {
    rmSync(partial, { force: true });
    throw new Error(`${entry.id}: size ${bytes} / sha256 ${digest} do not match the lock`);
  }
  renameSync(partial, target);
  return 'downloaded';
}

if (import.meta.main) {
  const lock = JSON.parse(readFileSync(resolve('tools/probes.lock.json'), 'utf8')) as ProbeLock;
  const policy = JSON.parse(readFileSync(resolve('tools/license-policy.json'), 'utf8')) as {
    nonCommercialPatterns: string[];
  };
  const errors = validateLock(lock, policy.nonCommercialPatterns);
  if (errors.length) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exit(1);
  }
  const root = resolve('resources/probes');
  let failed = false;
  for (const entry of lock.entries) {
    try {
      console.log(
        `${await fetchEntry(entry, root)} ${entry.id} ${entry.size} bytes ${entry.license} (${entry.licenseStatus})`,
      );
    } catch (error) {
      failed = true;
      console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(
    `probes:fetch total=${lock.entries.reduce((sum, entry) => sum + entry.size, 0)} bytes budget=${lock.maxTotalBytes} ${failed ? 'failed' : 'ok'}`,
  );
  process.exitCode = failed ? 1 : 0;
}
