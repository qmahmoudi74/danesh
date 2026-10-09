---
status: proposed
date: YYYY-MM-DD
decision-makers: []
kind: architecture
# Optional: spike: S-PACKAGE
---

# NNNN: <title>

Use a unique sequential four-digit number and a short decision title; replace the front matter placeholders before creating an ADR.

Front matter: `status` is one of `proposed`, `accepted`, `rejected`, `deprecated`, or `superseded by ADR-NNNN`; `date` is YYYY-MM-DD; `decision-makers` names the responsible people; `kind` is one of `architecture`, `infrastructure`, `packaging`, `license`, or `engine`; optional `spike` identifies the governing spike.

## Context and Problem Statement

Describe the concrete problem, scope, constraints and authoritative requirements that require a decision.

## Decision Drivers

List the measurable quality, privacy, durability, platform and licensing constraints that determine the choice.

## Considered Options

List feasible options, including the approved default and alternatives that address this problem.

## Decision Outcome

Record the proposed or accepted choice and why it satisfies the drivers, distinguishing a proposal from an evidence-backed acceptance.

### Consequences

Describe benefits, costs, limitations and consequences of adopting the option.

### Confirmation

Name the checks and evidence needed to confirm the choice; an ADR of kind `engine` may only be `accepted` after ADR 0004 is accepted (REL-08).

## Spike Evidence

Write and commit the pass policy before the governed run, then populate evidence from actual runs rather than importing scratch-research results.

Pass policy commit: <sha>

The SHA must identify the commit introducing this policy and precede the commit adding results; never edit a policy after results exist, and record any changed policy as a new separately committed revision alongside the original.

### Pass policy

Define numeric thresholds, exact target platforms and pass/fail rules before the spike runs.

### Platforms actually run

For each actual run list OS name, OS version, architecture, date, evidence tier and existing evidence path; report missing platforms as not run and distinguish Tier A hosted runs from Tier B clean-machine verification.

### Fixtures

Record fixture names, immutable source revisions, byte sizes and full SHA-256 values; the Results section stays empty in this pre-run template and later records measured outcomes against every policy row.

### Results

### Raw evidence

Link existing raw logs, reports, screenshots and command output with their run platform and commit, or state that none have been collected yet.

## License

Record dependency, engine, model and voice licenses, redistribution conditions, notices and embedded-binary review; Danesh's MIT grant covers only its original source.

## Packaging

Describe native unpacking, signing, installer layout, size and Unicode path constraints and their required verification.

## Security

Describe trust boundaries, sandbox and IPC validation, network egress, privacy-sensitive logging and the failure blast radius.

## Pros and Cons of the Options

Compare the considered options against the drivers with explicit benefits, drawbacks and unresolved evidence.

## More Information

Link authoritative planning documents, related ADRs and the concrete conditions that would require revisiting the decision.
