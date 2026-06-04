## 1. Planning

- [x] Confirm scope: generic test-spec-first validation workflow, not `6968fef0`-specific validators.
- [x] Confirm source-of-truth boundary: runtime consumes DAGs; planner/project rule packs generate tests, validators, and phase-expanded DAGs.
- [x] Confirm initial fail-closed validator behavior already exists: declared validators cannot be skipped and still pass.
- [x] Review this proposal with the user before implementation.
- [x] Decide whether subagent branch integration/merge is in this change or a follow-up evidence feature. Decision: follow-up.
- [x] Decide the minimum default policy for legacy high-risk DAG nodes without `kind` / `validation` metadata. Decision: only `kind=implementation` + `risk=high` is fail-closed; legacy unlabeled DAGs remain compatible.

## 2. Runtime DAG Contract

- [x] Extend `schemas/goal-dag.schema.json` with optional node fields:
  - [x] `kind` (`test-spec`, `test-review`, `implementation`, `audit`, or custom string).
  - [x] `validation.profile`.
  - [x] `validation.testSpecNodeId`.
  - [x] `validation.approvedByNodeId`.
  - [x] `validation.artifactLocks[]`.
  - [x] `validation.requiredEvidence[]`.
  - [x] `validation.onAuditTestGap`.
- [x] Extend `src/core/types.ts` with matching TypeScript types.
- [x] Update DAG parser/normalizer to preserve validation metadata without changing existing DAG behavior.
- [x] Add schema/parser tests for backward compatibility and validation metadata round-trip.
- [x] Update `docs/goal-dag-format.md` with the new metadata and example phase-expanded DAG.

## 3. Validation Evidence Persistence

- [x] Persist validation contract metadata, including artifact-lock declarations, on DAG nodes in SQLite.
- [x] Mirror validation contract metadata in memory store for tests.
- [x] Add migrations for existing SQLite databases.
- [x] Add tests proving validation contract metadata survives store reopen.
- [ ] [BACKLOG] Add separate queryable validation evidence/artifact tables if status/audit needs historical evidence beyond per-subagent validation results.

## 4. Controller Validation Enforcement

- [x] Keep fail-closed skipped-validator behavior as the default.
- [x] Add high-risk implementation policy: `risk=high` + `kind=implementation` cannot pass without validators, approved test contract, or required evidence.
- [x] Implement artifact-lock hash verification before accepting implementation completion.
- [x] Implement required evidence checks:
  - [x] `validators-ran`.
  - [x] `locked-artifacts-unchanged`.
  - [x] `implementation-diff-present`.
  - [x] `non-test-diff-present`.
  - [x] `audit-report-present`.
- [x] Persist validation evidence summaries for pass/fail outcomes through subagent controller validation results.
- [x] Add follow-up prompts that distinguish:
  - [x] missing validator execution,
  - [x] locked test artifact mutation,
  - [x] missing implementation diff,
  - [x] missing audit report,
  - [x] failed shell validator.
- [x] Add validation-runner/controller-path tests for each implemented failure class.

## 5. Test-Spec / Audit Revision Loop

- [x] Define `validation.onAuditTestGap` DAG metadata hook for planner/auditor use.
- [ ] [BACKLOG] Add runtime operation to reopen a test-spec node and reset affected downstream nodes, or explicitly document the manual sequence if command support is deferred.
- [ ] [BACKLOG] Ensure a structured `test_gap` audit outcome does not mark the implementation node complete.
- [ ] [BACKLOG] Add tests for audit identifying a test gap and forcing renewed test-spec approval before implementation can complete.
- [ ] [BACKLOG] Add monitor/status rendering for test-gap state and affected nodes.

## 6. Pi Adapter UX

- [x] Show node kind, validation profile, and required evidence contract in `/goal status`.
- [x] Show node kind/profile and concise validation contract in `/goal monitor` DAG lines.
- [x] Document that Pi/OpenCode controller validation always executes declared shell validators.
- [x] Ensure skipped validators surface as actionable validation failures, not silent warnings.

## 7. Documentation and Examples

- [x] Add README section: test-spec-first goal workflow.
- [x] Add example DAG fragment with implementation node validation contract and artifact locks.
- [x] Document planner/rule-pack responsibilities and keep runtime/planner boundaries explicit.
- [ ] [BACKLOG] Add expanded troubleshooting notes for common failures:
  - [x] validators skipped,
  - [x] tests mutated by implementation,
  - [ ] [BACKLOG] audit found test gap,
  - [ ] [BACKLOG] project rule pack stale.

## 8. Planner Coordination (Separate Repo)

- [ ] [BACKLOG] Open a matching `agent-goal-planner` change after runtime contract is accepted.
- [ ] [BACKLOG] Add planner support for `validationProfile` in spec input.
- [ ] [BACKLOG] Add planner support for project rule packs such as `.goal/validation-rules.json`.
- [ ] [BACKLOG] Teach planner to expand implementation work into test-spec / test-review / implementation / audit DAG nodes.
- [ ] [BACKLOG] Add planner tests for generic profiles (`code-change`, `code-move`, `docs-spec-change`, `lint-hook`, `audit-report`).
- [ ] [BACKLOG] Ensure planner-generated DAGs round-trip through runtime parser/schema.

## 9. Validation

- [x] Run `npm run build`.
- [x] Run `npm test`.
- [x] Run OpenSpec source-manifest rebuild and validation.
- [x] Generate and validate explainer HTML.
- [ ] [BACKLOG] Smoke-test an example DAG in Pi without validator env flags.

## 10. Follow-up Backlog

- [ ] [BACKLOG] Add automatic subagent branch merge/cherry-pick integration gate after implementation validation.
- [ ] [BACKLOG] Add validation-profile execution adapters for non-shell validators.
- [ ] [BACKLOG] Add model-specific test-writer/reviewer prompt templates in planner.
- [ ] [BACKLOG] Add policy controls for when low-risk docs nodes may skip test-spec phases.
