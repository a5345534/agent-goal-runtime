## Context

Controller history events are durable and useful for diagnosis, but the raw sequence includes frequent `poll.started`, `poll.finished`, `subagent.synced`, validation start/hold, and repeated recovery/validation events. Rendering all of them by default makes live monitor output noisy and obscures the active blocker.

The source of truth should remain the ledger. This change only adjusts the Pi monitor render layer.

## Goals

- Make the default controller live pane concise enough to identify current progress or blockers quickly.
- Preserve access to the full raw controller ledger for debugging.
- Keep controller/runtime orchestration deterministic and unchanged.

## Decisions

### D1. Compact rendering is the default

**Choice**
- The controller live pane renders compact history by default.
- Compact mode hides known low-value events: poll start/finish, generic subagent sync, validation start/hold, and recovery start.

**Rationale**
- These events dominate active goals but rarely answer the user’s primary monitor question.
- The events remain persisted and available in debug mode.

**Alternative rejected**
- Stop recording noisy events. Rejected because the ledger is valuable for diagnosing controller behavior and replaying orchestration history.

### D2. Fold adjacent repeated meaningful events

**Choice**
- Compact mode groups adjacent events with the same event name, node, subagent, status transition, summary/reason/error, branch, and target.
- The rendered line uses the latest timestamp plus a repeat suffix such as `validation.failed ×3`.

**Rationale**
- Adjacent repetition is the main observed noise pattern after poll noise is hidden.
- Consecutive folding preserves chronology better than global aggregation.

**Alternative rejected**
- Aggregate all matching events across the whole history. Rejected because it can hide meaningful interleaving between different controller phases.

### D3. Current blocker diagnostic is non-scrolling

**Choice**
- When blocked/failed nodes, blocked/failed/needsFollowup subagents, or blocked/limited goals exist, the monitor shows a concise `Current blocker:` diagnostic above the scrollable live history.

**Rationale**
- Auto-following the live tail can otherwise scroll important context away.
- A non-scrolling diagnostic keeps the immediate blocker visible without changing ledger data.

**Alternative rejected**
- Pin blocker lines inside the live history array. Rejected because live tail following can still scroll them out of view.

### D4. Debug mode is a keyboard toggle

**Choice**
- `c` toggles compact/debug history mode for the current monitor controller instance.

**Rationale**
- This avoids new persistent config while giving immediate access to raw history when needed.

**Alternative rejected**
- Add a config/env flag first. Rejected as unnecessary for the first render-only improvement.

## Risks / Trade-offs

- Compact mode may hide a future event type that would be useful if added to the noise list. Mitigation: only known noisy events are filtered; unknown events remain visible.
- Folding uses normalized details, so small semantic differences not included in the fingerprint could be folded. Mitigation: include node, subagent, transitions, status, summary/reason/error, branch, and target.

## Migration Plan

1. Add compact/debug state and keyboard toggle to monitor controller.
2. Add render-layer event filtering/folding and current blocker diagnostic.
3. Update monitor help text and tests.
4. Build committed `dist/` artifacts.

## Open Questions

- Should the history mode become persisted user preference later?
