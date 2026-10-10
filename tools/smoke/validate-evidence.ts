// Validates a System check export (SmokeReport) or a packaged-smoke evidence JSON returned from a Tier B or CI run
// (Plan 01-10). Prints `validate-evidence: ok <checks>` or one FAIL line per problem.
import { readFileSync } from 'node:fs';
import { type SmokeReport, SmokeReportSchema } from '../../packages/contracts/src/smoke-report.ts';

export type EvidenceOptions = {
  requirePersianPath?: boolean;
  requireOs?: string;
  requireChecks?: string[];
};
const PERSIAN = /[؀-ۿ]/;

export function validateEvidence(
  value: unknown,
  options: EvidenceOptions = {},
): { report?: SmokeReport; problems: string[] } {
  const candidate =
    typeof value === 'object' && value !== null && 'appReport' in value ? value.appReport : value;
  const parsed = SmokeReportSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      problems: [
        `not a valid smoke report: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`,
      ],
    };
  const report = parsed.data;
  const problems: string[] = [];
  if (report.overall !== 'pass')
    problems.push(
      `overall is ${report.overall}; failing checks: ${report.checks
        .filter((check) => check.status !== 'pass')
        .map((check) => check.checkId)
        .join(', ')}`,
    );
  if (options.requireOs && report.platform !== options.requireOs)
    problems.push(`platform is ${report.platform}, expected ${options.requireOs}`);
  for (const id of options.requireChecks ?? []) {
    const check = report.checks.find((item) => item.checkId === id);
    if (!check) problems.push(`required check ${id} is missing`);
    else if (check.status !== 'pass') problems.push(`required check ${id} is ${check.status}`);
  }
  if (options.requirePersianPath) {
    const paths = report.checks
      .flatMap((check) => Object.values(check.fields))
      .filter((field): field is string => typeof field === 'string' && /[\\/]/.test(field));
    if (!paths.some((path) => PERSIAN.test(path) && path.includes(' ')))
      problems.push('no reported library path contains both Persian letters and a space');
  }
  return { report, problems };
}

if (import.meta.main) {
  const values = (flag: string) =>
    process.argv.flatMap((arg, index) =>
      arg === flag && process.argv[index + 1] ? [process.argv[index + 1]!] : [],
    );
  const file = values('--file')[0];
  if (!file) {
    console.error(
      'usage: validate-evidence --file <json> [--require-persian-path] [--require-os win32|darwin] [--require-check <id> ...]',
    );
    process.exit(2);
  }
  const { report, problems } = validateEvidence(JSON.parse(readFileSync(file, 'utf8')), {
    requirePersianPath: process.argv.includes('--require-persian-path'),
    requireOs: values('--require-os')[0],
    requireChecks: values('--require-check'),
  });
  for (const problem of problems) console.error(`FAIL ${problem}`);
  console.log(
    problems.length
      ? `validate-evidence: failed (${problems.length})`
      : `validate-evidence: ok ${report!.checks.map((check) => check.checkId).join(',')}`,
  );
  process.exitCode = problems.length ? 1 : 0;
}
