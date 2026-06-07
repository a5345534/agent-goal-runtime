## Why

DAG authors can require repository-changing subagent work to be merged before a node is complete by adding a completion gate. A live DAG used `worktree-merged-pr`, but the runtime only recognized a narrower set of integration gate names. As a result, branch-backed subagent work could be marked `integrationState=not-required` even though the DAG contract explicitly required the worktree/PR to be merged.

This is a runtime contract bug, not a workspace-specific policy. The runtime must honor explicit DAG gates without assuming any particular repository, workspace profile, target branch, or branch naming convention.

## What Changes

- Recognize `worktree-merged-pr` as an integration-requiring completion gate alias.
- Keep the rule generic: only the DAG gate declares the requirement; no workspace-level policy is inferred.
- Preserve existing fail-closed behavior when integration is required but no integrator is configured.
- Add tests covering both controller validation and final closeout behavior for the alias.

## Capabilities

### Modified Capabilities
- DAG completion-gate interpretation
- Subagent branch/worktree integration gating
- Goal closeout integration safety

## Impact

- Directly affected: `src/core/integration.ts`, controller/finalization tests.
- Unchanged: workspace profile rules, branch naming policy, promotion target selection, native-git merge strategy.

## Scope

### In
- Gate-name alias recognition for `worktree-merged-pr`.
- Tests that ensure branch-backed work cannot be marked `not-required` when that gate is present.

### Out
- Adding workspace-specific policy overlays.
- Assuming all goals use native git or PRs.
- Retrofitting existing blocked goals automatically.
- Resolving merge conflicts or dirty target worktrees.
