## Why

Controller validation failures can currently create a tight follow-up loop when a subagent repeatedly self-reports completion without changing the failing validation signal. In the live `0c3af931` recovery, an audit node hit a validator false positive; the controller repeatedly sent the same validation-failure follow-up and spawned duplicate background runners for the same subagent/session.

This undermines the session-preserving recovery policy: the controller should preserve context, but it should not keep launching duplicate work for the same unchanged validation blocker.

## What Changes

- Track repeated controller-validation failure signatures per subagent using existing persisted validation results.
- Allow a bounded number of same-session validation follow-ups for the same failure signature.
- When the same failure repeats past the limit, mark the node/subagent `blocked` with a diagnostic instead of spawning another runner.
- Keep successful validation/integration behavior unchanged.
- Keep planner/DAG production unchanged.

## Capabilities

### New Capabilities
- Bounded controller validation recovery for repeated identical validator failures.

### Modified Capabilities
- Controller DAG orchestration follow-up behavior after failed validators.

## Impact

- Affected: `src/core/controller-loop.ts`, controller-loop tests, built `dist/` artifacts.
- Related unchanged: validator command execution, subagent session preservation, model routing, native git integration.

## Scope

### In
- De-duplicate repeated validation-failure follow-up prompts for the same subagent.
- Block with explicit diagnostic after repeated identical failure signature.
- Unit tests covering first/second follow-up and third repeated failure block.

### Out
- Automatic semantic repair of incorrect DAG validators.
- Changing validator DSL/schema.
- Removing the `failed` enum.
