# Phase 1: Secure, Durable Foundation & Packaging Gate - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 62 (planned new files, grouped)
**Analogs found:** 0 in-repo / 62. This is a greenfield repository.

## Greenfield Statement

`git ls-files` outside `.planning/` returns only `.claude/CLAUDE.md` and `PRODUCT_BRIEF_DANESH.md`. There is no application source code. The untracked `.claude/gsd-core` tooling is third-party and is NOT an analog for Danesh code.

Consequences for the planner:
- Every file below is "no in-repo analog".
- The reference source is the verified material in `01-RESEARCH.md`. Each entry points to the section to copy from. No excerpts are invented here. Short excerpts are quoted only where they are copied verbatim from RESEARCH.
- Plan 01 (walking skeleton) creates the baseline that every later plan in this phase must use as its analog. After Plan 01, later plans should cite the Plan 01 file as the analog, not RESEARCH.
- RESEARCH says its `[VERIFIED: Rn]` runs were done in scratch directories outside the repo. Re-run them in-repo.

Tracked-source gate: no analog paths are named, so no mirror paths can leak.

## File Classification

Paths follow RESEARCH §Recommended Project Structure. Reference column = where the pattern lives (all in `01-RESEARCH.md`).

| New file(s) | Role | Data flow | Closest analog | Reference |
|---|---|---|---|---|
| `pnpm-workspace.yaml`, root `package.json` (`license: UNLICENSED`, `packageManager`) | config | n/a | none | §Standard Stack Installation, OQ7 |
| `apps/desktop/electron.vite.config.ts` | config | build | none | Pattern 1 |
| `apps/desktop/package.json` (`type: module`, `main: out/main/index.js`, native deps in `dependencies`, workspace pkgs in `devDependencies`) | config | build | none | Pattern 1 |
| `apps/desktop/electron-builder.yml`, `electron-builder.test.yml`, `build/entitlements.mac.plist` | config | build | none | §Code Examples Electron-builder config, Pitfalls 5, 6, 7, 12 |
| `apps/main/src/index.ts` (lifecycle, single-instance, window, lockdown) | controller | request-response | none | Patterns 2, 3, 8 (L1); §Security Domain V4, V14 |
| `apps/main/src/protocol.ts` (`app://` handler, nonce CSP) | service | request-response | none | Pattern 3 |
| `apps/main/src/supervisor.ts` (impure shell around fork) | service | event-driven | none | Pattern 4, R8 |
| `apps/main/src/ports.ts` (MessageChannelMain broker) | service | pub-sub | none | Pattern 2 |
| `apps/main/src/egress-l1.ts` (webRequest cancel, spellcheck off, permissions deny) | middleware | request-response | none | Pattern 8 L1 |
| `apps/preload/src/index.ts` (CJS, private port, `window.danesh.call`) | provider | request-response | none | Pattern 2, Pitfall 3, §Walking Skeleton step 3 |
| `apps/renderer/index.html`, `src/main.tsx`, `AppShell`, `StatusBadge`, `Banner`, `CheckRow`, `TechnicalDetail`, `Ltr`, `ChunkStrip`, Home and System check screens | component | request-response | none | `01-UI-SPEC.md` §Component Inventory, §Screen Contracts; Pattern 3 (nonce meta); Pitfall 9 |
| `apps/core/src/index.ts` (utilityProcess entry, RPC server) | controller | request-response | none | Pattern 2 (core side), §System Architecture Diagram |
| `packages/contracts/src/*` (zod strict RPC map, host protocol, smoke-report schema) | model | request-response | none | §Don't Hand-Roll (IPC validation), §Walking Skeleton, §Security V5 |
| `packages/domain/jobs/src/*` (FSM, `backoffMs`, boot-recovery decisions) | utility | transform | none | Patterns 4, 7 |
| `packages/storage/src/db.ts` + better-sqlite3 adapter | service | CRUD | none | Pattern 5 (pragmas), §Standard Stack, Pitfall 10 |
| `packages/storage/src/migrate.ts`, `migrations/0001_init.sql` | migration | batch | none | Pattern 5 |
| `packages/storage/src/backup.ts` | service | file-I/O | none | Pattern 5 (Backup) |
| `packages/storage/src/cas.ts` | service | file-I/O | none | Pattern 6, Pitfall 11 |
| `packages/storage/src/jobs-repo.ts` (claim/commit/recover SQL) | service | CRUD | none | Pattern 7 |
| `packages/egress/src/*` (broker skeleton, empty allowlist, Node guard) | middleware | request-response | none | Pattern 8 L3, D-17 |
| `packages/engine-api/src/*` (EngineHost protocol, fake host with fault modes) | service | event-driven | none | §Code Examples crash-injection fault modes |
| `packages/engines/{llm-probe,ocr-probe,tts-probe}/src/host.ts` | service | streaming/request-response | none | Pitfalls 6, 7, §Standard Stack Probe engines, R2-R4 |
| `apps/core` + `apps/main` logging module (JSONL, rotating) | utility | file-I/O | none | D-16, §Security V7 |
| `tools/{license-scan,fetch-probes,check-report,check-features-first,check-adr}.ts`, `tools/probes.lock.json` | utility | batch | none | §Don't Hand-Roll (SPDX), §Verification-report format, R14, Pitfall 15; run with `node x.ts` |
| `tools/smoke/run-packaged-smoke.ts` (+ `--smoke-test --smoke-out` handler in Main) | utility | batch | none | D-07, OQ4, R5 (fuse read via `@electron/fuses` `getCurrentFuseWire`) |
| `.dependency-cruiser.cjs`, `eslint.config.*` (no-restricted-globals fetch, no-floating-promises) | config | n/a | none | R11, §Standard Stack Supporting |
| `vitest.config.ts` (projects), `apps/desktop/playwright.config.ts` | config | n/a | none | §Validation Architecture, §Playwright fixture |
| `features/steps/fixtures.ts`, `features/ui/*.feature`, `features/core/*.feature` | test | request-response | none | §Playwright + playwright-bdd fixture, §Gherkin organization |
| unit tests per core (FSM, migrations, CAS, IPC, egress policy, supervisor backoff) | test | n/a | none | §Validation Architecture Req->Test map, D-21 |
| `.github/workflows/ci.yml` | config | batch | none | §GitHub Actions skeleton |
| `docs/adr/0000-template.md`, `0001..0003`, `0004` (blocked on D-01) | config (docs) | n/a | none | §ADR template |
| `third_party/binary-licenses.json`, `resources/probes/NOTICE` | config (docs) | n/a | none | Pitfall 15, OQ3 |
| `.planning/phases/01-.../01-VERIFICATION.md`, Tier B runbook | config (docs) | n/a | none | §Gherkin organization and verification-report format |

## Pattern Assignments

For every entry the instruction is the same: no in-repo analog; copy from the cited RESEARCH section. The most load-bearing verbatim fragments are quoted.

### Main process (`apps/main/src/*`), role controller/service, request-response and event-driven
**Source:** RESEARCH Patterns 2, 3, 4, 8 L1.
- Register the privileged scheme before ready (Pattern 3, RESEARCH lines 415-416):
  ```ts
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  ```
- Handler: reject host != `danesh`, `normalize(join(rendererRoot, p))` plus `startsWith(rendererRoot + sep)` traversal check (403), `fs.readFile` (never `net.fetch(file://)`), per-response nonce replacing `__CSP_NONCE__` in `.html`, and the CSP header string given in Pattern 3. Dev-server relaxation only when `!app.isPackaged`.
- Port brokering (Pattern 2): `new MessageChannelMain()`, `core.postMessage({type:'renderer-port'},[port2])`, `win.webContents.postMessage('danesh:port', null, [port1])` only after the sender frame origin is `app://danesh`. Transfer lists accept ports only. Large payloads go as blob/tmp references.
- Main forks Core and every host (`utilityProcess` is Main-only, assumption A12). Fork paths: `join(import.meta.dirname, 'core.js')`.
- Lockdown: `will-navigate` block, `setWindowOpenHandler` deny, permission handlers deny, single-instance lock, `secureWebPreferences()` as a pure exported function so it is unit-testable (PLAT-01 test map).
- Heap-bounded fork for the real-OOM test only: `execArgv: ['--js-flags=--max-old-space-size=64']`.
- Pitfall 1: `delete env.ELECTRON_RUN_AS_NODE` in scripts, fixtures and the smoke runner.
- Open Question 1: `app.setPath('userData', join(process.env.LOCALAPPDATA!, 'Danesh'))` (and `sessionData`) before `ready` on Windows. A decision for the planner; record it in ADR 0001/0003.

### Supervisor (`packages/domain/jobs` pure policy + `apps/main/src/supervisor.ts` shell)
**Source:** RESEARCH Pattern 4, lines 432-442.
```ts
export interface Spawner { spawn(kind: string): ChildHandle }              // wraps utilityProcess.fork
export interface ChildHandle { onExit(cb: (code: number | null) => void): void; kill(): void; postMessage(m: unknown, t?: unknown[]): void }
export const backoffMs = (restart: number, o = { base: 250, cap: 15_000 }) => Math.min(o.cap, o.base * 2 ** restart);
```
Rule: any exit the supervisor did not request is a crash (V8 OOM exits 0, R8). Do not rely on `child-process-gone.reason`. On crash: in-flight tasks go to queued with attempt+1, or quarantined past `max_attempts`. Respawn after `backoffMs(n)`, reset after a stable period, open a circuit after K crashes per window. Test with fake processes and a fake clock (D-21).

### Preload (`apps/preload/src/index.ts`), provider, request-response
**Source:** Pattern 2 plus Pitfall 3.
- Must be CommonJS: rollup `output: { format: 'cjs', entryFileNames: '[name].cjs' }`, load `index.cjs`.
- `ipcRenderer.on('danesh:port', e => { port = e.ports[0]; ... })`, keep the port private, expose only `window.danesh.call(channel, payload)`.
- Validate with zod before sending. Core validates again (PLAT-02).
- E2E asserts `typeof require === 'undefined'` in the page.

### Renderer (`apps/renderer/*`), component
**Source:** `01-UI-SPEC.md` §Component Inventory (React Aria Components: Button, Link, ProgressBar, Disclosure/Toolbar; custom: `AppShell`, `StatusBadge`, `Banner`, `CheckRow`, `TechnicalDetail`, `Ltr`, `ChunkStrip`). Tailwind 4 logical properties only. `<html lang="fa" dir="rtl">`, Vazirmatn via `@fontsource-variable/vazirmatn`.
- CSP nonce: `index.html` contains `<meta property="csp-nonce" content="__CSP_NONCE__">` (React Aria injects a `<style>` and needs it, Pitfall 9).
- Add a Playwright assertion of zero `securitypolicyviolation` events.
- No mock reader, import button or study placeholder (D-10).
- UI-SPEC section line anchors for the planner: Component Inventory L48, Screen Contracts L289, Copy tables L200-L280.

### Core entry (`apps/core/src/index.ts`), controller, request-response
**Source:** Pattern 2 core side (RESEARCH line 409) plus §System Architecture Diagram.
```ts
process.parentPort.on('message', e => { const [port] = e.ports; port.on('message', ...); port.start(); })
```
- Order: import the egress guard first, open the DB through the migration runner, then start the RPC server (zod strict, closed method map), then job kernel wiring.
- Core is the single SQLite writer and CAS writer. Hosts get no DB handle and no sockets.

### Contracts (`packages/contracts`), model
**Source:** RESEARCH §Don't Hand-Roll and §Security V5: zod 4 `.strict()` objects, max sizes, one source for types and validators. A ~100-line typed channel map, no electron-trpc (CONTEXT Discretion). Rejections log schema name, sender and error only, never the payload (D-16). Also holds the smoke-report schema (D-07 checks: launch, db, CAS, each engine with output hash, UI responsive, zero egress, fuse state, codesign on macOS).

### Storage: `Db` + migrations (`packages/storage`), service/migration, CRUD/batch
**Source:** Pattern 5, RESEARCH lines 444-449.
- Pragmas at open: `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`. STRICT tables.
- Table: `schema_migration(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT`. Checksum = sha256 of the file bytes with `\r\n` normalized to `\n`.
- Refuse-newer probe: `new Database(p, { readonly: true, fileMustExist: true })`, read `PRAGMA user_version` and max migration id, and compare applied checksums. Do not parse the raw header (stale until checkpoint, R10).
- Backup: `db.prepare('VACUUM INTO ?').run(tmpPath)` into `tmp/`, then rename to `backups/danesh-v{N}-{ISO}.db`. Outside a transaction, target absent, keep last 3. `index.db` is rebuildable, no backup.
- Apply: per migration `BEGIN IMMEDIATE`, run SQL, insert `schema_migration`, `PRAGMA user_version = N` inside the transaction, `PRAGMA foreign_key_check` must return zero rows, `COMMIT`, then `wal_checkpoint(TRUNCATE)`. On failure `ROLLBACK`, enter read-only recovery and surface the backup path.
- better-sqlite3 must stay external (loads `../prebuilds/<platform>-<arch>.node` via `__dirname`, Pitfall 10).
- Keep the `Db` interface synchronous. Kysely is optional (CONTEXT D-15, RESEARCH Standard Stack).

### CAS (`packages/storage/src/cas.ts`), service, file-I/O
**Source:** Pattern 6, RESEARCH lines 451-456.
1. Stream to `tmp/<hash>.<pid>.<rand>` hashing while writing, `fsync`, close.
2. Publish with `fs.link(tmp, final)` (EEXIST is atomic), then `unlink(tmp)`. On link unsupported use `rename`; treat `EEXIST/EPERM/EBUSY/EACCES` as "verify existing file's hash, then success" or bounded backoff retry.
3. Skip directory `fsync` on `win32` (EPERM). Do it on POSIX.
4. Boot sweep clears `tmp/`. CAS path derived from the hash only. Verify the hash on read-back.

### Job kernel SQL (`packages/storage/src/jobs-repo.ts`), service, CRUD
**Source:** Pattern 7, RESEARCH lines 459-467 (verified under SIGKILL, R10). Quoted verbatim:
```sql
-- claim (single writer):  UPDATE task SET state='running', attempt=attempt+1, boot_id=:boot
--   WHERE task_id=(SELECT task_id FROM task WHERE job_id=:j AND state='queued' ORDER BY task_id LIMIT 1)
--   RETURNING task_id, unit_key, attempt;
-- commit (ONE transaction): INSERT INTO exec_log(task_id,attempt) ...; UPDATE task SET state='done', output_ref=:hash WHERE task_id=:id;
-- boot recovery:  UPDATE task SET state='queued' WHERE state='running' AND boot_id IS NOT NULL AND boot_id != :currentBoot;
--   then tasks with attempt >= max_attempts -> 'quarantined'; sweep tmp/.
-- idempotent fan-out: INSERT OR IGNORE INTO task(job_id, unit_key, state) ...  with UNIQUE(job_id, unit_key)
```
"No redo" proof: `exec_log(task_id, attempt)` is written in the same transaction as the `done` flip and asserted to have one row per completed task. Crash test points: `after-claim`, `after-blob`, `after-commit` with real SIGKILL.

### Egress (`packages/egress` + `apps/main/src/egress-l1.ts`), middleware
**Source:** Pattern 8, RESEARCH lines 470-475.
- L1: `session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*','ftp://*/*'] }, (d, cb) => { log(host only); cb({ cancel: true }); })`, `session.setSpellCheckerEnabled(false)`, deny all permissions.
- L2 (test): `--proxy-server=http://127.0.0.1:<sink>`, `--proxy-bypass-list=<-loopback>`, assert empty sink, positive control (`net.fetch` to example.com must appear).
- L3: `egress-guard` imported first in Core and every host. It denies and records `net.Socket.connect`, `dns.*`, `tls.connect`, `http(s).request` and global `fetch`, and allows IPC pipes (`path`).
- L4 (test): sample process-tree endpoints about every 150 ms (Windows `Get-NetTCPConnection`/`Get-NetUDPEndpoint`; macOS `lsof -nP -iTCP -iUDP -a -p <pids>` is ASSUMED A3).
- Lint: dependency-cruiser forbids `http,https,net,tls,dns,undici` outside `packages/egress` (static and dynamic imports); ESLint `no-restricted-globals` for `fetch`/`XMLHttpRequest` (R11). dep-cruiser rejects "unsafe" regexes such as `(/.*)?$`.

### Engine API + fake host (`packages/engine-api`), service, event-driven
**Source:** RESEARCH §Code Examples crash-injection fault modes, lines 627-636 (host executes the fault after acknowledging):
```ts
case 'exit0':  process.exit(0);                 // looks like success: must still be a crash
case 'exit1':  process.exit(1);
case 'abort':  process.abort();                 // exit 134, reason 'crashed'
case 'spin':   for (;;) {}                      // supervisor watchdog -> child.kill()
case 'oom':    for (const a = [];;) a.push(new Array(1e5).fill(1.5));  // ONLY with execArgv ['--js-flags=--max-old-space-size=64']
```
Wrap the whole file in `__TEST_HOOKS__` so it is tree-shaken from production. Add a build assertion that greps `out/` and the packaged asar (A10).

### Probe hosts (`packages/engines/*/src/host.ts`), service, request-response
**Source:** RESEARCH §Standard Stack Probe engines plus Pitfalls 6-7.
- LLM: `getLlama({ gpu: false, build: 'never', skipDownload: true })`. ESM host. Fixture `stories15M-q4_0.gguf` sha256 `6151b192...a04` (R2).
- OCR: tesseract.js with `langPath`, `gzip:false`, `cacheMethod:'none'`; ship `tesseract-core.*`, `-simd.*`, `-relaxedsimd.*`; assert a fuzzy first-word match (R4).
- TTS: onnxruntime-node only (sherpa-onnx is excluded: espeak-ng GPL embedded, R13). Fixture `fa_IR-mana-medium.onnx`, hand-picked phoneme IDs, `scales=[0,1,0]` (R3). One ONNX Runtime per process.
- Each host emits a result or heartbeat so "exited without delivering a result" is the crash signal (Pitfall 8). Import the egress guard first.
- Pin fixtures by commit and sha256 in `tools/probes.lock.json`. Probe asset budget is 150 MB or less (D-23).
- On any load failure in a packaged `utilityProcess`, raise D-24 (`checkpoint:decision`). Do not move the engine into Main.

### Packaging config, config, build
**Source:** RESEARCH §Code Examples Electron-builder config, lines 560-608 (copy near-verbatim; Windows verified, macOS per docs). Key points:
- `npmRebuild: false`; `asarUnpack` limited to native binary dirs; per-platform `files` exclusions; `electronFuses` with the six D-09 keys; `win.signAndEditExecutable: false`; `mac.identity: "-"`, `hardenedRuntime: true`, `minimumSystemVersion: "13.0"`.
- Fallback if `codesign --verify --deep --strict` flags `.so`: `mac.binaries` list (A1).
- Test build: second YAML `extends` the first, `appId: dev.danesh.app.test`, `productName: DaneshTest`, `directories.output: dist-test`, `enableNodeCliInspectArguments: true`, built with `electron-vite build --mode test`. Never publish `dist-test`.
- pnpm: `nodeLinker: hoisted`, explicit `allowBuilds` (esbuild true; node-llama-cpp, electron-winstaller, onnxruntime-node false). Install env `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip`.
- Smoke runner must diff the installed `resources/` tree against a build-time manifest (hash list) and fail on any difference (Pitfall 5, MAX_PATH at 260).

### Smoke runner and System check, utility, batch
**Source:** CONTEXT D-07, D-11; RESEARCH OQ4. The production build handles `--smoke-test --smoke-out=<abs path>` in Main, runs the same checks as the System check screen, writes the JSON and exits 0/1. The out-of-process runner merges fuse state (`@electron/fuses` `getCurrentFuseWire`; char codes 48 = disabled, 49 = enabled; indices from `FuseV1Options`) and macOS `codesign` results. Use 60-90 s timeouts and record durations (Pitfall 14). Do not call `spctl --assess` on ad-hoc builds.

### Tests and Gherkin, test
**Source:** RESEARCH §Playwright + playwright-bdd fixture (lines 610-624) and §Gherkin organization.
- Fixture: `electron.launch({ executablePath: process.env.DANESH_TEST_EXE!, args: ['--user-data-dir=' + userDataDir], env })` with `delete env.ELECTRON_RUN_AS_NODE`; `createBdd(test)`; `defineBddConfig({ features: 'features/ui/**/*.feature', steps: ['features/steps/*.ts'] })`; run `bddgen` then `playwright test`; gitignore `.features-gen/`.
- Core scenarios: `@amiceli/vitest-cucumber` (fails on unmatched steps, so the red phase is real).
- Tags: `@req-PLAT-01`, `@tier-a`, `@tier-b-manual`, `@ui|@core`. Each file covers happy path, invalid input, edge, recovery, cancellation, persistence (or a `# n/a because` comment).
- `.feature` files must land in an earlier commit than their step definitions (D-20; `tools/check-features-first.ts` checks git order).
- TS 6.0 needs explicit `"types": ["node"]`.
- Walking-skeleton features named in RESEARCH: `features/ui/walking-skeleton.feature`, `features/core/ipc-validation.feature`.

### CI workflow, config, batch
**Source:** RESEARCH §GitHub Actions skeleton, lines 639-663. Matrix `windows-latest`, `macos-latest`; action majors checkout v7, setup-node v7, pnpm/action-setup v6, cache v6, upload-artifact v7 (re-verify at authoring time); `pnpm install --frozen-lockfile`; lint, typecheck, depcruise, `licenses:scan`, test; `fetch-probes`; `package`; smoke; e2e; upload evidence. Validate locally via `pnpm ci:local`. Pushing needs authorization (D-18).

### ADRs, docs
**Source:** RESEARCH §ADR template (lines 667-684): MADR 4.0 front matter plus the extra sections Spike Evidence (platforms actually run, fixtures with sha256, pass policy committed before the run, result), License, Packaging, Security. ADR 0004 and LICENSE are blocked on D-01.

### License scan (`tools/license-scan.ts`), utility, batch
**Source:** RESEARCH §Don't Hand-Roll and R14. Use `pnpm licenses list --json` run from a workspace member directory (root returns `{}`), `spdx-expression-parse` and `spdx-satisfies` (handle `WTFPL OR ISC`, `(MIT OR CC0-1.0)`), an allowlist of MIT/ISC/BSD/Apache-2.0/0BSD/BlueOak/OFL-1.1, and a hand-reviewed exception for `CC-BY-4.0` (caniuse-lite), `Python-2.0` and similar. Exempt only Danesh's own workspace packages (`UNLICENSED`, OQ7). Complement with `third_party/binary-licenses.json` for native prebuilds (Pitfall 15).

## Shared Patterns

No in-repo source exists. These cross-cutting rules come from RESEARCH and CONTEXT, and Plan 01 must make them real so later plans can copy them.

| Concern | Apply to | Source |
|---|---|---|
| Validate at both ends (zod strict, size caps) | preload, Core, hosts | PLAT-02, §Security V5 |
| Never log payloads or user content; JSONL, IDs/hashes/classes/counts | all processes | D-16, §Security V7 |
| Import the egress guard first in every non-renderer process | Core, hosts | Pattern 8 L3 |
| Only `packages/egress` imports network APIs | all packages | D-17, R11 lint |
| Main never opens the DB; hosts get no DB or sockets | main, engines | D-14, ARCHITECTURE Anti-Patterns 1, 2, 7 |
| Any unrequested child exit is a crash | supervisor, tests | Pattern 4, R8 |
| Paths are full Unicode; test with Persian + spaces; no ASCII-only fallback | storage, hosts, smoke | D-13, R5 |
| Test-only hooks behind `__TEST_HOOKS__`, never in production | main, core, engine-api | Pattern 1, A10 |
| Pure-domain / impure-shell split with injectable ports (spawner, clock, fs) | domain/jobs, supervisor, kernel | Pattern 4, D-21 |
| Unset `ELECTRON_RUN_AS_NODE` | scripts, fixtures, runner | Pitfall 1 |
| Bounded retry with backoff for `EPERM/EBUSY/EACCES` on Windows file ops | CAS, backup | Pitfall 11 |
| Tests and `.feature` files before implementation | all deterministic cores | D-20, D-21 |

## No Analog Found

All planned files (see File Classification). The planner should use the cited RESEARCH patterns. Items with no verified reference even in RESEARCH, to design fresh and record in an ADR:
- Rotating JSONL logger (sizes are Claude's discretion per CONTEXT).
- The typed RPC channel map (about 100 lines, design is discretionary).
- Persian copy and screen layout details: take from `01-UI-SPEC.md`, not RESEARCH.
- The macOS L4 sampler and macOS signing of `.so` files (A1, A3 unverified; macOS never reported verified without Tier B).
- Windows-profile Tier B runbook (A7, `net user` with a Persian name is assumed).

## Metadata

**Analog search scope:** `git ls-files` for the whole repo, plus `ls` of the repo root. Untracked `.claude/gsd-core` deliberately excluded.
**Files scanned:** 2 tracked non-planning files; CONTEXT, RESEARCH (fully read), UI-SPEC (component and section grep only).
**Pattern extraction date:** 2026-10-09
