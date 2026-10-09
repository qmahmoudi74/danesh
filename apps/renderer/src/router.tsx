import { useEffect, useLayoutEffect, useState } from 'react';
import { shellEventPayloads } from '@danesh/contracts/shell.ts';
import { Home } from './screens/Home.tsx';
import { SystemCheck } from './screens/SystemCheck.tsx';
export function Router() {
  const [hash, setHash] = useState(location.hash);
  const systemCheck = hash === '#/system-check';
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener('hashchange', changed);
    const unsubscribe = window.danesh.on('shell.navigate', (payload) => {
      const parsed = shellEventPayloads['shell.navigate']!.safeParse(payload);
      if (!parsed.success) return;
      const { route } = parsed.data as { route: '#/' | '#/system-check' };
      if (location.hash === route) document.querySelector<HTMLHeadingElement>('main h1')?.focus();
      else location.hash = route;
    });
    return () => { window.removeEventListener('hashchange', changed); unsubscribe(); };
  }, []);
  useLayoutEffect(() => { document.title = systemCheck ? 'بررسی سامانه — دانش' : 'دانش'; document.querySelector<HTMLHeadingElement>('main h1')?.focus(); }, [hash, systemCheck]);
  return systemCheck ? <SystemCheck /> : <Home />;
}
