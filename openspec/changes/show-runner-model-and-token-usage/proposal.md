## Why

Goal monitor runner scope currently shows `LIVE: Runner <subagentId>` but omits the actual model and token usage for that runner session. During multi-runner goals, operators need to see which model is consuming tokens and how much of the session budget has already been spent without opening the raw session.

## What Changes

- Parse runner session JSONL for `model_change`, `thinking_level_change`, and assistant `usage` metadata.
- Extend runner live-pane title to include model and session token total.
- Prefer actual session model metadata; fall back to runner launch config or DAG node model metadata.
- Keep row-scoped monitor operations unchanged.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- Pi goal monitor runner live display.

## Impact

- Directly affected: `src/adapters/pi/monitor-ui.ts`, `src/tests/pi-monitor-ui.test.ts`.
- Related unchanged: controller scheduling, runner lifecycle operations, goal accounting totals.

## Scope

### In
- Display runner model and tokens beside `LIVE: Runner ...`.
- Add transcript parser coverage for model/thinking/token metadata.

### Out
- Changing persisted goal token accounting.
- Adding per-runner budget enforcement.
- Altering runner row actions.
