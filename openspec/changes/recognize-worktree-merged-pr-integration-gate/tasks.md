## 1. Planning
- [x] Confirm scope and affected capabilities
- [x] Confirm that the runtime must not depend on workspace-specific policy overlays

## 2. Implementation
- [x] Recognize `worktree-merged-pr` as an explicit DAG integration-gate alias
- [x] Keep target branch/promotion semantics unchanged
- [x] Require integrator evidence for `not-required` under explicit gates
- [x] Update tests for controller validation and terminal closeout

## 3. Validation
- [x] Run project check
- [x] Refresh OpenSpec source manifest

## 4. Follow-up backlog
- [ ] [BACKLOG] Consider enumerating known completion-gate aliases in the DAG schema/docs
