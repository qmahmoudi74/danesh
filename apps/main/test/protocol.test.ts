import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { resolveAppAssetPath, buildCsp } from '../src/policy/app-path.ts';
const root = resolve('renderer-assets');
describe('app protocol policy', () => {
  it('maps the root to index.html', () => { expect(resolveAppAssetPath(root, '/')).toBe(join(root, 'index.html')); });
  it('allows a nested asset', () => { expect(resolveAppAssetPath(root, '/assets/font.woff2')).toBe(join(root, 'assets/font.woff2')); });
  it.each(['/../', '/%2e%2e%2fsecret', '/C:/Windows/secret', '//server/share', '/..\\secret', '/%00', '/%zz'])('rejects escape %s', (path) => { expect(() => resolveAppAssetPath(root, path)).toThrow(); });
  it('denies connections and includes the response nonce', () => {
    const csp = buildCsp('response-nonce');
    expect(csp).toContain("connect-src 'none'"); expect(csp).toContain("style-src 'self' 'nonce-response-nonce'");
    expect(csp).toContain("default-src 'none'"); expect(csp).toContain("frame-ancestors 'none'");
  });
});
