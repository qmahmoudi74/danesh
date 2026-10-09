import { resolve, relative, isAbsolute } from 'node:path';

export function resolveAppAssetPath(root: string, urlPath: string): string {
  const decoded = decodeURIComponent(urlPath);
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid asset path');
  const segments = decoded.split('/');
  if (segments.includes('..') || segments.some((part) => part.includes(':'))) throw new Error('Asset path escapes root');
  const target = resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  const inside = relative(resolve(root), target);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Asset path escapes root');
  return target;
}

export function buildCsp(nonce: string): string {
  return `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}
