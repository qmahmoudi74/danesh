import type { Route } from '@danesh/contracts/shell.ts';
import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * macOS keeps its system menu bar (About, Quit, Edit shortcuts, zoom), as users expect. Windows and Linux have no
 * application menu at all: navigation is the sidebar, preferences are in Settings, and the window controls and
 * keyboard shortcuts (matched in policy/shortcuts.ts) cover the rest.
 */
export function installAppMenu(navigate: (route: Route) => void): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const go =
    (route: Route): MenuItemConstructorOptions['click'] =>
    () =>
      navigate(route);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'دانش',
        submenu: [
          { label: 'دربارهٔ دانش', role: 'about' },
          { type: 'separator' },
          { label: 'تنظیمات', accelerator: 'Cmd+,', click: go('#/settings') },
          { type: 'separator' },
          { label: 'خروج از دانش', role: 'quit' },
        ],
      },
      {
        label: 'ویرایش',
        submenu: [
          { label: 'رونوشت', role: 'copy' },
          { label: 'انتخاب همه', role: 'selectAll' },
        ],
      },
      {
        label: 'نمایش',
        submenu: [
          { label: 'صفحهٔ اصلی', accelerator: 'Cmd+1', click: go('#/') },
          { label: 'بررسی سامانه', accelerator: 'Cmd+2', click: go('#/system-check') },
          { type: 'separator' },
          { label: 'بزرگ‌نمایی', role: 'zoomIn' },
          { label: 'کوچک‌نمایی', role: 'zoomOut' },
          { label: 'اندازهٔ واقعی', role: 'resetZoom' },
        ],
      },
    ]),
  );
}
