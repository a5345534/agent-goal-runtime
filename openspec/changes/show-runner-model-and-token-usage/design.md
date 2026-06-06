## Context

The Pi session JSONL already records model changes, thinking-level changes, and assistant usage metadata. The monitor transcript reader renders the visible transcript but did not preserve those metadata fields for display.

## Goals

- Show actual runner model and thinking level in runner live scope.
- Show session-local assistant token usage in runner live scope.
- Avoid confusing runner session totals with the goal-wide token total.

## Decisions

### D1. Compute token usage from runner transcript metadata

**Choice**
- Sum assistant message `usage` fields from the selected runner session JSONL.
- Support the same usage shapes as the Pi adapter: `{input, output}`, `{inputTokens, outputTokens}`, `{totalTokens}`, and `{total}`.

**Rationale**
- The session file is the authoritative local source for runner-specific usage.
- Goal-wide token usage is already displayed in the monitor status header and should not be reused for per-runner display.

**Alternative rejected**
- Store per-runner usage in SQLite on each poll. That is useful later, but not required for monitor display because the session transcript is already read on refresh.

### D2. Prefer actual session model metadata

**Choice**
- The title uses `model_change` and `thinking_level_change` from the session when present.
- If missing, it falls back to runner inventory `modelArg`, then DAG node `modelArg`/`thinkingLevel`.

**Rationale**
- Actual session metadata reflects model fallback or recovery better than intended DAG metadata.

## Risks / Trade-offs

- Token totals are session-local and may not match goal-level accounting if a session file is missing or truncated.
- Older sessions without usage metadata display `tokens=0`.

## Migration Plan

1. Extend transcript snapshot metadata.
2. Update runner live title rendering.
3. Add monitor UI tests and rebuild dist.

## Open Questions

- None.
