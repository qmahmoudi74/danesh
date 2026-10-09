import { Menu, type MenuItemConstructorOptions } from 'electron';
export function installAppMenu(sendShellEvent: (topic: string, payload: unknown) => void): void {
  const platformMenu: MenuItemConstructorOptions = process.platform === 'darwin'
    ? { label: 'دانش', submenu: [{ label: 'دربارهٔ دانش', role: 'about' }, { type: 'separator' }, { label: 'خروج از دانش', role: 'quit' }] }
    : { label: 'پرونده', submenu: [{ label: 'خروج', role: 'quit' }] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    platformMenu,
    { label: 'ویرایش', submenu: [{ label: 'رونوشت', role: 'copy' }, { label: 'انتخاب همه', role: 'selectAll' }] },
    { label: 'نمایش', submenu: [
      { label: 'صفحهٔ اصلی', accelerator: 'CmdOrCtrl+1', click: () => sendShellEvent('shell.navigate', { route: '#/' }) },
      { label: 'بررسی سامانه', accelerator: 'CmdOrCtrl+2', click: () => sendShellEvent('shell.navigate', { route: '#/system-check' }) },
      { type: 'separator' }, { label: 'بزرگ‌نمایی', role: 'zoomIn' }, { label: 'کوچک‌نمایی', role: 'zoomOut' }, { label: 'اندازهٔ واقعی', role: 'resetZoom' },
    ] },
  ]));
}
