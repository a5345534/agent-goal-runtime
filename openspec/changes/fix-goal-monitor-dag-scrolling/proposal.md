## Why

`/goal monitor` currently renders the live DAG/subagent dashboard above the transcript tail, but the DAG section is capped at 18 rendered lines. When a goal has enough DAG nodes or subagent details to overflow that cap, the monitor prints a footer such as `… 13 more DAG lines` with no way to reveal the hidden lines. The documented `↑↓` keys only scroll the transcript tail, so users cannot inspect the rest of the live DAG without leaving the monitor and running `/goal status`.

This is especially painful for multi-node DAG goals because the hidden lines often include planned nodes, retry subagents, failed integration notes, branch/workspace paths, or final-audit dependencies that the monitor is supposed to expose live.

## What Changes

- Make the Pi `/goal monitor` dashboard a two-pane read-only viewer: `DAG / Subagents` and `Transcript tail`.
- Add keyboard focus between panes so users can scroll the DAG when it overflows and still scroll/follow the transcript tail when needed.
- Keep lifecycle action navigation (`←→`, `Tab`, `Enter`, `Esc`) unchanged.
- Update monitor help/status text to show the active pane and available scroll keys.
- Add tests that reproduce the hidden `… more DAG lines` case and verify the hidden DAG lines become visible through monitor input.
- Update README documentation for the monitor keybindings.

## Capabilities

### New Capabilities

- `goal-monitor-dag-scroll` — Pi monitor users can scroll the DAG/subagent section when it exceeds the visible viewport.

### Modified Capabilities

- `pi-goal-monitor` — The existing read-only live monitor gains pane focus and page-wise scrolling without changing lifecycle actions.
- `goal-runtime-documentation` — README describes the new monitor pane/scroll keys.

## Impact

- `src/adapters/pi/monitor-ui.ts` — Track active pane, separate DAG scroll state, page scrolling, bounded viewport slices, and updated help/footer rendering.
- `src/tests/pi-monitor-ui.test.ts` — Add regression coverage for overflowing DAG lines and transcript scrolling after switching focus.
- `README.md` — Document `/goal monitor` pane focus and scrolling.
- `dist/adapters/pi/*` — Rebuild compiled package artifacts.

## Scope

### In

- Pi `/goal monitor` TUI component only.
- Keyboard-driven scrolling for DAG and transcript panes.
- Live refresh behavior that preserves scroll positions safely as DAG/transcript lengths change.
- Regression tests for the monitor controller.

### Out

- OpenCode monitor UI changes; the OpenCode adapter currently exposes a text renderer rather than Pi's interactive TUI component.
- Rich split-pane layout, mouse support, search/filter, or expandable per-node detail views.
- Changes to DAG scheduling, subagent state persistence, or goal runtime core semantics.
