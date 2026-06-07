## Context

The controller is intentionally a programmatic state machine. It polls durable DAG state, syncs subagent sessions, runs validation, performs integration, and handles closeout. Because it is not an LLM agent, there may be no controller JSONL session to show in the monitor.

The monitor therefore needs to show controller history, not controller chat.

## Design

### Durable controller event ledger

Add `controller_event` to `GoalLedgerEventType`. The event details carry a stable `event` name plus contextual fields such as `nodeId`, `subagentId`, `summary`, `reason`, counts, branch/head info, retry counters, and model routing info.

Examples:

```json
{ "type": "controller_event", "details": { "event": "poll.started", "nodes": 6, "subagents": 3 } }
{ "type": "controller_event", "details": { "event": "validation.failed", "nodeId": "impl", "summary": "missing outputs: report.md" } }
{ "type": "controller_event", "details": { "event": "followup.sent", "nodeId": "impl", "subagentId": "subagent-..." } }
```

### Controller-loop instrumentation

Controller ticks record events around major decisions:

- `poll.started` / `poll.finished`
- `node.started`
- `subagent.synced`, `subagent.result`, `subagent.blocked`, `subagent.failed`
- `validation.started`, `validation.passed`, `validation.failed`, `validation.blocked`
- `followup.sent`, `followup.needed`, `validation.followupCapped`
- `recovery.sent`, `recovery.started`, `recovery.blocked`
- `integration.started`, `integration.passed`, `integration.failed`, `integration.blocked`, `integration.followup`
- `node.complete`
- `dag.terminal`, `promotion.started`, `promotion.passed`, `promotion.blocked`
- `goal.finalized`, `cleanup.finished`

Ledger writes are best-effort diagnostics. Failures to write history must not disrupt orchestration.

### Monitor rendering

`GoalMonitorDagSnapshot` includes ledger events. In controller scope, the live pane renders one line per ledger event:

```text
[05-31T00:04:00Z] validation.failed      node=impl subagent=subagent-1 summary=missing outputs: report.md
```

If no ledger history exists but a controller transcript exists, the pane can still show a legacy transcript fallback. Missing controller transcript diagnostics remain non-fatal.

## Trade-offs

- More ledger events are written per controller tick, but the runtime already prunes per-goal ledger events.
- Initial historical detail for already-running goals is limited to events recorded after this change plus existing goal lifecycle ledger entries.
- Event rendering is intentionally compact and line-oriented; richer grouping/filtering can be added later.
