import { _electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
const repo = resolve(import.meta.dirname, '../../../..');
const libraryRoot = await mkdtemp(join(tmpdir(), "دانش نمایشی '"));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [join(repo, 'apps/desktop'), '--user-data-dir=' + libraryRoot], env });
const evidence = [];
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.context().addInitScript(() => { const violations = []; window.__cspViolations = violations; document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective)); });
  await page.reload();
  await page.getByRole('heading', { name: 'نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست', exact: true }).waitFor();
  await page.locator('footer bdi').waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 720));
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({ title: document.title, direction: document.documentElement.dir, font: getComputedStyle(document.body).fontFamily, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, csp: window.__cspViolations }));
    if (metrics.scrollWidth > metrics.width || metrics.csp.length) throw new Error(JSON.stringify(metrics));
    // Capture without a CSS-pixel clip: Electron zoom changes CSS/viewport scaling.
    const session = await page.context().newCDPSession(page);
    try {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      await writeFile(join(import.meta.dirname, name + '.png'), Buffer.from(data, 'base64'));
    } finally { await session.detach(); }
    evidence.push({ screenshot: name + '.png', ...metrics });
  }
  await capture('01-06-home-720');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
  await capture('01-06-home-720-200');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await page.getByRole('button', { name: 'بررسی سامانه', exact: true }).click();
  await page.evaluate(() => window.danesh.call('test.checkRun', { delayMs: 100, checks: [
    { checkId: 'app-launch', status: 'pass', durationMs: 1, detail: 'Visual fixture pass', fields: { corePid: 1 } },
    { checkId: 'database', status: 'fail', durationMs: 1, detail: 'Visual fixture failure', fields: { path: "D:\u005c" + "پوشهٔ آزمون ' با نام طولانی/".repeat(15), diagnostic: 'A multiline diagnostic\n'.repeat(40) } },
  ] }));
  await page.getByRole('button', { name: 'اجرای بررسی', exact: true }).click();
  await page.getByRole('button', { name: 'اجرای دوباره', exact: true }).waitFor();
  await page.locator('[data-check-id="database"]').getByRole('button', { name: 'جزئیات فنی', exact: true }).click();
  await page.getByRole('button', { name: 'اطلاعات محیط اجرا', exact: true }).click();
  const region = page.getByRole('region', { name: 'جزئیات فنی اطلاعات محیط اجرا', exact: true });
  await region.waitFor();
  // Layout stress only: this 300+ character display fixture is not a native long-path launch claim.
  await region.locator('dt').filter({ hasText: /^libraryRoot$/ }).locator('..').locator('bdi').evaluate(el => { el.textContent = "D:/پوشهٔ آزمون ' با نام طولانی/".repeat(15); });
  await capture('01-06-system-partial-720');
  evidence.push(await page.locator('[data-check-id="database"] .technical').evaluate(el => ({ technicalMaxBlockSize: getComputedStyle(el).maxBlockSize, blockSize: el.getBoundingClientRect().height, focusable: el.tabIndex, role: el.getAttribute('role'), arrowRotate: getComputedStyle(document.querySelector('.link svg')).rotate, expandedChevronTransform: getComputedStyle(document.querySelector('[data-check-id="database"] .chevron')).transform })));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
  await capture('01-06-system-partial-720-200');
  await page.locator('[data-check-id="database"]').scrollIntoViewIfNeeded();
  await capture('01-06-system-detail-720-200');
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.getByRole('button', { name: 'اجرای دوباره', exact: true }).focus();
  evidence.push(await page.getByRole('button', { name: 'اجرای دوباره', exact: true }).evaluate(el => ({ forcedColorOutline: getComputedStyle(el).outlineColor, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })));
  evidence.push(await app.evaluate(({ Menu }) => ({ menu: Menu.getApplicationMenu().items.map(item => ({ label: item.label, items: item.submenu?.items.map(child => ({ label: child.label, role: child.role, accelerator: child.accelerator, enabled: child.enabled })) })) })));
  await writeFile(join(import.meta.dirname, '01-06-visual-results.json'), JSON.stringify({ platform: process.platform, capturedAt: new Date().toISOString(), note: 'Test-build visual fixtures; long display path is a CSS stress fixture, not actual native userData. Human visual/UAT and macOS checks remain pending.', evidence }, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await app.close();
  if (dirname(resolve(libraryRoot)) !== resolve(tmpdir()) || !basename(libraryRoot).startsWith("دانش نمایشی '")) throw new Error('Unsafe cleanup');
  await rm(libraryRoot, { recursive: true, force: true });
}
