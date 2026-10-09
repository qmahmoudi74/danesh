import { describe, expect, it } from 'vitest';
import { isTrustedShellOrigin } from '../src/policy/shell-origin.ts';
describe('shell origin boundary', () => {
  it('accepts only the app host and explicit development origin', () => {
    expect(isTrustedShellOrigin('app://danesh/index.html')).toBe(true);
    for (const url of ['https://example.com', 'app://other/', 'app://danesh:123/', 'app://user@danesh/', 'file:///tmp/index.html', 'invalid']) expect(isTrustedShellOrigin(url)).toBe(false);
    expect(isTrustedShellOrigin('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isTrustedShellOrigin('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });
});
