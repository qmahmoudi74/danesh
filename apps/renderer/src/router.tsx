import { type Route, RouteSchema, shellEventPayloads } from '@danesh/contracts/shell.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TitleBar } from './components/Chrome.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { installResponsivenessProbe } from './lib/heartbeat.ts';
import { installSmokeRunner } from './lib/smoke.ts';
import { useWindowState } from './lib/theme.ts';
import { Home } from './screens/Home.tsx';
import { Library } from './screens/Library.tsx';
import { Settings } from './screens/Settings.tsx';
import { SystemCheck } from './screens/SystemCheck.tsx';

const screens: Record<Route, { name: string; title: string; render: () => React.ReactNode }> = {
  '#/': { name: 'خانه', title: 'دانش', render: () => <Home /> },
  '#/library': { name: 'کتابخانه', title: 'کتابخانه — دانش', render: () => <Library /> },
  '#/system-check': {
    name: 'بررسی سامانه',
    title: 'بررسی سامانه — دانش',
    render: () => <SystemCheck />,
  },
  '#/settings': { name: 'تنظیمات', title: 'تنظیمات — دانش', render: () => <Settings /> },
};
const toRoute = (hash: string): Route => {
  const parsed = RouteSchema.safeParse(hash);
  return parsed.success ? parsed.data : '#/';
};
const focusHeading = () =>
  document.querySelector<HTMLHeadingElement>('main h1')?.focus({ preventScroll: true });

export function Router() {
  const [hash, setHash] = useState(location.hash);
  const route = toRoute(hash);
  const windowState = useWindowState();
  const content = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<Route, number>());
  const shown = useRef<Route>(route);
  useEffect(() => installSmokeRunner(), []);
  useEffect(() => installResponsivenessProbe(), []);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener('hashchange', changed);
    const unsubscribe = window.danesh.on('shell.navigate', (payload) => {
      const parsed = shellEventPayloads['shell.navigate']!.safeParse(payload);
      if (!parsed.success) return;
      const target = (parsed.data as { route: Route }).route;
      if (location.hash === target || (target === '#/' && toRoute(location.hash) === '#/'))
        focusHeading();
      else location.hash = target.slice(1);
    });
    return () => {
      window.removeEventListener('hashchange', changed);
      unsubscribe();
    };
  }, []);
  useLayoutEffect(() => {
    const scroller = content.current;
    if (scroller && shown.current !== route)
      scroller.scrollTop = scrollPositions.current.get(route) ?? 0;
    shown.current = route;
    document.title = screens[route].title;
    focusHeading();
  }, [hash, route]);
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-window-inactive', windowState ? !windowState.focused : false);
    root.toggleAttribute('data-fullscreen', windowState?.fullscreen ?? false);
  }, [windowState]);
  return (
    <div className="frame">
      <TitleBar screen={screens[route].name} state={windowState} />
      <div className="workspace">
        <Sidebar route={route} />
        <div
          className="content"
          ref={content}
          onScroll={(event) =>
            scrollPositions.current.set(shown.current, event.currentTarget.scrollTop)
          }
        >
          {screens[route].render()}
        </div>
      </div>
    </div>
  );
}
