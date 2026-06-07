## Why

The Pi goal monitor controller live pane currently renders every durable controller event as a raw chronological line. This preserves useful diagnostics, but in active goals it creates repeated poll, validation, and recovery noise that makes the actual blocker hard to see.

Users need the default monitor view to answer “what is happening now?” without losing access to raw controller history for debugging.

## What Changes

- Default the controller live pane to a compact controller history view.
- Hide low-value controller poll/sync noise in compact mode.
- Fold adjacent repeated controller events with the same effective meaning into one line with a repeat count.
- Show the current blocker as a non-scrolling diagnostic line above controller history when a node/subagent/goal is blocked.
- Add a monitor key toggle (`c`) to switch between compact and raw debug controller history.

## Capabilities

### New Capabilities
- Compact controller history rendering for Pi goal monitor.
- Debug history toggle for raw controller ledger inspection.

### Modified Capabilities
- Pi goal monitor controller live pane defaults to compact display while preserving raw ledger data.

## Impact

- Directly affected: `src/adapters/pi/monitor-ui.ts` and monitor UI tests.
- Unchanged: controller ledger persistence, scheduling semantics, validation, recovery, and workspace policy.

## Scope

### In
- Render-layer filtering/folding only.
- Pinned current-blocker diagnostic in monitor output.
- Regression tests for compact/default and debug/raw modes.

### Out
- Deleting or changing durable ledger events.
- Changing controller behavior or retry policy.
- Adding new monitor configuration storage.
