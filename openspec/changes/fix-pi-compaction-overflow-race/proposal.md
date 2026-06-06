## Why

Pi automatically compacts sessions after a context-overflow response and then retries the turn. The Goal runtime currently polls Pi subagent JSONL sessions and treats the first `stopReason=error` / `context_length_exceeded` assistant entry as a terminal subagent failure. In live Goal `0c3af931`, the runtime marked subagents failed and started escalated replacements seconds before Pi wrote the compaction entries and continued the original sessions. This creates duplicate subagents, stale runners, noisy failure history, and unnecessary branch/worktree churn.

## What Changes

- Teach Pi subagent session inspection to distinguish recoverable context-overflow recovery from terminal failure.
- Treat post-error Pi `compaction` entries as evidence that the overflow is being recovered and clear the stale error.
- Keep live/recent context-overflow sessions in `running` state instead of returning `failed` to the controller.
- Preserve controller escalation behavior only for genuinely terminal/stale context-overflow failures.
- Add regression tests covering the Pi JSONL race and controller no-escalation behavior.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- Pi subagent orchestration / controller failure recovery.

## Impact

- Directly affected:
  - `src/adapters/pi/subagent-adapter.ts`
  - `src/core/controller-loop.ts` behavior through adapter state classification
  - Pi subagent/controller tests
- Related but unchanged:
  - Pi core compaction implementation
  - Generic controller fallback model catalog
  - Git branch integration gate

## Scope

### In
- Prevent premature `failed` classification while Pi context-overflow compaction/retry is in progress.
- Ensure compaction entries after an overflow clear stale `lastError` state.
- Tests for the observed `0c3af931` race.

### Out
- Rewriting Pi compaction internals.
- Cleaning existing live Goal `0c3af931` runner state.
- Changing model routing/catalog decisions.
