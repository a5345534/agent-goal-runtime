## Context

The Pi monitor currently renders a DAG/subagent block and a transcript tail block. Both are scrollable, but the DAG block is informational only: selecting a node or subagent does not change what the live transcript shows. This is insufficient for operating active goals with duplicate or stale runners because the user wants to move through the hierarchy rather than manually cross-reference text.

The new interaction model treats `/goal monitor <id>` as an operational browser:

```text
Goal monitor
├─ live: controller transcript / goal execution details
└─ list: DAG nodes
   └─ selected node
      ├─ live: node details + latest node/subagent transcript
      └─ list: runners/subagents for that node
         └─ selected runner
            ├─ live: runner transcript + runner details
            └─ list: sibling runners for the same node
```

## Goals

- Make the monitor easy to operate without shell commands.
- Keep goal/node/runner context visually separate.
- Let `Enter` on a list row change the live pane to that row's scope.
- Preserve existing monitor lifecycle actions and no-UI fallback.
- Avoid destructive runner operations in this first UX redesign.

## Decisions

### D1. Two-pane mental model: live + list

**Choice**
- Render a live region first and a list region second.
- The live region displays content for the current scope.
- The list region displays child/sibling selectable rows relevant to that scope.

**Rationale**
- The user can always answer: "what is running now?" and "what can I select next?"
- This maps naturally to goal → node → runner navigation.

### D2. Keyboard selection implements terminal "click"

**Choice**
- `↑/↓` moves list selection.
- `Enter` drills into the selected node/runner.
- `b`/Backspace returns to the parent scope.
- `Tab` toggles live/list focus; `l` and `v` jump directly.
- `PgUp/PgDn/Home/End` scroll the focused pane.

**Rationale**
- Existing TUI input exposes keyboard handling. Keyboard selection works in all terminals and can later be extended to mouse events if Pi exposes them.

### D3. Runner focus uses subagent records first

**Choice**
- Treat persisted `GoalSubagentRecord` rows as monitor runner rows.
- Show session transcript from `subagent.sessionFile` when available.
- Show runner metadata from DB fields: status, workspacePath, branch, integration state, activity timestamps, self-reported result/integration status.

**Rationale**
- Subagent records are the durable source of truth already available through runtime snapshots.
- OS process inspection is useful but belongs to the future runner-ops change.

### D4. Goal live remains controller transcript

**Choice**
- Goal focus continues to read `goal.sessionFile`.
- Node focus reads the latest selected node subagent transcript if available, with node metadata above the transcript.
- Runner focus reads that runner's session transcript.

**Rationale**
- Preserves existing behavior while making drill-down views useful.

## UX Sketch

```text
Goal 0c3af931 [pause] resume clear openSession close
scope=goal live=controller list=nodes selected=update-workflow-producer
status=active/idle-eligible ...
────────────────────────────────────
▶ LIVE: Controller execution
[08:51:23Z] toolResult update_goal: ...
...
────────────────────────────────────
▶ LIST: Nodes 2/6
  1. [planned] cross-module-integration-verify runners=0
> 2. [controllerValidating] update-workflow-producer runners=3 latest=controllerValidating
  3. [controllerValidating] update-cost-collection-model-and-listener runners=3 latest=controllerValidating

Enter drill • b back • l/v focus • Tab switch • ↑↓ navigate/scroll • PgUp/PgDn • Esc close
```

Node focus:

```text
scope=node update-workflow-producer
LIVE: Node details + latest runner transcript
LIST: Runners for update-workflow-producer
```

Runner focus:

```text
scope=runner subagent-0c3af931-update-workflow-producer-3
LIVE: Runner transcript + details
LIST: Sibling runners for update-workflow-producer
```

## Risks / Trade-offs

- The first redesign still uses subagent DB records rather than live OS process inventory, so duplicate process inspection remains a follow-up.
- Node live chooses the latest subagent transcript; users can drill into a different runner for exact transcript selection.
- More keyboard states mean tests must cover navigation regressions.

## Follow-up

- Add runner process inventory and safe runner operations in a separate governed change.
- Add DB reconcile actions after runner operations are available.
- Consider mouse click support if Pi TUI exposes row click events.
