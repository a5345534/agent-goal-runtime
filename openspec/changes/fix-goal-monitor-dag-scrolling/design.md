## Context

The Pi adapter's `/goal monitor` is implemented by `GoalMonitorController` in `src/adapters/pi/monitor-ui.ts`. The component renders a fixed set of header/status lines, then a `DAG / Subagents` section, then a transcript tail. The transcript has durable scroll state (`scroll`) and a live-follow flag (`followTail`). The DAG section has no scroll state: it renders `dagLines.slice(0, DEFAULT_VISIBLE_DAG_LINES)` and, when the slice hides data, appends `… N more DAG lines`.

Because `DEFAULT_VISIBLE_DAG_LINES` is 18 and each node may render multiple lines (node status, validation summary, subagent status, branch, workspace, note), realistic multi-node goals overflow quickly. The monitor advertises live DAG inspection, but the overflow footer is informational only.

## Goals

- Make all DAG/subagent lines reachable inside the live Pi monitor.
- Preserve existing lifecycle action behavior: `←→` / `Tab` select buttons, `Enter` invokes the selected action, `Esc` closes.
- Preserve transcript live-follow behavior when the user is not manually scrolling the transcript.
- Keep the implementation local to the Pi monitor controller; do not change runtime state, DAG scheduling, or persistence.
- Keep the UI lightweight and dependency-free: no new layout engine or mouse handling.

## Decisions

### D1. Add pane focus instead of global scroll

**Choice**
- `GoalMonitorController` tracks an active pane: `dag` or `transcript`.
- `d` focuses the DAG pane and `t` focuses the transcript pane.
- `↑↓`, `PageUp/PageDown`, `Home`, and `End` act on the active pane.
- The monitor starts focused on the DAG pane so overflowing DAG details are immediately scrollable; transcript live-follow still runs unless the transcript pane is manually scrolled.

**Rationale**
- The monitor has two independently useful data sets with different follow behavior. A single global scroll would force users to scroll past the entire DAG before reaching the transcript and would break the existing tail-follow mental model.
- Dedicated pane focus makes the key behavior explicit while leaving action buttons on the existing left/right/tab path.
- Starting on the DAG pane directly fixes the observed `… more DAG lines` dead-end: pressing `↓` reveals the hidden DAG lines.

**Alternative rejected**
- Use `Tab` to switch panes. Rejected because `Tab` already cycles lifecycle actions and should remain unchanged.
- Only add `/goal status` guidance. Rejected because monitor is the live dashboard and should not require leaving it for data it already loaded.

### D2. Keep fixed pane heights for this change

**Choice**
- Keep `DEFAULT_VISIBLE_DAG_LINES = 18` and `DEFAULT_VISIBLE_TRANSCRIPT_LINES = 18`.
- Add per-pane scroll offsets and bounded slices, plus range/footer lines showing visible offsets and hidden lines above/below.

**Rationale**
- The current TUI component interface passes only width to `render(width)`, so proportional height allocation is not available in this controller without larger Pi TUI changes.
- Fixed heights keep the patch small and testable while solving the data reachability issue.

**Alternative rejected**
- Redesign the monitor as a full-screen split view with dynamic height. Rejected as larger UI work and unnecessary for the regression.

### D3. Clamp scroll positions on every render

**Choice**
- On each render, clamp DAG and transcript scroll offsets against the latest line counts.
- If transcript follow-tail is enabled, recompute the transcript offset from the latest transcript length.
- If a refresh removes or shortens DAG/transcript content, the scroll offset falls back to the nearest valid page instead of rendering empty space.

**Rationale**
- The monitor refreshes DAG state every second and reads transcript snapshots repeatedly. Scroll positions must survive growth but not point beyond available content after a clear/retry/closeout.

**Alternative rejected**
- Clamp only during input handling. Rejected because live refreshes can change line counts without input.

## Risks / Trade-offs

- Defaulting active focus to the DAG pane changes what `↑↓` does immediately after opening monitor. This is intentional to address unreachable DAG overflow, and `t` restores transcript scrolling.
- Users need to learn `d` / `t` pane focus. The help line and pane headers show the active pane and available keys.
- Fixed visible line counts may still exceed very short terminals, but this is existing behavior and out of scope for the targeted regression.

## Migration Plan

1. Update `GoalMonitorController` to maintain `activePane`, `dagScroll`, `transcriptScroll`, and `followTail` separately.
2. Update rendering to slice DAG lines by `dagScroll`, show active pane markers, and print DAG/transcript range footers.
3. Add regression tests that an overflowing DAG hides later nodes initially, then reveals them after DAG scroll input; also verify transcript scroll remains available after pressing `t`.
4. Update README monitor keybinding documentation.
5. Rebuild `dist/` and run the test suite.

## Open Questions

- Should a future Pi TUI API expose available height to custom components so monitor panes can allocate lines responsively?
- Should a future monitor add search/filter by node status or node id for very large DAGs?
