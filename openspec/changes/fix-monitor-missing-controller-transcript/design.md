## Context

The Pi monitor has two transcript sources:

1. controller live transcript from `GoalSummary.sessionFile`, and
2. runner live transcript from each `GoalSubagentRecord.sessionFile`.

For runtime-owned DAG goals the controller is not always an interactive assistant session. Pi may reserve a controller session path and report it through the background-runner ready file, but if no turn is written the JSONL file never appears. The controller poller can still be healthy and subagents can still run, yet the monitor prints a raw missing-file warning in the controller pane.

Runner transcript missing-file diagnostics are still important because they indicate a concrete subagent session record cannot be inspected.

## Goals

- Make controller-live missing transcript diagnostics non-alarming and actionable.
- Preserve strict missing-file diagnostics for runner/subagent transcripts.
- Avoid offering `openSession` for controller session files that do not exist.

## Decisions

### D1. Add a controller-specific transcript reader

**Choice**
- Keep `readGoalTranscript()` unchanged as the strict low-level JSONL reader.
- Add `readControllerTranscript()` for the monitor controller pane. It delegates to `readGoalTranscript()` and rewrites only missing-controller-file/no-controller-file diagnostics to controller-specific wording.

**Rationale**
- Runner views continue to surface `Session file not found` because that is useful for debugging stale subagents.
- Controller views communicate that a missing runtime-owned controller transcript is expected/benign and direct users to runner panes for live work.

**Alternative rejected**
- Changing `readGoalTranscript()` globally would hide important runner/session corruption diagnostics.

### D2. Gate controller openSession on file existence

**Choice**
- Keep `openSession` available only when `goal.sessionFile` exists on disk.

**Rationale**
- Opening a non-existent controller transcript fails or confuses users.
- The row operation list should reflect what can actually be opened.

**Alternative rejected**
- Always showing `openSession` when metadata has a path preserves legacy behavior but keeps a dead action visible.

## Risks / Trade-offs

- If a controller session file is expected but temporarily delayed, the monitor may show the benign message until the next render; this is acceptable because it is controller-only and does not affect runners.
- File existence checks in render/action computation add a small fs stat cost, but monitor rendering already reads transcript files.

## Migration Plan

1. Add controller-specific transcript helper.
2. Switch `GoalMonitorController` default reader to the controller helper.
3. Gate controller `openSession` with `existsSync`.
4. Add tests for missing controller transcript handling.

## Open Questions

- Should a future controller poller write a small synthetic controller event stream to avoid empty controller panes entirely? This is out of scope for this bugfix.
