# Plan 01-13 local Windows verification, 2026-10-10

Candidate: kernel `f77d1a0`, host/Core/UI `05809fb`, stronger packaged assertions `0d6872d`.
Separate pure Plan 01-14 checkpoint: `e51e8c7`. Node 24.21.0, Electron 44.7.0, Windows x64.
No new dependency, performance-policy change or macOS execution occurred.

| Actual command/check | Result |
| --- | --- |
| Focused kernel FSM/repository tests | 66 passed; initial collection failed before modules existed |
| `durable-jobs.feature.test.ts` | 46 steps passed, including real SIGKILL at claim/blob/commit and two restarts |
| Focused service/contracts tests | Four passed, including well-shaped incorrect host hashes refused before commit |
| Delayed requested host-exit regression | Failed before correction; `engines.test.ts` passed after correction |
| `pnpm vitest run --project domain --project storage` | Nine files, 273 tests passed |
| Focused Plan 01-14 policy/lifecycle test file | Nine passed; fake clock/children, not actual engine crash containment |
| `pnpm test` (one broad run) | 570 passed, one failed: new token omitted from dark theme |
| Corrective `design-tokens.test.ts` | Five passed after defining the token in both themes |
| `pnpm test:e2e` (one broad run) | 51 passed, seven failed from duplicate status regions, 22 future/packaged-only skips |
| Corrective `DANESH_E2E_GREP='@plan-01-13\|Local System check' pnpm test:e2e` | 22 passed, three unrelated intentional skips; all nine Plan 01-13 scenarios passed |
| Packaged `DANESH_E2E_PACKAGED=1 DANESH_E2E_GREP='@plan-01-13\|@plan-01-08' pnpm test:e2e` | 10 passed, none skipped; real packaged job recovery and fuse positive control |
| `pnpm package` | Production Windows NSIS build passed; test-hook scanner zero markers |
| Test-build scanner positive control | 18 markers, passed |
| `pnpm smoke:packaged --persian-paths --install-nsis --out .../01-13-packaged-smoke-win32-x64.json` | Passed, including actual install/run/uninstall; installed report overall pass, uninstalled true |
| `validate-evidence.ts --require-persian-path --require-os win32` with all eight check ids | Passed: launch, database, CAS, LLM/OCR/TTS, responsiveness, fuses |
| `pnpm check:format`, `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` | Passed; changed subsets/typecheck rerun after corrections; 205 modules, 689 dependencies, no violations |
| `pnpm check:ci`, `pnpm check:adr`, `pnpm licenses:scan` | Passed; 750 entries, zero license failures; existing review warnings retained |
| `pnpm check:features --allow-unbound` | Passed after source commits; zero failures, later-plan bindings remain pending |

Expensive broad tests were not repeated after focused corrections. There is no claim of a single clean full-suite
rerun. All enabled behavior affected by the corrections was exercised again. The integration checkpoint was
necessary because this increment changes durable schema, utility-host outputs, Core boot/RPC and UI.

The Windows recovery test initially killed Playwright's launcher wrapper. Actual process observations showed
Electron Main still alive. The corrected test retrieves Main's actual PID, kills it with SIGKILL, waits for recorded
children to exit, and relaunches the same library. It passes in both development and packaged builds.

[Saved smoke](01-13-packaged-smoke-win32-x64.json): verdict pass; idle timer-lateness p95 12ms/40 samples,
loaded 13ms/119 samples; zero recorded renderer long tasks. This local evidence does not close hosted CI or Tier B.

Prior observed CI: https://github.com/qmahmoudi74/danesh/actions/runs/38026098213 failed formatting on both jobs.
Maintenance commit `55626a6` formats the three PDF evaluation tools and removes the unreferenced `_show.ts` debug
script. Six focused PDF Library E2E scenarios passed. The previously reported intermittent canvas assertion did
not reproduce; its real-pixel assertion remains intact and the issue stays tracked rather than presumed fixed.
