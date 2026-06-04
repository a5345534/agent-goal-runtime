## Why

Goal orchestration currently lets a subagent self-report completion and then relies on controller validation artifacts declared directly on the DAG node (`expectedOutputs` / `validators`). This is stronger than pure self-report only when a planner or operator already supplied good validators. In practice, multi-step implementation goals can be under-specified: a node may have weak or empty validators, validators may be generated after implementation, or a final audit may discover that the tests did not actually encode the user's objective.

A reliable generic workflow needs tests and validators to become first-class planned artifacts before implementation starts. A dedicated test-spec phase should define the acceptance contract, a review gate should approve that contract, implementation subagents should work against the approved contract, and final audit should be able to send the workflow back to test-spec revision when the tests are incomplete.

This change plans that generic workflow so it is not tied to `6968fef0` or any single repository's package names.

## What Changes

- Introduce a generic test-spec validation workflow for DAG goals:
  1. write tests / validators from the objective,
  2. review and approve the test contract,
  3. lock approved test artifacts,
  4. run implementation subagents against the locked contract,
  5. rerun validators in controller validation,
  6. route test gaps discovered during audit back to the test-spec phase.
- Define runtime enforcement responsibilities:
  - validators declared by a node must execute or fail closed,
  - high-risk implementation nodes cannot pass on self-report alone,
  - approved test artifacts cannot be weakened by implementation work unless explicitly revised,
  - validation pass/fail evidence is recorded durably.
- Define planner responsibilities without moving DAG generation into runtime:
  - expand implementation work into test-spec / implementation / audit phases,
  - apply validation profiles such as `code-change`, `code-move`, `docs-spec-change`, `lint-hook`, and `audit-report`,
  - combine generic profiles with project rule packs.
- Define project rule-pack responsibilities:
  - map project-specific concepts such as module ownership, package moves, build commands, and forbidden imports into reusable validation rules.

## Capabilities

### New Capabilities

- `goal-test-spec-validation-workflow` — DAG goals can require a pre-implementation test/validator contract that is reviewed, locked, and reused during implementation validation.
- `goal-validation-profiles` — Goal DAG nodes can reference generic validation profiles that expand into concrete validation requirements outside runtime's scheduler logic.
- `goal-validation-artifact-locks` — Runtime validation can verify that approved test/validator artifacts were not weakened by implementation subagents.
- `goal-test-gap-revision-loop` — A final audit can classify a failure as a test gap and route the workflow back to test-spec revision instead of treating it as a simple implementation bug.

### Modified Capabilities

- `goal-controller-validation` — Controller validation becomes evidence-based and fail-closed for declared validators, locked artifacts, and high-risk nodes.
- `goal-dag-format` — DAG schema gains optional validation metadata while preserving existing `validators` and `expectedOutputs` compatibility.
- `goal-planner-contract` — Planner remains the DAG producer, but it should generate phase-expanded DAGs and validation profile metadata.
- `goal-runtime-documentation` — README and DAG format docs describe test-spec phases, validator execution policy, and audit-driven revision loops.

## Impact

- `src/core/types.ts` — Add optional validation contract metadata and validation evidence records.
- `schemas/goal-dag.schema.json` — Extend DAG schema for validation profiles, test-spec links, artifact locks, and revision policies.
- `src/core/validation-runner.ts` — Add generic checks for high-risk empty validation, locked artifacts, required evidence, and test-gap classification.
- `src/core/controller-loop.ts` — Preserve existing scheduling semantics while supporting validation outcomes that reopen or require revision of upstream test-spec nodes.
- `src/core/sqlite-store.ts` / `src/core/memory-store.ts` — Persist validation contracts, artifact-lock hashes, and validation evidence.
- `src/adapters/pi/*` — Surface validation contract/evidence in `/goal status` and `/goal monitor`; ensure Pi uses fail-closed validator execution policy.
- `docs/goal-dag-format.md` and `README.md` — Document the generic workflow and operator requirements.
- `agent-goal-planner` (separate repo, coordinated follow-up) — Generate phase-expanded DAGs from validation profiles and project rule packs.

## Scope

### In

- Runtime-side contract, persistence, and validation semantics for a generic test-spec-first workflow.
- Backward-compatible DAG schema extensions.
- Fail-closed behavior when declared validation cannot run or approved test artifacts are modified by implementation work.
- Audit outcome taxonomy that distinguishes implementation failure from test-gap failure.
- Documentation and examples showing how a planner should generate the workflow.

### Out

- Moving DAG production into `agent-goal-runtime`.
- Hard-coding project-specific rules such as `beyourself` package names into runtime.
- Building a full test generator model inside runtime.
- Automatically proving test completeness; the workflow improves reviewability and fail-closed behavior but still relies on reviewer/auditor judgment.
- Implementing full automatic cross-branch merge/cherry-pick integration in this change, except where needed as validation evidence hooks.
