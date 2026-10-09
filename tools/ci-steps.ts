// The single ordered CI step list (Plan 01-10, D-18). .github/workflows/ci.yml mirrors it step for step
// (`pnpm check:ci` enforces that) and `pnpm ci:local` runs it on a developer machine.
export type CiStep = { id: string; run: string; env?: Record<string, string>; os?: 'win32' | 'darwin' };

export const CI_STEPS: CiStep[] = [
  { id: 'install', run: 'pnpm install --frozen-lockfile' },
  { id: 'lint', run: 'pnpm lint' },
  { id: 'typecheck', run: 'pnpm typecheck' },
  { id: 'depcruise', run: 'pnpm depcruise' },
  { id: 'licenses', run: 'pnpm licenses:scan' },
  { id: 'adr', run: 'pnpm check:adr' },
  // --allow-unbound stays until every scenario is bound; Plan 01-15 removes it here and in ci.yml together.
  { id: 'features', run: 'node tools/check-features-first.ts --allow-unbound' },
  { id: 'probes', run: 'pnpm probes:fetch' },
  { id: 'unit', run: 'pnpm test' },
  { id: 'package', run: 'pnpm package' },
  { id: 'smoke', run: 'pnpm smoke:packaged --persian-paths', os: 'darwin' },
  { id: 'smoke-windows', run: 'pnpm smoke:packaged --persian-paths --install-nsis', os: 'win32' },
  // The full suite asserts all-pass summaries, which the deliberately differing packaged test build cannot meet, so it
  // runs on the unpackaged test build; the packaged DaneshTest build then runs its own scenarios.
  { id: 'e2e', run: 'pnpm test:e2e' },
  { id: 'e2e-packaged', run: 'pnpm test:e2e', env: { DANESH_E2E_PACKAGED: '1', DANESH_E2E_GREP: '@plan-01-08' } },
];

export function stepsFor(platform: NodeJS.Platform): CiStep[] { return CI_STEPS.filter((step) => !step.os || step.os === platform); }
