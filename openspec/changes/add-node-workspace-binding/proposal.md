## Why

Goal `65f61476` exposed two related planning/runtime issues:

1. A DAG node's `expectedOutputs` included `.worktrees/<name>/...`, but controller validation evaluates outputs relative to the subagent workspace root. The implementation was present, yet validation repeatedly failed because it looked for a nested `.worktrees/...` path.
2. DAG authors/planners sometimes want deterministic subagent worktree and branch names. Without a first-class node workspace binding, that intent can leak into artifact paths, coupling validation to a parent checkout layout.

The runtime should make workspace binding explicit metadata and keep expected outputs workspace-root relative.

## What Changes

- Add optional DAG node `workspace` binding metadata:
  - `worktreeSlug`: deterministic worktree directory under the adapter worktree root.
  - `branch`: exact Git branch to create/reuse for the node subagent.
  - `baseRef`: base ref for worktree/branch creation.
- Persist node workspace binding in memory and SQLite stores.
- Extend DAG JSON parsing and schema to accept `workspace`.
- Teach the native-git subagent allocator to honor node workspace bindings.
- Fail closed when a bound worktree already exists on the wrong branch or has uncommitted changes.
- Reject native-git DAG nodes whose `outputs` start with `.worktrees/`.

## Capabilities

### New Capabilities
- Node-level deterministic native-git workspace binding.
- Fail-closed reuse of clean pre-existing bound subagent worktrees.

### Modified Capabilities
- DAG validation rejects `.worktrees/...` expected outputs for native-git nodes.
- DAG schema/docs describe workspace binding and workspace-root-relative outputs.

## Impact

- Directly affected: DAG types/parser/scheduler/schema/docs, SQLite persistence, native-git workspace allocation, and related tests.
- Unchanged: controller scheduling semantics, integration strategy, promotion semantics, and subagent prompt contract.

## Scope

### In
- Runtime consumption of node workspace binding.
- Native-git allocator support for deterministic worktree/branch creation/reuse.
- Expected output validation guard for native-git DAGs.

### Out
- Planner generation changes in the separate `agent-goal-planner` repo.
- Workspace-specific BeYourself rules.
- Automatic repair of already-running goals beyond manual DB repair already performed for `65f61476`.
