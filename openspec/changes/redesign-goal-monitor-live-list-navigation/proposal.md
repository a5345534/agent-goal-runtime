## Why

The current goal monitor mixes controller transcript, DAG nodes, and subagents in a single scroll-heavy dashboard. For active multi-node goals this makes operational decisions difficult: users must manually correlate goal-level live output, node state, and duplicate/stale runner records. The desired workflow is hierarchical and operational: enter a specific goal monitor by id, see controller live output plus a concise node list, drill into a node to inspect that node's live context and runners, then drill into a runner to inspect that runner's live transcript.

## What Changes

- Redesign the Pi goal monitor around two persistent regions:
  - **Live region**: transcript/details for the current focus target.
  - **List region**: selectable children of the current focus target.
- Add focus scopes:
  - Goal focus: live shows controller execution transcript; list shows DAG nodes.
  - Node focus: live shows selected node details and latest relevant subagent transcript; list shows that node's runners/subagents.
  - Runner focus: live shows selected runner/subagent transcript and execution details; list shows sibling runners for the node.
- Use keyboard selection as the terminal equivalent of clicking:
  - `↑/↓` navigate list rows.
  - `Enter` drill into selected node/runner.
  - `Backspace` or `b` go back one scope.
  - `l` focus list; `v` focus live; `Tab` toggles live/list focus.
- Preserve existing lifecycle actions (`pause`, `resume`, `clear`, `openSession`, `close`) and transcript scrolling.
- Prepare the monitor structure for future runner operations without making destructive runner actions part of this change.

## Capabilities

### New Capabilities
- Hierarchical goal monitor navigation.
- Node-focused live inspection.
- Runner/subagent-focused live inspection.

### Modified Capabilities
- Pi goal monitor layout and keyboard interaction.

## Impact

- Directly affected:
  - `src/adapters/pi/monitor-ui.ts`
  - `src/adapters/pi/index.ts`
  - `src/tests/pi-monitor-ui.test.ts`
  - built `dist/` output
- Related but unchanged:
  - runner process management
  - background runner launch/stop semantics
  - SQLite schema
  - controller scheduling/recovery policies

## Scope

### In
- Goal → node → runner monitor navigation.
- Two-region live/list rendering.
- Keyboard affordances equivalent to clicking terminal list entries.
- Tests for drill-down, back navigation, and live content switching.

### Out
- Actual runner stop/kill/archive operations.
- DB reconcile actions from the monitor.
- Mouse event support beyond keyboard `Enter` selection.
- Schema migrations or new runner persistence tables.
