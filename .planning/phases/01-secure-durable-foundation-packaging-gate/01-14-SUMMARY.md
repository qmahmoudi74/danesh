---
phase: 01-secure-durable-foundation-packaging-gate
plan: "14"
subsystem: supervision
status: in_progress
requires: [01-13]
provides:
  - Pure capped backoff, healthy-reset/crash-window policy and injectable child lifecycle logic
actuals:
  tokens: 3528
  tasks: 0
  commits: 1
tech-stack:
  added: []
requirements-completed: []
---

# Plan 01-14: verified domain checkpoint; Electron integration pending

Commit `e51e8c7` completes Task 1 steps 1-3 only. None of the three complete plan tasks is accepted yet.
The dependency, Plan 01-13, passed its mandatory Windows acceptance before this checkpoint. No live Electron
restart, watchdog, OOM containment or Core-reconnection verification is claimed.

`backoffMs` returns integer 250/500/1000/... delays capped at 15000ms and rejects invalid counts/parameters.
`createSupervisionPolicy` counts unrequested exits, resets after 60000ms healthy uptime, and opens a circuit after
five crashes within 120000ms. Requested stops do not count. `createSupervisor` injects its spawner and clock,
isolates policy by process kind, treats unrequested code 0 as a crash, coalesces pending starts during backoff,
cancels scheduled restarts on stop, and fences delayed exits from older requested-stop generations.

Nine focused fake-clock/fake-child unit tests pass in `packages/domain/test/supervision.test.ts`. Initial collection
failed before the modules existed; the final focused run passed. The full unit checkpoint and the 273-test
domain/storage acceptance run also included these tests. Formatting, typecheck, lint and dependency boundaries
passed. These modules import no Electron or filesystem API and are not connected to the shipping app yet.
Actual token figure is diff characters divided by four, not a harness count.

## Exact continuation

Resume approved **Task 1 step 4** in `01-14-PLAN.md`: implement `apps/main/src/supervisor.ts` as the Electron
adapter and delegate `hosts.ts` lifecycle while preserving validated private-port brokering. Complete steps 5-7:
report restart attempts/circuit-open to Core, add the guarded kill fault, and bind the sample-job host-kill scenario.
Verify with `pnpm vitest run --project domain` and `DANESH_E2E_GREP=@plan-01-14 pnpm test:e2e`.
Other Plan 01-14 scenarios may remain skipped only until Tasks 2-3 are completed.

Tasks 2-3 remain outstanding: real-process kill/exit0/exit1/abort/spin/OOM matrix, watchdog, crash evidence,
quarantine/circuit tests through actual hosts, System Check restart copy/probe retry, shutdown proof, Core respawn,
preload port replacement, Core-failed UI and every mandatory Gherkin/UI acceptance with none skipped.

The remaining session capacity is insufficient for safely connecting and verifying that multi-process scope.
This verified checkpoint preserves the approved plan. PLAT-04 stays pending; plan count remains 12/16.
Do not start Plan 01-15 before completing this dependency, or waive 01-16 platform gates.
