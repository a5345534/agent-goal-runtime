# standardize-controller-owned-subagent-lifecycle

## Why

The current controller/subagent orchestration path mixes the desired formal flow with many exception-specific recovery mechanisms. The portable controller currently starts ready DAG nodes through an adapter, syncs subagent state, validates self-reports, integrates branches, and contains hard-coded recovery branches for transient errors, quota/provider limits, context overflow, missing sessions, terminated sessions, stale runners, blocked-node recovery, and repeated validation failures. Those mechanisms have solved real incidents, but they make the controller loop difficult to reason about and can create duplicate sessions or replacement attempts that lose useful context.

The desired architecture is simpler: the controller owns the node lifecycle and resource inventory, the adapter follows a formal observation path, and a separate controller exception handler owns abnormal recovery scripts. Branches, worktrees, and sessions should be prepared by the controller before a runner starts; subagents should join the prepared execution context rather than creating resources themselves. Repeated abnormal patterns should be codified as auditable recovery rules/playbooks instead of accumulating ad hoc exception branches in adapter or controller code.

## What Changes

- Introduce a standard controller-owned DAG node lifecycle: acceptance definition, resource initialization, runner join/start, adapter observation, controller judgment, validation, integration, and terminal closeout.
- Move branch/worktree/session ownership into the controller lifecycle. Adapters and subagents attach to prepared resources and must not create node branches or worktrees in the formal path.
- Split adapter responsibilities into a formal observation contract and a separate exception-handling path. The adapter reports normalized observations; an exception handler decides recovery actions for protocol violations, runner errors, runner loss, stale state, and other abnormal conditions.
- Add a controller recovery policy/playbook mechanism that can consult fixed rules first, invoke a controller model for unknown or repeated failures, and write auditable proposed recovery rules when a failure signature recurs.
- Preserve context during recovery by reusing controller-owned node workspaces and sessions whenever safe; restart/replacement decisions operate against the existing node resource record instead of creating new uncontrolled resources.

## Impact

- Affected specs: `controller-subagent-lifecycle`
- Affected modules/repos: `src/core/controller-loop.ts`, `src/core/subagent-adapter.ts`, `src/core/types.ts`, `src/core/git-workspace.ts`, `src/adapters/pi/*`, `src/adapters/opencode/*`, schemas under `schemas/`, monitor/status surfaces, and relevant tests.
- Affected APIs/events/data: runtime subagent adapter contract, durable DAG/subagent state, controller ledger events, recovery decision records, and native-git workspace allocation semantics.
- Migration/deployment impact: existing adapters need a compatibility layer or staged migration from `startSession`-creates-resources semantics to prepared-resource attach semantics.
- User-visible impact: fewer duplicate branches/worktrees/sessions, clearer monitor lifecycle phases, and recovery decisions that are easier to audit.

## Non-Goals

- Do not silently let subagents create or switch branches/worktrees as part of normal DAG execution.
- Do not remove all existing recovery behavior in one unsafe rewrite; compatibility and migration are required.
- Do not let an LLM directly mutate runtime code without governed artifacts, validation, and review. Learned recovery rules must be persisted as auditable policy/playbook data, not unreviewed source edits.
- Do not change the model-visible `/goal` tool contract beyond what is required to expose lifecycle/recovery diagnostics.
- Do not redesign DAG planning semantics unrelated to node execution lifecycle.

## Success Signal

A DAG node can be observed moving through controller-owned acceptance/resource/runner/observation/judgment/validation/integration phases. For abnormal runner conditions, the adapter only reports the observation; a separate exception handler records a recovery decision, reuses the controller-owned node resources when safe, and writes a proposed recovery rule after repeated matching signatures. Tests prove that retries do not create duplicate uncontrolled branches, worktrees, or sessions.

## Assumptions

- [ASSUMPTION] The initial implementation can keep coarse `GoalDagNode.status` values for compatibility while adding a more detailed durable lifecycle phase/resource record.
- [ASSUMPTION] Recovery-rule learning should create auditable policy artifacts first; automatic activation can be restricted by confidence, tests, or review policy.
- [ASSUMPTION] Pi and OpenCode can both support a prepared-resource attach path with staged compatibility shims.

## Open Questions

- [ ] Should generated recovery rules be enabled automatically after a confidence threshold, or should they remain proposed until human review?
- [ ] Should prepared session creation live in core runtime, adapter-specific resource providers, or a new controller resource manager abstraction?
- [ ] Which monitor UI fields are required in the first implementation: detailed lifecycle phase, resource ids, recovery decision, learned-rule id, or all of them?
