## Context

Runtime DAG nodes previously had `workspaceStrategy` but no first-class metadata for deterministic subagent worktree/branch binding. A planner/user could describe a desired worktree in prose, but if that path was copied into `expectedOutputs`, controller validation treated it as an artifact path relative to the subagent workspace root. That produced false missing-output failures such as looking for:

```text
<subagent-worktree>/.worktrees/<other-worktree>/projects/...
```

instead of:

```text
<subagent-worktree>/projects/...
```

## Goals

- Keep artifact paths (`outputs`) relative to the subagent workspace root.
- Represent deterministic worktree/branch assignment as workspace metadata, not artifact paths.
- Let native-git adapters create or reuse a controller-assigned node worktree/branch before launching the subagent.
- Fail closed on dirty or mismatched pre-existing bound worktrees.

## Decisions

### D1. Add `node.workspace` binding metadata

**Choice**
- Add optional node field:

```json
"workspace": {
  "worktreeSlug": "node-worktree",
  "branch": "feat/node-worktree",
  "baseRef": "main"
}
```

- Persist it as `GoalDagNode.workspace` and `goal_dag_nodes.workspace_json`.

**Rationale**
- The binding is scheduler/adapter metadata and should not be encoded in output paths.
- A JSON object leaves room for future adapter-specific fields without overloading `workspaceStrategy`.

**Alternative rejected**
- Encode worktree/branch in `workspaceStrategy`. Rejected because `workspaceStrategy` identifies allocation strategy, not per-node binding inputs.

### D2. Native-git allocator honors the binding

**Choice**
- `createNativeGitSubagentWorkspaceAllocator` passes `node.workspace.worktreeSlug`, `branch`, and `baseRef` into `NativeGitWorkspaceManager.allocateSubagentWorkspace()`.
- If `worktreeSlug` or `branch` is provided, allocation is deterministic:
  - create the exact worktree/branch if absent;
  - reuse it if it exists, is on the expected branch, and is clean;
  - throw if it is dirty or on another branch.

**Rationale**
- This makes the subagent join a controller-assigned workspace and prevents accidental path invention.
- Dirty/mismatched reuse must fail closed to preserve native-git safety guarantees.

**Alternative rejected**
- Always allocate collision suffixes even when a node binding is present. Rejected because it defeats deterministic node binding.

### D3. Reject `.worktrees/...` native-git outputs

**Choice**
- DAG validation fails for native-git nodes with expected outputs that normalize to `.worktrees` or `.worktrees/...`.

**Rationale**
- `outputs` are artifact paths under the subagent workspace root. `.worktrees/...` describes a parent checkout layout and is not portable.
- Failing at DAG parse/plan time prevents repeated controller validation loops.

**Alternative rejected**
- Normalize `.worktrees/<slug>/...` by stripping the prefix. Rejected because it guesses user intent and could hide malformed DAGs.

## Risks / Trade-offs

- Existing DAGs that use `.worktrees/...` outputs for native-git nodes now fail early. This is intentional because those DAGs are not portable and can false-block goals.
- Bound worktree reuse requires cleanliness. A user may need to clean or remove an existing worktree before the node can start.
- Planner must be updated separately to emit `workspace` binding metadata instead of embedding worktree paths in `outputs`.

## Migration Plan

1. Runtime accepts/persists `node.workspace`.
2. Native-git allocator honors workspace binding.
3. Runtime rejects bad native-git output paths early.
4. Planner is updated later to generate bindings and workspace-root-relative outputs.

## Open Questions

- Should future adapters support additional `workspace` fields (for example external workspace ids) behind adapter-specific namespaces?
