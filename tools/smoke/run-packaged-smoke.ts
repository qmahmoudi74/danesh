// Packaged smoke runner (Plan 01-08, D-07). Runs the packaged app's headless --smoke-test and adds out-of-process
// evidence: fuse read-back, build-manifest diff, UTF-16 install-path bound, Persian library path, optional NSIS
// install/run/uninstall (Windows) and codesign (macOS). Writes one evidence JSON; exits 1 unless every item passes.
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { FuseV1Options, getCurrentFuseWire, FuseState as WireState } from '@electron/fuses';
import { type SmokeReport, SmokeReportSchema } from '../../packages/contracts/src/smoke-report.ts';
import { findHookMarkers } from '../assert-no-test-hooks.ts';
import { packagedResources } from './build-manifest.ts';
import {
  buildManifest,
  compareFuseWire,
  defaultInstallPathLength,
  diffManifest,
  type FuseState,
  LONG_PERSIAN_USER,
  MAX_PATH,
  type Manifest,
  PRODUCTION_FUSES,
  readAsarTopLevel,
  unexpectedAsarEntries,
} from './smoke-lib.ts';

const RUNNER_VERSION = 1;
const APP_TIMEOUT_MS = 300_000;
type Item = {
  verdict: 'pass' | 'fail' | 'blocked' | 'not-applicable';
  durationMs?: number;
  [key: string]: unknown;
};
const value = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const dist = resolve(value('--dist') ?? 'apps/desktop/dist');

function defaultApp(): string {
  if (process.platform === 'win32') return join(dist, 'win-unpacked', 'Danesh.exe');
  if (process.platform === 'darwin')
    return join(dist, 'mac-arm64', 'Danesh.app', 'Contents', 'MacOS', 'Danesh');
  return join(dist, 'linux-unpacked', 'danesh');
}
const appPath = resolve(value('--app') ?? defaultApp());
const out = resolve(
  value('--out') ??
    `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-a-local/smoke-${process.platform}-${process.arch}.json`,
);
const scratch = mkdtempSync(join(tmpdir(), 'danesh-smoke-'));

function runApp(
  exe: string,
  userDataDir: string,
): Promise<{
  exitCode: number | null;
  durationMs: number;
  report?: SmokeReport;
  reportError?: string;
}> {
  const reportPath = join(scratch, `smoke-app-${Date.now()}.json`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(
      exe,
      ['--smoke-test', `--smoke-out=${reportPath}`, `--user-data-dir=${userDataDir}`],
      { env, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-2000);
    });
    const timer = setTimeout(() => child.kill(), APP_TIMEOUT_MS);
    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      const result: {
        exitCode: number | null;
        durationMs: number;
        report?: SmokeReport;
        reportError?: string;
      } = { exitCode, durationMs: Date.now() - started };
      try {
        result.report = SmokeReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')));
      } catch (error) {
        result.reportError = `${error instanceof Error ? error.name : 'Error'}${stderr ? `; stderr: ${stderr.trim()}` : ''}`;
      }
      done(result);
    });
  });
}

async function fuseItem(exe: string): Promise<Item> {
  const binary = process.platform === 'darwin' ? join(dirname(exe), '..', '..') : exe; // @electron/fuses takes the .app on macOS
  const wire = await getCurrentFuseWire(binary);
  const actual: Record<string, FuseState> = {};
  for (const name of Object.keys(PRODUCTION_FUSES)) {
    const code = wire[FuseV1Options[name as keyof typeof FuseV1Options]];
    actual[name] =
      code === undefined
        ? 'missing'
        : code === WireState.ENABLE
          ? true
          : code === WireState.DISABLE
            ? false
            : 'removed';
  }
  const differing = compareFuseWire(actual);
  return { verdict: differing.length ? 'fail' : 'pass', fuses: actual, differing };
}

function manifestItem(resources: string, recorded: Manifest | undefined): Item {
  if (!recorded)
    return {
      verdict: 'fail',
      reason: 'build-manifest.json missing; run tools/smoke/build-manifest.ts after packaging',
    };
  const diff = diffManifest(recorded.entries, buildManifest(resources).entries);
  return { verdict: diff.ok ? 'pass' : 'fail', entries: recorded.entries.length, ...diff };
}

function pathBoundItem(recorded: Manifest | undefined): Item {
  if (!recorded) return { verdict: 'fail', reason: 'no manifest' };
  const longest = recorded.entries.reduce(
    (best, entry) => {
      const length = defaultInstallPathLength(LONG_PERSIAN_USER, entry.rel);
      return length > best.length ? { rel: entry.rel, length } : best;
    },
    { rel: '', length: 0 },
  );
  return {
    verdict: longest.length < MAX_PATH ? 'pass' : 'fail',
    userNameUtf16: LONG_PERSIAN_USER.length,
    maxInstalledPathUtf16: longest.length,
    longestRel: longest.rel,
    limit: MAX_PATH,
  };
}

/** Existing installs are never removed automatically: they may be the user's own copy. The step is blocked instead. */
function existingInstalls(): string[] {
  const query = spawnSync(
    'reg',
    [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      '/s',
      '/f',
      'Uninstall Danesh.exe',
      '/d',
    ],
    { encoding: 'utf8' },
  );
  return query.status === 0
    ? query.stdout.split(/\r?\n/).filter((line) => line.startsWith('HKEY_'))
    : [];
}

async function nsisItem(recorded: Manifest | undefined): Promise<Item> {
  if (process.platform !== 'win32') return { verdict: 'not-applicable' };
  const installer = readdirSync(dist).find((name) => /^Danesh Setup .+\.exe$/.test(name));
  if (!installer)
    return { verdict: 'fail', reason: 'NSIS installer not found; run pnpm package (not --dir)' };
  const before = existingInstalls();
  if (before.length)
    return {
      verdict: 'blocked',
      reason:
        'An existing per-user Danesh install is registered; it is not removed automatically. Uninstall it, then re-run.',
      keys: before,
    };
  const target = join(scratch, 'دانش نصب آزمون');
  const started = Date.now();
  // NSIS requires /D= to be the last argument and unquoted, even with spaces.
  const install = spawnSync(join(dist, installer), [`/S`, `/D=${target}`], {
    windowsVerbatimArguments: true,
    timeout: APP_TIMEOUT_MS,
  });
  const item: Item = {
    verdict: 'fail',
    installer,
    installDir: target,
    installExit: install.status,
  };
  try {
    const exe = join(target, 'Danesh.exe');
    if (install.status !== 0 || !existsSync(exe)) {
      item.reason = 'silent install did not produce Danesh.exe';
      return item;
    }
    const installedDiff = recorded
      ? diffManifest(recorded.entries, buildManifest(join(target, 'resources')).entries)
      : undefined;
    const library = join(scratch, 'کتابخانهٔ نصب‌شده');
    const run = await runApp(exe, library);
    item.installedManifest = installedDiff;
    item.installedRun = {
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      overall: run.report?.overall,
      reportError: run.reportError,
    };
    item.verdict =
      installedDiff?.ok && run.exitCode === 0 && run.report?.overall === 'pass' ? 'pass' : 'fail';
    return item;
  } finally {
    const uninstaller = join(target, 'Uninstall Danesh.exe');
    if (existsSync(uninstaller)) {
      spawnSync(uninstaller, ['/S'], { timeout: 120_000 });
      // The NSIS uninstaller re-launches itself from %TEMP% and returns at once; wait for the files to go.
      const deadline = Date.now() + 120_000;
      while (existsSync(join(target, 'Danesh.exe')) && Date.now() < deadline)
        await new Promise((wait) => setTimeout(wait, 500));
      item.uninstalled = !existsSync(join(target, 'Danesh.exe'));
      if (!item.uninstalled) item.verdict = 'fail';
    }
    item.durationMs = Date.now() - started;
  }
}

function codesignItem(): Item {
  if (process.platform !== 'darwin') return { verdict: 'not-applicable' };
  const bundle = resolve(appPath, '..', '..', '..');
  const result = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle], {
    encoding: 'utf8',
  });
  return {
    verdict: result.status === 0 ? 'pass' : 'fail',
    bundle,
    output: (result.stderr || result.stdout).slice(0, 2000),
  };
}

async function main(): Promise<number> {
  if (!existsSync(appPath)) throw new Error(`Packaged app not found: ${appPath}`);
  const resources = packagedResources(dist);
  const manifestFile = join(dist, 'build-manifest.json');
  const recorded = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest)
    : undefined;
  const persian = process.argv.includes('--persian-paths');
  // Leading space, Persian letters and ZWNJ; macOS also gets a trailing-space folder.
  const library = persian
    ? join(scratch, ' دانش آزمون', process.platform === 'darwin' ? 'کتابخانهٔ من ' : 'کتابخانهٔ من')
    : join(scratch, 'library');
  mkdirSync(dirname(library), { recursive: true });
  const run = await runApp(appPath, library);
  // Keep the run's own metadata-only logs (D-16) next to the evidence; CI uploads evidence-tmp/.
  if (existsSync(join(library, 'logs')))
    cpSync(
      join(library, 'logs'),
      resolve('evidence-tmp', `logs-${process.platform}-${process.arch}`),
      { recursive: true },
    );
  const items: Record<string, Item> = {
    appRun: {
      verdict: run.exitCode === 0 && run.report?.overall === 'pass' ? 'pass' : 'fail',
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      reportError: run.reportError,
    },
    persianLibraryPath: persian
      ? {
          verdict: existsSync(join(library, 'danesh.db')) ? 'pass' : 'fail',
          path: library,
          folder: basename(library),
        }
      : { verdict: 'not-applicable' },
    fuses: await fuseItem(appPath),
    manifest: manifestItem(resources, recorded),
    asarContents: (() => {
      const topLevel = readAsarTopLevel(join(resources, 'app.asar'));
      const unexpected = unexpectedAsarEntries(topLevel);
      return { verdict: unexpected.length ? 'fail' : 'pass', topLevel, unexpected } satisfies Item;
    })(),
    installPathBound: pathBoundItem(recorded),
    // The packaged artifact itself, not just the bundler output, must be free of test hooks.
    testHooks: (() => {
      const found = findHookMarkers([
        join(resources, 'app.asar'),
        ...(existsSync(join(resources, 'app.asar.unpacked'))
          ? [join(resources, 'app.asar.unpacked')]
          : []),
      ]);
      return {
        verdict: found.length ? 'fail' : 'pass',
        markers: found.map((hit) => hit.marker),
      } satisfies Item;
    })(),
    nsis: process.argv.includes('--install-nsis')
      ? await nsisItem(recorded)
      : { verdict: 'not-applicable' },
    codesign: codesignItem(),
  };
  const failing = Object.entries(items)
    .filter(([, item]) => item.verdict === 'fail' || item.verdict === 'blocked')
    .map(([name]) => name);
  const evidence = {
    runnerVersion: RUNNER_VERSION,
    recordedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    appPath,
    items,
    appReport: run.report,
    verdict: failing.length ? 'fail' : 'pass',
    failing,
  };
  mkdirSync(dirname(out), { recursive: true });
  // Evidence is committed to a public repository: the local home directory (and so the user name) is replaced by ~.
  const home = JSON.stringify(homedir()).slice(1, -1);
  writeFileSync(out, JSON.stringify(evidence, null, 2).replaceAll(home, '~') + '\n');
  console.log(
    `packaged-smoke: verdict=${evidence.verdict}${failing.length ? ` failing=${failing.join(',')}` : ''} out=${out}`,
  );
  return failing.length ? 1 : 0;
}

main()
  .then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`packaged-smoke: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  )
  .finally(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }));
