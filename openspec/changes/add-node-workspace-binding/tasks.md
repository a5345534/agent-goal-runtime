## 1. Planning
- [x] Confirm runtime scope and non-goals
- [x] Confirm planner changes remain separate/backlog

## 2. Implementation
- [x] Add `GoalDagNode.workspace` binding type
- [x] Parse DAG file `node.workspace`
- [x] Persist workspace binding in memory and SQLite stores
- [x] Update DAG JSON schema and docs
- [x] Reject native-git `.worktrees/...` expected outputs
- [x] Teach native-git subagent allocator to create/reuse bound worktree/branch
- [x] Fail closed on dirty or branch-mismatched bound worktree reuse

## 3. Tests
- [x] Add DAG validation/parser tests for workspace binding and bad outputs
- [x] Add SQLite persistence test for workspace binding
- [x] Add native-git deterministic worktree/branch allocation tests

## 4. Validation
- [x] Run project check
- [x] Build committed dist artifacts
- [x] Refresh and validate source manifest

## 5. Follow-up backlog
- [ ] [BACKLOG] Update separate `agent-goal-planner` to emit `node.workspace` and workspace-root-relative outputs
