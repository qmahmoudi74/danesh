export function isTrustedShellOrigin(address: string, devUrl?: string): boolean {
  try {
    const url = new URL(address);
    if (url.username || url.password) return false;
    if (url.protocol === 'app:' && url.hostname === 'danesh' && !url.port) return true;
    return !!devUrl && url.origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}
