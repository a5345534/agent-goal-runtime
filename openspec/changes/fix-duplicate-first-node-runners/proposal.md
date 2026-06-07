## Why

The first ready DAG node can start two subagent runners for the same node. This happens when the initial goal-owned controller command path starts the first controller tick while a controller-session `session_start` recovery poll also runs against the same newly-created goal. The periodic/recovery poll uses a cross-process lease, but the initial controller loop did not, so both paths can observe no active subagent and launch a runner.

This is a runtime orchestration bug. The fix must not depend on any workspace-specific policy because goals may run in any repository or workspace.

## What Changes

- Make the initial goal-owned controller loop use the same cross-process controller poll lease as recovery/poll ticks.
- Keep scheduling semantics generic: the runtime still uses DAG state, max subagents, and subagent records, not workspace-specific rules.
- Add a Pi adapter regression test that simulates a `session_start` recovery poll racing the initial first-node start.

## Capabilities

### Modified Capabilities
- Pi goal-owned controller startup
- Controller poll recovery concurrency
- Subagent runner launch safety

## Impact

- Directly affected: `src/adapters/pi/index.ts`, Pi adapter tests.
- Unchanged: DAG parser, workspace profile policy, native-git merge strategy, model routing.

## Scope

### In
- Prevent duplicate first-node runner launch caused by initial-loop vs recovery-poll race.
- Tests proving only one subagent session starts for the first node under the race.

### Out
- Workspace-specific start rules.
- Changing `AGENT_GOAL_PI_MAX_SUBAGENTS` behavior.
- Retroactively cleaning existing duplicate runners.
