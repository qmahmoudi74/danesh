import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { protocol } from 'electron';
import { buildCsp, resolveAppAssetPath } from './policy/app-path.ts';

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // pdf.js ships its page-viewer worker as an ES module file.
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'danesh' || url.port || url.username || url.password)
      return new Response(null, { status: 400 });
    let file: string;
    try {
      file = resolveAppAssetPath(rendererRoot, url.pathname);
    } catch {
      return new Response(null, { status: 403 });
    }
    try {
      const bytes = await readFile(file);
      const nonce = randomBytes(16).toString('base64');
      const body =
        extname(file) === '.html'
          ? bytes.toString('utf8').replaceAll('__CSP_NONCE__', nonce)
          : new Uint8Array(bytes);
      return new Response(body, {
        headers: {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Content-Security-Policy': buildCsp(nonce),
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
