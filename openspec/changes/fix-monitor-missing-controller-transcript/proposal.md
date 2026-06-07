## Why

Runtime-owned Pi DAG controllers can have a `sessionFile` recorded in goal metadata even when the background controller Pi process exits before producing a JSONL transcript. The monitor currently renders this as a raw `Session file not found: ...` warning in the controller live pane, which makes a healthy goal look broken while subagent runners may still be active.

## What Changes

- Treat missing controller transcripts as a benign controller-live UX condition.
- Keep runner transcript handling strict so missing subagent session files remain visible diagnostics.
- Hide controller `openSession` actions when the recorded session file is absent.
- Add monitor tests for the missing controller transcript case.

## Capabilities

### Modified Capabilities
- Pi goal monitor controller live transcript rendering
- Pi goal monitor controller row operations

## Impact

- Directly affected: `src/adapters/pi/monitor-ui.ts`, monitor UI tests.
- Unchanged: controller scheduling, subagent execution, runner transcript diagnostics, goal DB schema.

## Scope

### In
- Controller-only transcript diagnostic wording when the file is absent.
- Controller row operation availability for missing files.
- Unit test coverage.

### Out
- Reconstructing deleted/missing JSONL files.
- Changing runner/subagent session file diagnostics.
- Changing goal orchestration or recovery behavior.
