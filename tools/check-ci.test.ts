import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkWorkflow, workflowRunSteps } from './check-ci.ts';
import { CI_STEPS } from './ci-steps.ts';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('CI workflow static check', () => {
  it('accepts the authored workflow, which mirrors ci-steps exactly', () => {
    expect(checkWorkflow(workflow)).toEqual([]);
    expect(workflowRunSteps(workflow).map((step) => step.name)).toEqual(CI_STEPS.map((step) => step.id));
  });
  it('fails on a reordered step', () => {
    const swapped = workflow.replace('      - name: lint\n        run: pnpm lint\n      - name: typecheck\n        run: pnpm typecheck', '      - name: typecheck\n        run: pnpm typecheck\n      - name: lint\n        run: pnpm lint');
    expect(swapped).not.toBe(workflow);
    expect(checkWorkflow(swapped).some((finding) => finding.includes('step 2'))).toBe(true);
  });
  it('fails when an operating system is missing', () => {
    expect(checkWorkflow(workflow.replace('[windows-latest, macos-latest]', '[windows-latest]'))).toContain('missing required setting: macos-latest');
  });
  it('fails on secrets, publishing, releases and ELECTRON_RUN_AS_NODE', () => {
    expect(checkWorkflow(workflow.replace('run: pnpm package', 'run: pnpm package --publish always'))).toEqual(expect.arrayContaining(['forbidden construct: a publishing electron-builder flag']));
    expect(checkWorkflow(`${workflow}\n# token: \${{ secrets.GITHUB_TOKEN }}`)).toContain('forbidden construct: secrets.');
    expect(checkWorkflow(`${workflow}\n      - uses: softprops/action-gh-release@v2`)).toContain('forbidden construct: a release step');
    expect(checkWorkflow(workflow.replace("ONNXRUNTIME_NODE_INSTALL: skip", "ONNXRUNTIME_NODE_INSTALL: skip\n      ELECTRON_RUN_AS_NODE: '1'"))).toContain('forbidden construct: ELECTRON_RUN_AS_NODE');
  });
  it('fails when an OS guard or step env drifts from ci-steps', () => {
    expect(checkWorkflow(workflow.replace("if: runner.os == 'Windows'", "if: runner.os == 'macOS'")).some((finding) => finding.includes('smoke-windows'))).toBe(true);
    expect(checkWorkflow(workflow.replace("DANESH_E2E_GREP: '@plan-01-08'", "DANESH_E2E_GREP: '@plan-01-06'")).some((finding) => finding.includes('e2e-packaged'))).toBe(true);
  });
});
