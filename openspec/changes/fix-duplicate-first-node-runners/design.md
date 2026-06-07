## Context

Pi goal-owned DAG execution has two controller-loop entry points:

1. the initial `/goal --dag` or `/goal <objective>` command path, and
2. recovered/periodic controller polls started from `session_start`, `/goal` command preflight, and poll timers.

The recovered/periodic path already uses `acquirePiGoalControllerPollLease()` to serialize controller ticks across extension/runtime processes. The initial command path directly calls `runtime.runGoalControllerLoop()` without that lease.

When the background goal-owned controller session starts, its own extension instance can run `session_start` and immediately recover active DAG goals from durable state. If this happens while the initial command path is launching the first subagent but before the subagent record is saved, both paths can start the same ready node.

## Goals

- Ensure there is only one controller loop execution per goal across initial startup and recovered/periodic polls.
- Preserve generic DAG scheduling semantics and avoid workspace-specific assumptions.
- Keep existing fail-closed polling behavior and lease TTL semantics.

## Decisions

### D1. Reuse the controller poll lease for initial startup

**Choice**
- Add a helper that runs `runtime.runGoalControllerLoop()` only after acquiring the same per-goal controller poll lease used by `runPiGoalControllerPoll()`.
- Call that helper from `runPiGoalControllerLoopForGoal()` during initial goal-owned startup.

**Rationale**
- The bug is a controller-loop concurrency issue, so the guard belongs at the controller-loop entry point.
- The guard is generic: keyed only by goal id and durable state root, not by workspace path, repository, branch format, or user policy.

**Alternative rejected**
- Special-case first nodes, first workspaces, or BeYourself paths. That would not be portable.
- Disable recovery polls during startup. Separate Pi processes do not share memory reliably enough for an in-process flag to be sufficient.

### D2. Leave max-subagent semantics unchanged

**Choice**
- Keep `AGENT_GOAL_PI_MAX_SUBAGENTS` behavior unchanged. The lease only prevents duplicate controller executions for the same goal; the scheduler still decides how many distinct ready nodes may start.

**Rationale**
- Multiple concurrent runners can be valid for different nodes when configured. The invalid case is duplicate runners for the same node from concurrent controller loops.

**Alternative rejected**
- Forcing global max subagents to 1. That would change user configuration semantics.

## Risks / Trade-offs

- If a recovery poll wins the lease before the initial command path, the initial command notification may under-report the number of runners started by that concurrent poll. This is preferable to duplicate work and is limited to startup race timing.
- Stale leases remain governed by the existing TTL.

## Migration Plan

1. Add a leased controller-loop helper.
2. Use it for the initial goal-owned startup loop.
3. Add a regression test that holds the first subagent launcher pending while a session-start recovery poll runs.
4. Run full checks and commit built `dist/` artifacts.

## Open Questions

- Should a future core-store claim primitive prevent duplicate node starts even for non-Pi adapters? This is a broader follow-up beyond the observed Pi startup race.
