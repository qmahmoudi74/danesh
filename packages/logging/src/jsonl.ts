import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Local JSON-lines logger (D-16). Lines carry only allowlisted metadata: event names, IDs, hashes, error classes,
 * counts, schema names, sender kinds and byte lengths. Unknown keys are dropped (and counted) so no payload, document
 * text, path or user string can reach a log by accident.
 */
export const LOG_FIELDS = [
  'schema',
  'method',
  'sender',
  'errorClass',
  'byteLength',
  'code',
  'pid',
  'kind',
  'exitCode',
  'attempt',
  'host',
  'checkId',
  'durationMs',
  'count',
  'jobId',
  'taskId',
  'sha256',
  'migrationId',
  'userVersion',
] as const;
export type LogField = (typeof LOG_FIELDS)[number];
export type LogValue = string | number | boolean | null;
export type LogLevel = 'info' | 'warn' | 'error';
export interface JsonlLogger {
  log(
    event: string,
    fields?: Partial<Record<LogField, LogValue>> & Record<string, unknown>,
    level?: LogLevel,
  ): void;
  close(): void;
}
const allowed = new Set<string>(LOG_FIELDS);
const MAX_STRING = 200;

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(fields)) {
    const scalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
    if (!allowed.has(key) || !scalar || (typeof value === 'number' && !Number.isFinite(value))) {
      dropped++;
      continue;
    }
    clean[key] =
      typeof value === 'string' && value.length > MAX_STRING ? { truncated: true } : value;
  }
  if (dropped) clean.droppedFields = dropped;
  return clean;
}

export function createJsonlLogger({
  dir,
  name,
  maxBytes = 1_048_576,
  maxFiles = 5,
}: {
  dir: string;
  name: string;
  maxBytes?: number;
  maxFiles?: number;
}): JsonlLogger {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) throw new Error('Invalid log name');
  if (maxFiles < 1 || maxBytes < 256) throw new Error('Invalid log bounds');
  mkdirSync(dir, { recursive: true });
  const file = (index: number) => join(dir, index ? `${name}.${index}.jsonl` : `${name}.jsonl`);
  let size = existsSync(file(0)) ? statSync(file(0)).size : 0;
  let closed = false;
  const rotate = () => {
    rmSync(file(maxFiles - 1), { force: true });
    for (let index = maxFiles - 2; index >= 0; index--)
      if (existsSync(file(index))) renameSync(file(index), file(index + 1));
    size = 0;
  };
  return {
    log(event, fields = {}, level = 'info') {
      if (closed) return;
      const safeEvent = /^[a-z][\w.-]{0,63}$/i.test(event) ? event : 'invalid-event';
      const line =
        JSON.stringify({
          ts: new Date().toISOString(),
          level,
          process: name,
          event: safeEvent,
          ...sanitize(fields),
        }) + '\n';
      const bytes = Buffer.byteLength(line, 'utf8');
      if (bytes > maxBytes) return;
      try {
        if (size + bytes > maxBytes) rotate();
        appendFileSync(file(0), line, 'utf8');
        size += bytes;
      } catch {
        /* logging must never take the process down */
      }
    },
    close() {
      closed = true;
    },
  };
}
