import type { WebPreferences } from 'electron';

/** The only web preferences any Danesh window may use (PLAT-01): sandboxed, isolated, no Node, no webviews. */
export function secureWebPreferences(preload: string): WebPreferences {
  return {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
    preload,
  };
}

/** Origins a window may navigate to: the packaged app host, plus the dev server only when unpackaged. */
export function isAllowedNavigation(address: string, devUrl: string | undefined): boolean {
  try {
    const url = new URL(address);
    if (url.username || url.password) return false;
    if (devUrl) return url.origin === new URL(devUrl).origin;
    return url.protocol === 'app:' && url.hostname === 'danesh' && !url.port;
  } catch {
    return false;
  }
}

const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:', 'ftp:']);
/** Chromium-level egress decision (D-17 layer L1): every network scheme is cancelled except the local dev server. */
export function shouldBlockRequest(
  address: string,
  devUrl: string | undefined,
): { block: boolean; host: string } {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { block: false, host: '' };
  }
  if (!NETWORK_SCHEMES.has(url.protocol)) return { block: false, host: '' };
  if (devUrl) {
    const dev = new URL(devUrl);
    // The Vite dev server and its HMR socket share one loopback origin.
    if (url.hostname === dev.hostname && url.port === dev.port)
      return { block: false, host: url.hostname };
  }
  return { block: true, host: url.hostname };
}
