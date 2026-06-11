# Tasks: standardize-controller-owned-subagent-lifecycle

## 1. Spec and Contract

- [x] 1.1 Add `controller-subagent-lifecycle` spec delta and confirm terminology for lifecycle phase, prepared resource, adapter observation, exception handler, recovery decision, and recovery rule/playbook.
- [x] 1.2 Design additive durable state for node lifecycle/resource/recovery records without breaking existing `GoalDagNode.status` consumers.
- [x] 1.3 Update TypeScript contracts for prepared-resource adapter attachment and normalized adapter observations.
- [x] 1.4 Define `ControllerExceptionHandler`, `ExceptionHandlingRequest`, `RecoveryDecision`, and recovery-rule/playbook interfaces.
- [x] 1.5 Update schemas and store interfaces for lifecycle/resource/recovery persistence and ledger evidence.

## 2. Controller-Owned Lifecycle Implementation

- [x] 2.1 Add controller lifecycle transition helpers and coarse-status projection.
- [x] 2.2 Move node branch/worktree/session preparation into a controller-owned resource lifecycle step.
- [x] 2.3 Ensure scheduler/start-ready flow records `acceptanceDefined`, `resourcesCreating`, `resourcesReady`, `runnerStarting`, and `runnerActive` before subagent work begins.
- [x] 2.4 Ensure same-node recovery reuses the existing resource record by default.
- [x] 2.5 Require explicit resource supersession before a recovery can create a new branch/worktree for the same node.

## 3. Adapter Formal Path

- [x] 3.1 Add prepared-resource attach/start support to the harness-neutral adapter contract while preserving legacy compatibility during migration.
- [x] 3.2 Update Pi adapter to attach/start runners against controller-prepared session/workspace resources.
- [x] 3.3 Update OpenCode adapter to attach/start runners against controller-prepared session/workspace resources.
- [x] 3.4 Refactor adapter state inspection to emit normalized observations instead of recovery decisions.
- [x] 3.5 Keep formal marker parsing (`SUBAGENT_RESULT`, `SUBAGENT_BLOCKED`) in the adapter observation layer.

## 4. Exception Handler and Recovery Policy

- [x] 4.1 Extract existing recovery behavior into a default `ControllerExceptionHandler` with parity decisions.
- [x] 4.2 Route `protocolViolation`, `runnerError`, `runnerLost`, stale/unresolved state, and self-reported blocked observations through the exception handler.
- [x] 4.3 Persist every recovery decision with evidence, selected action, bounded retry metadata, and lifecycle transition.
- [x] 4.4 Add deterministic recovery-rule/playbook lookup before controller-model diagnosis.
- [x] 4.5 Add controller-model diagnostic support for unknown or repeated abnormal signatures.
- [x] 4.6 Write proposed recovery-rule/playbook artifacts when repeated signatures exceed the configured threshold.
- [x] 4.7 Add policy gates for generated-rule activation, validation, rollback, and monitor display.

## 5. Validation, Integration, and Closeout

- [x] 5.1 Preserve `selfReportedComplete -> controllerJudging -> validating -> integrating -> complete` semantics.
- [x] 5.2 Preserve required branch/worktree integration gates before node completion.
- [x] 5.3 Update terminal closeout and cleanup to use controller-owned resource records.
- [x] 5.4 Update monitors/status output to show lifecycle phase, prepared resources, abnormal observation, recovery decision, and learned-rule id when available.

## 6. Tests

- [x] 6.1 Add lifecycle transition unit tests.
- [x] 6.2 Add coarse status projection tests for existing monitor/scheduler compatibility.
- [x] 6.3 Add adapter observation contract tests for Pi and OpenCode.
- [x] 6.4 Add exception-handler parity tests for current transient/quota/context/missing-session/terminated/stale recovery behavior.
- [x] 6.5 Add tests proving same-node retry does not create duplicate uncontrolled branches/worktrees/sessions.
- [x] 6.6 Add generated recovery-rule persistence and activation-policy tests.
- [x] 6.7 Add schema/store migration tests.

## 7. Documentation / Closeout

- [x] 7.1 Update `docs/adapter-contract.md` to describe formal adapter observation and prepared-resource attachment.
- [x] 7.2 Update README controller orchestration and native-git workspace sections.
- [x] 7.3 Refresh `source-manifest.json`.
- [x] 7.4 Validate source manifest.
- [x] 7.5 Generate/validate `change-explainer.html` if this project requires explainers for this change before review.
- [x] 7.6 Run archive preflight when implementation is complete.

## Backlog / Follow-ups

- [ ] [BACKLOG] Consider migrating coarse `GoalDagNode.status` into a fully normalized public lifecycle once compatibility risks are resolved.
- [ ] [BACKLOG] Consider UI controls for reviewing, enabling, disabling, and deleting generated recovery rules.
- [ ] [BACKLOG] Consider a signed-rule or checksum mechanism if recovery rules become automatically enabled.
