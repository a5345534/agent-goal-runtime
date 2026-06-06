## Context

Goal-owned Pi controllers originally resumed by launching a detached Pi RPC process against the controller session file and sending a resume prompt. The runtime now owns DAG scheduling and periodic polling. For goals with persisted DAG nodes, re-opening the controller session is not required; it can also conflict with the foreground Pi session when the same session file is already visible.

## Goals

- Make `/goal resume <dag-goal>` safe when the goal is already active or paused.
- Ensure resume recovers controller polling immediately without attaching a duplicate Pi RPC controller session.
- Preserve legacy resume behavior for non-DAG/session-bound goals.

## Decisions

### D1. Resume DAG goals by restoring the controller loop/poller

**Choice**
- Detect whether the target has an execution workspace plus persisted DAG nodes.
- For such goals, call `runtime.resumeGoal(..., { continueIfIdle: false })`, then run one controller loop pass and start the polling loop using the goal workspace binding.
- Notify the user that orchestration polling has resumed.

**Rationale**
- DAG execution state is durable in SQLite; controller polling can advance validation, integration, and scheduling without a new prompt in the controller transcript.
- Avoids opening the same `sessionFile` from a second Pi process, which can disrupt the foreground TUI.

**Alternative rejected**
- Launching a new detached controller RPC session only when the current foreground session is different. This still risks concurrent writers and is unnecessary for DAG orchestration.

### D2. Keep legacy fallback unchanged

**Choice**
- If a goal lacks persisted DAG nodes or execution workspace metadata, keep using the existing command/session-bound resume path.

**Rationale**
- Legacy goals may depend on the session continuation mechanism rather than controller-poller orchestration.

## Risks / Trade-offs

- A DAG goal resume will not append an explicit resume prompt to the controller transcript. The runtime ledger and monitor status remain the source of truth for orchestration recovery.
- If controller loop execution hits a validation/integration blocker, resume will surface it as a notification and subsequent monitor state rather than foreground chat output.

## Migration Plan

1. Update Pi adapter resume branching.
2. Add regression tests for DAG resume not launching background controller sessions.
3. Rebuild `dist/` and validate.

## Open Questions

- None.
