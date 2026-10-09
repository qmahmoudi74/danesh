import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import {
  shellEventPayloads,
  shellMethods,
  type ThemeState,
  type WindowState,
} from '@danesh/contracts/shell.ts';
import { useEffect, useState, useSyncExternalStore } from 'react';

export type Platform = 'mac' | 'windows' | 'linux';
export const platform: Platform = /Mac/.test(navigator.userAgent)
  ? 'mac'
  : /Windows/.test(navigator.userAgent)
    ? 'windows'
    : 'linux';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (change) => {
      const list = matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => matchMedia(query).matches,
  );
}
export const useNarrowWindow = () => useMediaQuery('(max-width: 879px)');

/** Subscribes to a Main-owned shell state, fetching it once and then following its events. */
function useShellState<T>(method: string, topic: string): T | undefined {
  const [state, setState] = useState<T>();
  useEffect(() => {
    let active = true;
    const unsubscribe = window.danesh.on(topic, (payload) => {
      const parsed = shellEventPayloads[topic]!.safeParse(payload);
      if (parsed.success && active) setState(parsed.data as T);
    });
    void window.danesh
      .call(method, {})
      .then((output) => {
        const parsed = shellMethods[method]!.output.safeParse(output);
        if (parsed.success && active) setState((current) => current ?? (parsed.data as T));
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [method, topic]);
  return state;
}
export const useWindowState = () =>
  useShellState<WindowState>('shell.windowState', 'shell.windowState');
export const useThemePreference = () => useShellState<ThemeState>('shell.getTheme', 'shell.theme');

function schemeSettled(dark: boolean): Promise<void> {
  const query = matchMedia('(prefers-color-scheme: dark)');
  if (query.matches === dark) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      query.removeEventListener('change', changed);
      clearTimeout(timer);
      resolve();
    };
    const changed = () => {
      if (query.matches === dark) done();
    };
    const timer = setTimeout(done, 600);
    query.addEventListener('change', changed);
  });
}

/** Applies a theme through Main and cross-fades the window once the color scheme has actually flipped. */
export async function chooseTheme(theme: ThemePreference): Promise<ThemeState> {
  const root = document.documentElement;
  let result: ThemeState | undefined;
  const apply = async () => {
    result = shellMethods['shell.setTheme']!.output.parse(
      await window.danesh.call('shell.setTheme', { theme }),
    ) as ThemeState;
    await schemeSettled(result.dark);
  };
  root.dataset.themeSwitching = '';
  try {
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof document.startViewTransition !== 'function'
    )
      await apply();
    else {
      const transition = document.startViewTransition(apply);
      await transition.updateCallbackDone;
      await transition.finished.catch(() => undefined);
    }
  } finally {
    delete root.dataset.themeSwitching;
  }
  if (!result) throw new Error('Theme not applied');
  return result;
}
