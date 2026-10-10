// Static check of .github/workflows/ci.yml against tools/ci-steps.ts (Plan 01-10): same run steps in the same order,
// both operating systems, the required safety settings, and none of the forbidden constructs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CI_STEPS, type CiStep } from './ci-steps.ts';

type WorkflowStep = { name: string; run: string; if?: string; env: Record<string, string> };
const unquote = (value: string) =>
  value
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .replace(/^"(.*)"$/, '$1');

/** Reads the named `run:` steps of the workflow (this file's own two-space layout; not a general YAML parser). */
export function workflowRunSteps(text: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let current: WorkflowStep | undefined;
  let inEnv = false;
  for (const line of text.split(/\r?\n/)) {
    const name = /^ {6}- name: (.+)$/.exec(line);
    if (name) {
      current = { name: unquote(name[1]!), run: '', env: {} };
      steps.push(current);
      inEnv = false;
      continue;
    }
    if (/^ {6}- /.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const field = /^ {8}(run|if|env):\s*(.*)$/.exec(line);
    if (field) {
      inEnv = field[1] === 'env';
      if (field[1] === 'run') current.run = field[2]!.trim();
      if (field[1] === 'if') current.if = field[2]!.trim();
      continue;
    }
    const env = /^ {10}([A-Z_][A-Z0-9_]*):\s*(.+)$/.exec(line);
    if (inEnv && env) current.env[env[1]!] = unquote(env[2]!);
  }
  return steps.filter((step) => step.run);
}

/** Every workflow step runs through the annotating wrapper so failures are visible without log access. */
export const STEP_PREFIX = 'node tools/ci-annotate.ts ';
const OS_CONDITION: Record<NonNullable<CiStep['os']>, string> = {
  win32: "runner.os == 'Windows'",
  darwin: "runner.os == 'macOS'",
};

export function checkWorkflow(text: string, expected: CiStep[] = CI_STEPS): string[] {
  const findings: string[] = [];
  for (const required of [
    'windows-latest',
    'macos-latest',
    'fail-fast: false',
    'fetch-depth: 0',
    '--frozen-lockfile',
    'contents: read',
    "NODE_LLAMA_CPP_SKIP_DOWNLOAD: 'true'",
    'ONNXRUNTIME_NODE_INSTALL: skip',
  ]) {
    if (!text.includes(required)) findings.push(`missing required setting: ${required}`);
  }
  if (!/uses: actions\/upload-artifact@v7\s*\n\s*if: always\(\)/.test(text))
    findings.push('evidence upload must use actions/upload-artifact@v7 with if: always()');
  for (const [pattern, label] of [
    [/secrets\./, 'secrets.'],
    [/--publish (always|onTag|onTagOrDraft)/, 'a publishing electron-builder flag'],
    [/npm publish|pnpm publish/, 'a package publish'],
    [/gh release|softprops\/action-gh-release|actions\/create-release/, 'a release step'],
    [/ELECTRON_RUN_AS_NODE/, 'ELECTRON_RUN_AS_NODE'],
    [/permissions:\s*write-all|contents: write/, 'write permissions'],
  ] as const) {
    if (pattern.test(text)) findings.push(`forbidden construct: ${label}`);
  }
  const actual = workflowRunSteps(text);
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index++) {
    const want = expected[index],
      have = actual[index];
    if (!want) {
      findings.push(`step ${index + 1}: unexpected workflow step "${have!.name}"`);
      continue;
    }
    if (!have) {
      findings.push(`step ${index + 1}: missing workflow step "${want.id}"`);
      continue;
    }
    if (have.name !== want.id || have.run !== STEP_PREFIX + want.run)
      findings.push(
        `step ${index + 1}: workflow has "${have.name}: ${have.run}", ci-steps has "${want.id}: ${STEP_PREFIX}${want.run}"`,
      );
    if ((have.if ?? '') !== (want.os ? OS_CONDITION[want.os] : ''))
      findings.push(
        `step ${index + 1} (${want.id}): os condition "${have.if ?? ''}" does not match ${want.os ?? 'all'}`,
      );
    if (JSON.stringify(have.env) !== JSON.stringify(want.env ?? {}))
      findings.push(
        `step ${index + 1} (${want.id}): env ${JSON.stringify(have.env)} does not match ${JSON.stringify(want.env ?? {})}`,
      );
  }
  return findings;
}

if (import.meta.main) {
  const findings = checkWorkflow(readFileSync(resolve('.github/workflows/ci.yml'), 'utf8'));
  for (const finding of findings) console.error(`FAIL ${finding}`);
  console.log(`check-ci: findings=${findings.length}`);
  process.exitCode = findings.length ? 1 : 0;
}
