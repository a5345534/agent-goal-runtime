## Why

Live Goal `0c3af931` is stuck in `controllerValidating` even though subagents reported successful implementation and validators pass. The stored DAG uses basename-only expected outputs such as `WorkflowExpenseEvent.java`, but the controller validation runner checks each expected output as a literal path under the subagent workspace. As a result, files that exist at real module paths are repeatedly reported missing.

## What Changes

- Keep exact/absolute path expected-output checks unchanged.
- When an expected output is basename-only, accept it if it matches a changed path basename from git diff/status.
- Also accept a basename-only output when exactly one matching file exists under the workspace.
- Add regression coverage for basename-only outputs matching real module paths.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- Controller validation expected-output matching.

## Impact

- Directly affected: `src/core/validation-runner.ts`, validation runner tests.
- Related unchanged: executable validators, artifact locks, integration gates.

## Scope

### In
- Basename expected-output resolution for controller validation.
- Regression tests and dist rebuild.

### Out
- Planner DAG output generation changes.
- DB reconcile actions.
