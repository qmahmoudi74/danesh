// Local CI parity runner (Plan 01-10): runs tools/ci-steps.ts for this OS, in order, with the CI environment, stops at
// the first failure and prints a step table. `--from <id>` resumes; `--only <id>` runs one step.
import { spawnSync } from 'node:child_process';
import { type CiStep, stepsFor } from './ci-steps.ts';

const argument = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
let steps: CiStep[] = stepsFor(process.platform);
const from = argument('--from'),
  only = argument('--only');
if (only) steps = steps.filter((step) => step.id === only);
else if (from)
  steps = steps.slice(
    Math.max(
      0,
      steps.findIndex((step) => step.id === from),
    ),
  );
if (!steps.length) {
  console.error('ci-local: no matching step');
  process.exit(2);
}

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_LLAMA_CPP_SKIP_DOWNLOAD: 'true',
  ONNXRUNTIME_NODE_INSTALL: 'skip',
};
delete baseEnv.ELECTRON_RUN_AS_NODE;
const rows: { id: string; exit: number | null; seconds: number }[] = [];
for (const step of steps) {
  console.log(
    `\n=== ci-local: ${step.id}: ${step.run}${step.env ? ` (env ${JSON.stringify(step.env)})` : ''}`,
  );
  const started = Date.now();
  const result = spawnSync(step.run, {
    shell: true,
    stdio: 'inherit',
    env: { ...baseEnv, ...step.env },
  });
  rows.push({
    id: step.id,
    exit: result.status,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  });
  if (result.status !== 0) break;
}
console.log('\nci-local summary');
for (const row of rows)
  console.log(`${row.id.padEnd(14)} exit=${String(row.exit).padEnd(4)} ${row.seconds}s`);
const failed = rows.some((row) => row.exit !== 0);
console.log(`ci-local: ${failed ? 'failed' : 'ok'} (${rows.length}/${steps.length} steps run)`);
process.exitCode = failed ? 1 : 0;
