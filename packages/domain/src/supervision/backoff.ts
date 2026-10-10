export function backoffMs(
  restartCount: number,
  { baseMs = 250, capMs = 15000 }: { baseMs?: number; capMs?: number } = {},
): number {
  if (!Number.isSafeInteger(restartCount) || restartCount < 0)
    throw new RangeError('Restart count must be a nonnegative integer');
  if (!Number.isSafeInteger(baseMs) || baseMs <= 0 || !Number.isSafeInteger(capMs) || capMs <= 0)
    throw new RangeError('Backoff parameters must be positive integers');
  return Math.min(capMs, baseMs * 2 ** restartCount);
}
