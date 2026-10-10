import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkWorkflow, STEP_PREFIX, workflowRunSteps } from './check-ci.ts';
import { CI_STEPS } from './ci-steps.ts';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('CI workflow static check', () => {
  it('accepts the authored workflow, which mirrors ci-steps exactly', () => {
    expect(checkWorkflow(workflow)).toEqual([]);
    expect(workflowRunSteps(workflow).map((step) => step.name)).toEqual(
      CI_STEPS.map((step) => step.id),
    );
  });
  it('fails on a reordered step', () => {
    const lint = `      - name: lint\n        run: ${STEP_PREFIX}pnpm lint`;
    const typecheck = `      - name: typecheck\n        run: ${STEP_PREFIX}pnpm typecheck`;
    const swapped = workflow.replace(`${lint}\n${typecheck}`, `${typecheck}\n${lint}`);
    expect(swapped).not.toBe(workflow);
    expect(checkWorkflow(swapped).some((finding) => finding.includes('step 3'))).toBe(true);
  });
  it('fails when an operating system is missing', () => {
    expect(
      checkWorkflow(workflow.replace('[windows-latest, macos-latest]', '[windows-latest]')),
    ).toContain('missing required setting: macos-latest');
  });
  it('fails on secrets, publishing, releases and ELECTRON_RUN_AS_NODE', () => {
    expect(
      checkWorkflow(
        workflow.replace(
          'ci-annotate.ts pnpm package',
          'ci-annotate.ts pnpm package --publish always',
        ),
      ),
    ).toEqual(expect.arrayContaining(['forbidden construct: a publishing electron-builder flag']));
    expect(checkWorkflow(`${workflow}\n# token: \${{ secrets.GITHUB_TOKEN }}`)).toContain(
      'forbidden construct: secrets.',
    );
    expect(checkWorkflow(`${workflow}\n      - uses: softprops/action-gh-release@v2`)).toContain(
      'forbidden construct: a release step',
    );
    expect(
      checkWorkflow(
        workflow.replace(
          'ONNXRUNTIME_NODE_INSTALL: skip',
          "ONNXRUNTIME_NODE_INSTALL: skip\n      ELECTRON_RUN_AS_NODE: '1'",
        ),
      ),
    ).toContain('forbidden construct: ELECTRON_RUN_AS_NODE');
  });
  it('fails when an OS guard or step env drifts from ci-steps', () => {
    expect(
      checkWorkflow(
        workflow.replace("if: runner.os == 'Windows'", "if: runner.os == 'macOS'"),
      ).some((finding) => finding.includes('smoke-windows')),
    ).toBe(true);
    expect(
      checkWorkflow(
        workflow.replace("DANESH_E2E_GREP: '@plan-01-08'", "DANESH_E2E_GREP: '@plan-01-06'"),
      ).some((finding) => finding.includes('e2e-packaged')),
    ).toBe(true);
  });
});
