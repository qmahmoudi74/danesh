import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';

export const themeLabels: Record<ThemePreference, string> = { system: 'هماهنگ با سیستم', light: 'روشن', dark: 'تیره' };

export function installAppMenu(sendShellEvent: (topic: string, payload: unknown) => void, theme: ThemePreference, setTheme: (theme: ThemePreference) => void): void {
  const platformMenu: MenuItemConstructorOptions = process.platform === 'darwin'
    ? { label: 'دانش', submenu: [{ label: 'دربارهٔ دانش', role: 'about' }, { type: 'separator' }, { label: 'خروج از دانش', role: 'quit' }] }
    : { label: 'پرونده', submenu: [{ label: 'خروج', role: 'quit' }] };
  const themeItems: MenuItemConstructorOptions[] = (['system', 'light', 'dark'] as const).map((value) => ({ label: themeLabels[value], type: 'radio', checked: value === theme, click: () => setTheme(value) }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    platformMenu,
    { label: 'ویرایش', submenu: [{ label: 'رونوشت', role: 'copy' }, { label: 'انتخاب همه', role: 'selectAll' }] },
    { label: 'نمایش', submenu: [
      { label: 'صفحهٔ اصلی', accelerator: 'CmdOrCtrl+1', click: () => sendShellEvent('shell.navigate', { route: '#/' }) },
      { label: 'بررسی سامانه', accelerator: 'CmdOrCtrl+2', click: () => sendShellEvent('shell.navigate', { route: '#/system-check' }) },
      { label: 'تنظیمات', accelerator: 'CmdOrCtrl+,', click: () => sendShellEvent('shell.navigate', { route: '#/settings' }) },
      { type: 'separator' }, { label: 'پوسته', submenu: themeItems },
      { type: 'separator' }, { label: 'بزرگ‌نمایی', role: 'zoomIn' }, { label: 'کوچک‌نمایی', role: 'zoomOut' }, { label: 'اندازهٔ واقعی', role: 'resetZoom' },
    ] },
  ]));
}
