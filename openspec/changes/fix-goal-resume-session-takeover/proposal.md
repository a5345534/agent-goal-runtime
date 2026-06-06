## Why

`/goal resume <goal-ref>` currently launches a detached Pi RPC background session whenever the target goal has an execution workspace and session file. For DAG-owned controller goals this is unnecessary after the controller loop moved into the runtime poller: an active or resumed DAG can continue by restoring the poll loop. Re-attaching the same `sessionFile` from a second Pi RPC process can disrupt the foreground Pi TUI and appears to make Pi exit when resuming Goal `0c3af931`.

## What Changes

- Treat DAG-backed goal resume as controller-poller recovery instead of controller-session takeover.
- Do not launch a detached Pi RPC controller session for goals that already have persisted DAG nodes and an execution workspace.
- After resume, immediately start/recover the controller loop/poller for that goal and report that the goal is being polled.
- Keep the existing detached session resume path only for legacy non-DAG goals that still need a session prompt.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- Pi goal lifecycle resume behavior for orchestrated DAG goals.

## Impact

- Directly affected: `src/adapters/pi/index.ts`, Pi adapter tests.
- Related but unchanged: subagent runner process operations, monitor row actions, background subagent launch.

## Scope

### In
- Fix `/goal resume` and monitor resume action for DAG-backed Pi goals.
- Add regression coverage ensuring active DAG resume does not call the background controller launcher.

### Out
- DB reconcile actions.
- Duplicate-runner bulk cleanup.
- Changing subagent session launch behavior.
