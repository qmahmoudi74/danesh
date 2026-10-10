import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleCoreControl } from '../src/control.ts';
import {
  isAppOrigin,
  secureWebPreferences,
  shouldBlockRequest,
} from '../src/policy/web-preferences.ts';
import { resolveUserDataPath, userDataSwitch } from '../src/user-data.ts';

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)],
  );
}

describe('window policy', () => {
  it('uses only sandboxed, isolated, Node-free preferences without webviews', () => {
    expect(secureWebPreferences('/app/preload/index.cjs')).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      preload: '/app/preload/index.cjs',
    });
  });
  it('allows navigation only to the app host, or the dev server when unpackaged', () => {
    expect(isAppOrigin('app://danesh/index.html#/settings', undefined)).toBe(true);
    for (const address of [
      'https://example.com/',
      'app://evil/',
      'app://danesh:1/',
      'app://user@danesh/',
      'file:///C:/index.html',
      'javascript:alert(1)',
      'not a url',
    ])
      expect(isAppOrigin(address, undefined)).toBe(false);
    expect(isAppOrigin('http://localhost:5173/#/', 'http://localhost:5173')).toBe(true);
    expect(isAppOrigin('app://danesh/index.html', 'http://localhost:5173')).toBe(false);
    expect(isAppOrigin('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });
  it('blocks every Chromium network scheme, logging only the host, except the local dev server', () => {
    for (const address of [
      'http://example.com/a?q=secret',
      'https://dictionaries.example/x.bdic',
      'ws://example.com/s',
      'wss://example.com/s',
      'ftp://example.com/f',
    ])
      expect(shouldBlockRequest(address, undefined)).toEqual({
        block: true,
        host: new URL(address).hostname,
      });
    expect(shouldBlockRequest('app://danesh/index.html', undefined).block).toBe(false);
    expect(
      shouldBlockRequest('http://localhost:5173/src/main.tsx', 'http://localhost:5173'),
    ).toEqual({ block: false, host: 'localhost' });
    expect(shouldBlockRequest('ws://localhost:5173/', 'http://localhost:5173').block).toBe(false);
    expect(shouldBlockRequest('http://localhost:8080/', 'http://localhost:5173').block).toBe(true);
  });
  it('never configures crash-report uploads or a network log sink in Main', () => {
    const sources = files(resolve('apps/main/src'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/crashReporter|uploadToServer|submitURL/);
  });
});

describe('library location (D-13)', () => {
  const persianLocal = 'C:\\Users\\علی رضایی\\AppData\\Local';
  it('defaults to LOCALAPPDATA/Danesh on Windows, keeping Persian letters and spaces', () => {
    expect(
      resolveUserDataPath({
        platform: 'win32',
        localAppData: persianLocal,
        userDataDirSwitch: undefined,
        defaultUserData: 'C:\\roaming\\danesh',
      }),
    ).toBe(join(persianLocal, 'Danesh'));
  });
  it('lets --user-data-dir win, keeps the macOS default and never invents a fallback', () => {
    expect(
      resolveUserDataPath({
        platform: 'win32',
        localAppData: persianLocal,
        userDataDirSwitch: 'D:\\کتابخانه',
        defaultUserData: 'x',
      }),
    ).toBe('D:\\کتابخانه');
    expect(
      resolveUserDataPath({
        platform: 'darwin',
        localAppData: undefined,
        userDataDirSwitch: undefined,
        defaultUserData: '/Users/a/Library/Application Support/Danesh',
      }),
    ).toBe('/Users/a/Library/Application Support/Danesh');
    expect(
      resolveUserDataPath({
        platform: 'win32',
        localAppData: undefined,
        userDataDirSwitch: undefined,
        defaultUserData: 'C:\\roaming\\danesh',
      }),
    ).toBe('C:\\roaming\\danesh');
    expect(userDataSwitch(['electron', "--user-data-dir=D:\\دانش آزمون'", '--x'])).toBe(
      "D:\\دانش آزمون'",
    );
    expect(userDataSwitch(['electron', '--user-data-dir='])).toBeUndefined();
  });
});

describe('Core control channel', () => {
  it('dispatches valid control messages and logs invalid ones without their body', () => {
    const calls: unknown[] = [];
    const records: [string, Record<string, unknown>][] = [];
    const handlers = {
      ready: (pid: number) => calls.push(['ready', pid]),
      spawnHost: (kind: string) => calls.push(['spawn', kind]),
      stopHost: (kind: string) => calls.push(['stop', kind]),
      killHost: (kind: string) => calls.push(['kill', kind]),
      exportTargetReady: (token: string) => calls.push(['export', token]),
      importSourceReady: (token: string) => calls.push(['import', token]),
    };
    const logger = {
      log: (event: string, fields: Record<string, unknown> = {}) => {
        records.push([event, fields]);
      },
    };
    handleCoreControl({ type: 'ready', corePid: 7 }, handlers, logger);
    handleCoreControl({ type: 'spawn-host', kind: 'sample' }, handlers, logger);
    for (const bad of [
      { type: 'spawn-host', kind: 'gpu' },
      { type: 'ready', corePid: 7, path: 'C:/secret' },
      { type: 'quit' },
      null,
    ])
      handleCoreControl(bad, handlers, logger);
    expect(calls).toEqual([
      ['ready', 7],
      ['spawn', 'sample'],
    ]);
    expect(records).toHaveLength(4);
    for (const [event, fields] of records) {
      expect(event).toBe('control.rejected');
      expect(Object.keys(fields).sort()).toEqual(['byteLength', 'errorClass', 'schema', 'sender']);
    }
    expect(JSON.stringify(records)).not.toContain('secret');
  });
});
