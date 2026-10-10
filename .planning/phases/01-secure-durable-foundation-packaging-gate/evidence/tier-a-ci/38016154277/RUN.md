# Windows-first CI observation: run 38016154277

- Run: https://github.com/qmahmoudi74/danesh/actions/runs/38016154277
- Commit: `c36666b415c139c9184805291aa8e2282ac3ea29` (before the CAS implementation).
- Observed on 2026-10-10 through authenticated GitHub access.
- Windows job: https://github.com/qmahmoudi74/danesh/actions/runs/38016154277/job/114106751980 — completed, success.
- macOS job: https://github.com/qmahmoudi74/danesh/actions/runs/38016154277/job/114106752172 — completed, failure at smoke; E2E skipped. No macOS investigation was performed in this session, per owner direction.

## Windows evidence

The authenticated connector downloaded artifact `evidence-windows-latest`, ID `11655963174`.
The ZIP is 3,443,582 bytes. Its computed SHA-256 matches GitHub metadata:
`3321aaeef7abbf79c73bc6ac41a7df080ca598787e0466d14444adc9e108d109`.
The ZIP remains in the local temporary directory; its complete entry inventory is retained here.
The exact current-run smoke entry was extracted from
`.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-a-local/smoke-win32-x64.json`
as `smoke-win32-x64.json`; recorded at `2026-10-10T02:17:17.670Z`.
Other uploaded historical reports were not used as current-run evidence.
Credentials and temporary download URLs are excluded from retained evidence.

Authenticated job-log excerpts in `windows-results.txt` show:

- Unit: 363 tests passed in 30 files; no native worker crash in this run.
- Production package and hook scanner: passed; manifest has 85 entries.
- Persian-path smoke: passed all seven then-implemented checks. NSIS install, installed manifest comparison,
  installed application smoke and uninstall passed; maximum installed path bound was 185 UTF-16 units.
- Full E2E: 38 passed, 31 intentional skips for future plans and the packaged-only fuse scenario.
- Packaged E2E: one passed; test-hook scanner positive control passed.
- Static, dependency, license, ADR and features-first steps: success in `observed-metadata.json`.

The current-run report passed `tools/smoke/validate-evidence.ts` with Windows, Persian-path and all seven
implemented checks required. The evidence also reports passing fuse read-back, manifest, ASAR contents and
production hook exclusion. Windows codesign is not applicable to this unsigned development build.
Idle timer lateness: 40 samples, p95 9 ms, max 13 ms. Loaded: 119 samples, p95 13 ms, max 15 ms.
These Windows results neither establish macOS behavior nor verify the later CAS implementation.

## Qualification

The preceding native probe worker crash (`0xC0000374`) remains tracked as a CI reliability issue;
one green rerun is not proof that it has been resolved. No local reproduction blocked CAS development.
Plan 01-10 remains partially verified because both platforms must pass and separate Tier B clean-machine
requirements remain outstanding. Previous failed evidence and the unchanged CI/performance/security policy are
preserved. The owner-authorized exception permits Windows-first implementation of Plan 01-12, without closing
the cross-platform acceptance or release gate.
