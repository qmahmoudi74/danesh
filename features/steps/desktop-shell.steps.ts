import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ElectronApplication, expect, type Page } from '@playwright/test';
import { Given, Then, When } from './fixtures.ts';

type Snapshot = { state: unknown; preferences: string | null };
const shellResults = new WeakMap<object, string[]>();
const snapshots = new WeakMap<object, Snapshot>();
const isMac = process.platform === 'darwin';
const surface = { light: 'rgb(250, 248, 244)', dark: 'rgb(28, 27, 25)' };
const readPreferences = (root: string) => {
  const path = join(root, 'ui-preferences.json');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};
const windowInfo = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, nativeTheme, screen }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    return {
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
      visible: win.isVisible(),
      bounds: win.getBounds(),
      content: win.getContentBounds(),
      background: win.getBackgroundColor(),
      themeSource: nativeTheme.themeSource,
      workArea: screen.getPrimaryDisplay().workArea,
      displays: screen.getAllDisplays().map((display) => display.workArea),
    };
  });
const bodyBackground = (harness: { page: Page | undefined }) =>
  harness.page!.evaluate(
    () => getComputedStyle(document.querySelector('.content')!).backgroundColor,
  );

Then(
  'the window has no OS title bar and the Danesh title bar shows «دانش» and the current screen name',
  async ({ harness }) => {
    const info = await windowInfo(harness.app!);
    // A framed window's content starts below its OS caption; the frameless shell's content starts at the window's top edge.
    expect(Math.abs(info.content.y - info.bounds.y)).toBeLessThanOrEqual(1);
    const bar = harness.page!.locator('header.title-bar');
    await expect(bar).toContainText('دانش');
    await expect(bar).toContainText('خانه');
    expect(
      await bar.evaluate(
        (element) =>
          getComputedStyle(element).getPropertyValue('-webkit-app-region') ||
          getComputedStyle(element).getPropertyValue('app-region'),
      ),
    ).toBe('drag');
    for (const button of await bar.getByRole('button').all())
      expect(
        await button.evaluate(
          (element) =>
            getComputedStyle(element).getPropertyValue('-webkit-app-region') ||
            getComputedStyle(element).getPropertyValue('app-region'),
        ),
      ).toBe('no-drag');
  },
);
Then("the platform's window controls are placed at the physical right", async ({ harness }) => {
  const page = harness.page!;
  const brand = await page.locator('.title-brand').boundingBox();
  if (isMac) {
    // Native traffic lights keep the left edge; no custom controls are drawn.
    const lights = await page.locator('.traffic-lights').boundingBox();
    expect(lights!.x).toBeLessThan(brand!.x);
    await expect(page.locator('.caption-button')).toHaveCount(0);
    return;
  }
  const [minimize, maximize, close] = await Promise.all(
    ['کوچک کردن', 'بزرگ کردن', 'بستن'].map((name) =>
      page.getByRole('button', { name, exact: true }).boundingBox(),
    ),
  );
  // Controls sit at the physical right in the usual order, with close at the outer edge.
  expect(brand!.x).toBeLessThan(minimize!.x);
  expect(minimize!.x).toBeLessThan(maximize!.x);
  expect(maximize!.x).toBeLessThan(close!.x);
  const viewport = await page.evaluate(() => innerWidth);
  expect(close!.x + close!.width).toBeGreaterThanOrEqual(viewport - 1);
  for (const box of [minimize, maximize, close]) {
    expect(Math.round(box!.width)).toBe(46);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(31);
  }
});
const press = async (harness: { page: Page | undefined }, name: RegExp, action: string) => {
  if (isMac) {
    await harness.page!.evaluate(
      (value) => window.danesh.call('shell.window', { action: value }),
      action,
    );
    return;
  }
  await harness.page!.getByRole('button', { name }).click();
};
When('I press the maximize control', async ({ harness }) => {
  await press(harness, /^(بزرگ کردن|بازگرداندن)$/, 'toggleMaximize');
});
When('I press the minimize control', async ({ harness }) => {
  await press(harness, /^کوچک کردن$/, 'minimize');
});
Then('the window is maximized and the control reads «بازگرداندن»', async ({ harness }) => {
  await expect.poll(async () => (await windowInfo(harness.app!)).maximized).toBe(true);
  if (!isMac)
    await expect(
      harness.page!.getByRole('button', { name: 'بازگرداندن', exact: true }),
    ).toBeVisible();
});
Then('the window is restored and the control reads «بزرگ کردن»', async ({ harness }) => {
  await expect.poll(async () => (await windowInfo(harness.app!)).maximized).toBe(false);
  if (!isMac)
    await expect(
      harness.page!.getByRole('button', { name: 'بزرگ کردن', exact: true }),
    ).toBeVisible();
});
Then('the window is minimized', async ({ harness }) => {
  await expect.poll(async () => (await windowInfo(harness.app!)).minimized).toBe(true);
});
When('the window is restored by the operating system', async ({ harness }) => {
  await harness.app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.restore();
  });
  await expect.poll(async () => (await windowInfo(harness.app!)).minimized).toBe(false);
});
When('I press the close control', async ({ harness, libraryRoot }) => {
  expect(readPreferences(libraryRoot)).toBeNull();
  const closed = harness.app!.waitForEvent('close');
  if (isMac)
    await harness.page!.evaluate(() =>
      window.danesh.call('shell.window', { action: 'close' }).catch(() => undefined),
    );
  else await harness.page!.getByRole('button', { name: 'بستن', exact: true }).click();
  await closed;
  harness.app = undefined;
  harness.page = undefined;
});
Then('the window closes through the normal close path', ({ libraryRoot }) => {
  // The window's 'close' handler persists bounds; a process exit would skip it.
  const saved = JSON.parse(readPreferences(libraryRoot) ?? '{}') as { window?: { width: number } };
  expect(saved.window?.width).toBeGreaterThan(0);
});

When('I open «تنظیمات» from the sidebar and choose «تیره»', async ({ harness }) => {
  const page = harness.page!;
  await page.getByRole('navigation').getByRole('link', { name: 'تنظیمات', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'تنظیمات', exact: true })).toBeFocused();
  // Click the visible card label, as a user does; the native radio input itself is visually hidden.
  await page
    .locator('.theme-option')
    .filter({ has: page.getByRole('radio', { name: /^تیره/ }) })
    .getByText('تیره', { exact: true })
    .click();
});
Then('the page uses the dark tokens and the native theme source is "dark"', async ({ harness }) => {
  // Wait for Main's preference first: on a dark OS the page is already dark under «هماهنگ با سیستم».
  await expect.poll(async () => (await windowInfo(harness.app!)).themeSource).toBe('dark');
  await expect.poll(() => bodyBackground(harness)).toBe(surface.dark);
});
Then('the page uses the dark tokens', async ({ harness }) => {
  await expect.poll(() => bodyBackground(harness)).toBe(surface.dark);
});
Then('the page uses the light tokens', async ({ harness }) => {
  await expect.poll(() => bodyBackground(harness)).toBe(surface.light);
});
When(
  'the window is resized to {int} by {int}',
  async ({ harness }, width: number, height: number) => {
    await harness.app!.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()[0]!.setSize(w!, h!);
      },
      [width, height],
    );
    await expect
      .poll(async () => Math.abs((await windowInfo(harness.app!)).bounds.width - width))
      .toBeLessThanOrEqual(4);
  },
);
Then('the window background and the first rendered frame are dark', async ({ harness }) => {
  const info = await windowInfo(harness.app!);
  expect(info.themeSource).toBe('dark');
  expect(info.background.toUpperCase()).toMatch(/1C1B19$/);
  expect(
    await harness.page!.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
  ).toBe(true);
  expect(await bodyBackground(harness)).toBe(surface.dark);
});
const selectedTheme = async (harness: { page: Page | undefined }, name: RegExp) => {
  await harness.page!.evaluate(() => {
    location.hash = '/settings';
  });
  await expect(harness.page!.getByRole('radio', { name })).toBeChecked();
};
Then('«تیره» is the selected theme in Settings', async ({ harness }) => {
  await selectedTheme(harness, /^تیره/);
});
Then('«هماهنگ با سیستم» is the selected theme in Settings', async ({ harness }) => {
  await selectedTheme(harness, /^هماهنگ با سیستم/);
});
Then('the window size is {int} by {int}', async ({ harness }, width: number, height: number) => {
  const { bounds } = await windowInfo(harness.app!);
  expect(Math.abs(bounds.width - width)).toBeLessThanOrEqual(4);
  expect(Math.abs(bounds.height - height)).toBeLessThanOrEqual(4);
});
When('the operating system appearance becomes dark', async ({ harness }) => {
  await harness.page!.emulateMedia({ colorScheme: 'dark' });
});
When('the operating system appearance becomes light', async ({ harness }) => {
  await harness.page!.emulateMedia({ colorScheme: 'light' });
});

const ask = async (
  harness: { page: Page | undefined },
  libraryRoot: string,
  method: string,
  input: unknown,
) => {
  if (!snapshots.has(harness))
    snapshots.set(harness, {
      state: await harness.page!.evaluate(() => window.danesh.call('shell.windowState', {})),
      preferences: readPreferences(libraryRoot),
    });
  const result = await harness.page!.evaluate(
    async ([name, value]) => {
      try {
        await window.danesh.call(name, value);
        return 'unexpected-success';
      } catch (error) {
        return (error as Error).message;
      }
    },
    [method, input] as const,
  );
  shellResults.set(harness, [...(shellResults.get(harness) ?? []), result]);
};
When('the page asks "shell.window" for action "openDevTools"', async ({ harness, libraryRoot }) => {
  await ask(harness, libraryRoot, 'shell.window', { action: 'openDevTools' });
});
When('the page asks "shell.setTheme" for theme "neon"', async ({ harness, libraryRoot }) => {
  await ask(harness, libraryRoot, 'shell.setTheme', { theme: 'neon' });
});
When(
  'the page asks "shell.setTheme" with an unexpected extra field',
  async ({ harness, libraryRoot }) => {
    await ask(harness, libraryRoot, 'shell.setTheme', { theme: 'dark', path: 'C:/Windows' });
  },
);
Then('each request fails with INVALID_INPUT', ({ harness }) => {
  expect(shellResults.get(harness)).toEqual(['INVALID_INPUT', 'INVALID_INPUT', 'INVALID_INPUT']);
});
Then(
  'the window state and the saved preferences are unchanged',
  async ({ harness, libraryRoot }) => {
    const before = snapshots.get(harness)!;
    expect(await harness.page!.evaluate(() => window.danesh.call('shell.windowState', {}))).toEqual(
      before.state,
    );
    expect(readPreferences(libraryRoot)).toBe(before.preferences);
    expect((await windowInfo(harness.app!)).themeSource).toBe('system');
  },
);
Then('"window.danesh" still exposes only "call" and "on"', async ({ harness }) => {
  expect(await harness.page!.evaluate(() => Object.keys(window.danesh).sort())).toEqual([
    'call',
    'on',
  ]);
});

Given('that library contains a corrupted "ui-preferences.json"', ({ libraryRoot }) => {
  writeFileSync(
    join(libraryRoot, 'ui-preferences.json'),
    '{"version":1,"theme":42,"window":"\u0000',
  );
});
Then(
  'Home is shown with the System theme in a visible window of the default size',
  async ({ harness }) => {
    await expect(
      harness.page!.getByRole('heading', { level: 1, name: 'دانش', exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await windowInfo(harness.app!)).visible).toBe(true);
    const info = await windowInfo(harness.app!);
    expect(info.themeSource).toBe('system');
    // Frameless windows on Windows at fractional scaling report a few extra pixels; see measureDrift in apps/main/src/preferences.ts.
    expect(Math.abs(info.bounds.width - Math.min(1040, info.workArea.width))).toBeLessThanOrEqual(
      4,
    );
    expect(Math.abs(info.bounds.height - Math.min(720, info.workArea.height))).toBeLessThanOrEqual(
      4,
    );
  },
);
Given(
  "that library's preferences place the window far outside every display",
  async ({ harness, libraryRoot }) => {
    await harness.close();
    writeFileSync(
      join(libraryRoot, 'ui-preferences.json'),
      JSON.stringify({
        version: 1,
        theme: 'system',
        window: { x: 60000, y: 60000, width: 1200, height: 800, maximized: false },
      }),
    );
  },
);
Then("the window lies inside the primary display's work area", async ({ harness }) => {
  const { bounds, workArea } = await windowInfo(harness.app!);
  expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
  expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height);
});

const navLink = (harness: { page: Page | undefined }, name: string) =>
  harness.page!.getByRole('navigation').getByRole('link', { name, exact: true });
Then('the sidebar marks «خانه» as the current page', async ({ harness }) => {
  await expect(navLink(harness, 'خانه')).toHaveAttribute('aria-current', 'page');
});
Then('the sidebar marks «بررسی سامانه» as the current page', async ({ harness }) => {
  await expect(navLink(harness, 'بررسی سامانه')).toHaveAttribute('aria-current', 'page');
  await expect(navLink(harness, 'خانه')).not.toHaveAttribute('aria-current', 'page');
});
When('I collapse the sidebar with the keyboard', async ({ harness }) => {
  await harness.page!.getByRole('button', { name: 'جمع کردن نوار کناری', exact: true }).focus();
  await harness.page!.keyboard.press('Enter');
});
Then(
  'the sidebar is a rail whose links keep the names «خانه», «بررسی سامانه» and «تنظیمات»',
  async ({ harness }) => {
    const nav = harness.page!.getByRole('navigation');
    await expect(nav).toHaveAttribute('data-rail', 'true');
    await expect.poll(async () => Math.round((await nav.boundingBox())!.width)).toBe(64);
    for (const name of ['خانه', 'بررسی سامانه', 'تنظیمات'])
      await expect(navLink(harness, name)).toBeVisible();
  },
);
When('I activate «بررسی سامانه» in the sidebar', async ({ harness }) => {
  await navLink(harness, 'بررسی سامانه').focus();
  await harness.page!.keyboard.press('Enter');
});
Then('the sidebar is still collapsed', async ({ harness }) => {
  await expect(harness.page!.getByRole('navigation')).toHaveAttribute('data-rail', 'true');
  await expect(
    harness.page!.getByRole('button', { name: 'باز کردن نوار کناری', exact: true }),
  ).toBeVisible();
});

When('reduced motion is preferred', async ({ harness }) => {
  await harness.page!.emulateMedia({ reducedMotion: 'reduce' });
});
Then('every motion duration token is 0ms and the spinner does not rotate', async ({ harness }) => {
  const motion = await harness.page!.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    probe.className = 'spinner';
    document.body.append(probe);
    const spinner = getComputedStyle(probe).animationName;
    probe.remove();
    return {
      tokens: ['--duration-instant', '--duration-fast', '--duration-base', '--duration-slow'].map(
        (name) => style.getPropertyValue(name).trim(),
      ),
      spinner,
      sidebar: getComputedStyle(document.querySelector('.sidebar')!).transitionDuration,
    };
  });
  expect(motion.tokens.every((value) => value === '0ms' || value === '0s')).toBe(true);
  expect(motion.spinner).toBe('none');
  expect(motion.sidebar.split(',').every((value) => parseFloat(value) === 0)).toBe(true);
});

const physicalKeys: Record<string, string> = { '2': '2', comma: ',', equals: '=', '0': '0' };
// sendInputEvent travels Electron's native input path (before-input-event, menu accelerators); Playwright's CDP keyboard bypasses it.
When(
  /^I press CmdOrCtrl and the physical (2|comma|equals|0) key$/,
  async ({ harness }, key: string) => {
    await harness.app!.evaluate(
      ({ BrowserWindow }, [keyCode, modifier]) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents;
        contents.focus();
        for (const type of ['keyDown', 'keyUp'] as const)
          contents.sendInputEvent({ type, keyCode: keyCode!, modifiers: [modifier as 'control'] });
      },
      [physicalKeys[key]!, isMac ? 'meta' : 'control'],
    );
  },
);
Then(/^the route is "#\/settings" and its h1 «تنظیمات» has focus$/, async ({ harness }) => {
  await expect(harness.page!).toHaveURL(/#\/settings$/);
  await expect(
    harness.page!.getByRole('heading', { name: 'تنظیمات', level: 1, exact: true }),
  ).toBeFocused();
});
const zoomLevel = (harness: { app: ElectronApplication | undefined }) =>
  harness.app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.getZoomLevel(),
  );
Then('the page zoom level is above 0', async ({ harness }) => {
  await expect.poll(() => zoomLevel(harness)).toBeGreaterThan(0);
});
Then('the page zoom level is 0', async ({ harness }) => {
  await expect.poll(() => zoomLevel(harness)).toBe(0);
});

Then(
  'the title bar holds only the brand, the screen name and the window controls',
  async ({ harness }) => {
    const labels = await harness
      .page!.locator('header.title-bar')
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(labels).toEqual(isMac ? [] : ['کوچک کردن', 'بزرگ کردن', 'بستن']);
  },
);
Then('there is no native application menu on Windows and Linux', async ({ harness }) => {
  const hasMenu = await harness.app!.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null);
  expect(hasMenu).toBe(isMac);
});
