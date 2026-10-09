import { join } from 'node:path';

export interface UserDataInput {
  platform: NodeJS.Platform;
  localAppData: string | undefined;
  /** Value of --user-data-dir when given (tests, Tier B runs, portable use). */
  userDataDirSwitch: string | undefined;
  defaultUserData: string;
}

/**
 * D-13: on Windows the library defaults to %LOCALAPPDATA%\Danesh (machine-local, not roaming); --user-data-dir always
 * wins; macOS keeps Electron's default. The path is used exactly as given: a Persian or non-ASCII profile path is never
 * swapped for an ASCII-only fallback.
 */
export function resolveUserDataPath({ platform, localAppData, userDataDirSwitch, defaultUserData }: UserDataInput): string {
  if (userDataDirSwitch) return userDataDirSwitch;
  if (platform === 'win32' && localAppData) return join(localAppData, 'Danesh');
  return defaultUserData;
}

export function userDataSwitch(argv: string[]): string | undefined {
  const value = argv.find((arg) => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  return value ? value : undefined;
}
