## Context

Pi stores assistant turns and compaction entries in a JSONL session file. Its own `AgentSession` handles context overflow by detecting a context-overflow assistant error, running auto-compaction, appending a `compaction` entry, rebuilding agent state, and retrying/continuing. The Goal runtime does not receive a dedicated Pi RPC lifecycle event for this recovery. It polls the JSONL file through `readPiSubagentSessionState()`.

The current parser only considers `message` entries. If it sees an assistant error it records `lastError`, and later `readPiSubagentSessionState()` maps any `lastError` to `failed`. Because `compaction` entries are ignored, a transcript sequence like:

1. assistant `stopReason=error`, `context_length_exceeded`
2. Pi starts auto-compaction
3. runtime polls before/while compaction is written
4. Pi appends `compaction` and continues

can be misclassified as a terminal subagent failure. The controller then starts a new escalated subagent while the original session is still recovering.

## Goals

- Make Pi subagent inspection recovery-aware for context-overflow compaction.
- Prevent duplicate fallback subagents when the original Pi session is still live/recent and recovering.
- Keep existing fallback/escalation behavior for stale or terminal context-overflow failures.
- Keep implementation local to the runtime adapter/controller surface; do not alter Pi core.

## Decisions

### D1. Model context-overflow as a recoverable Pi session state while live/recent

**Choice**
- If the latest assistant error is a context-overflow error and the session is live/recent, `readPiSubagentSessionState()` returns `running` instead of `failed`.
- It may include a diagnostic error/note, but the status remains non-terminal so controller auto-escalation does not trigger.

**Rationale**
- Pi itself owns compaction/retry. The runtime should not preempt that lifecycle on the first overflow entry.
- The controller already avoids auto-recovery unless a subagent is terminal `failed`.

**Alternative rejected**
- Always escalate immediately on `context_length_exceeded`. This caused the observed duplicate-subagent race.

### D2. Treat post-error compaction entries as recovery evidence

**Choice**
- Extend the Pi JSONL parser to process `compaction` entries.
- A compaction entry after an assistant error clears `lastError` and moves the parsed tail role away from `assistant` so a live session remains `running` until a later assistant result/error arrives.

**Rationale**
- Compaction is the concrete evidence that Pi accepted the overflow and is rebuilding context.
- It prevents stale pre-compaction errors from remaining sticky.

**Alternative rejected**
- Ignore `compaction` entries and rely on future assistant messages. This leaves a window where runtime polling can misclassify the session.

### D3. Preserve stale/terminal failure behavior

**Choice**
- A context-overflow assistant error may still become failed when the session is not live/recent enough to be recovering.
- Existing stale-session handling remains the fallback for abandoned non-assistant tails.

**Rationale**
- The runtime must not wait forever if Pi recovery never progresses.

**Alternative rejected**
- Never fail context-overflow sessions. That would hide genuine unrecoverable overflow states.

## Risks / Trade-offs

- A failed context-overflow session may stay `running` until stale detection/grace expires if liveness is imperfect.
- Runtime only infers compaction lifecycle from JSONL entries; there is still no first-class Pi RPC recovery state.
- If Pi appends multiple overflow/compaction cycles, the parser must treat only the latest tail state as authoritative.

## Migration Plan

1. Update Pi session parsing and classification.
2. Add adapter-level regression tests for live overflow and post-overflow compaction.
3. Add controller-level regression test ensuring running context-overflow diagnostics do not start fallback subagents.
4. Build and run the runtime test suite.

## Open Questions

- Should Pi expose explicit `compaction_start` / `compaction_end` RPC events for cleaner integration in the future?
