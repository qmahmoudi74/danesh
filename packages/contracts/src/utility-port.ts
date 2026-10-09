export type UtilityMessage = { data: unknown; ports: UtilityPort[] };
export interface UtilityPort {
  on(event: 'message', listener: (message: UtilityMessage) => void): void;
  postMessage(message: unknown): void;
  start(): void;
}
export function parentPort(): UtilityPort {
  const port = (process as NodeJS.Process & { parentPort?: UtilityPort }).parentPort;
  if (!port) throw new Error('Utility process parent port is required');
  return port;
}
