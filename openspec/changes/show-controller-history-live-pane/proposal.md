## Why

The Pi goal monitor controller row currently tries to show a controller transcript, but the controller is a deterministic runtime/poller rather than an LLM session. Runtime-owned controllers often have no Pi JSONL transcript, so users cannot see what the controller has done or why a goal/node changed state.

Users need a durable, scrollable one-line history from goal start to the present: controller polls, node starts, subagent results, validation outcomes, follow-ups, recovery prompts, integration decisions, and completion/blocking events.

## What Changes

- Add a durable `controller_event` ledger event type.
- Have controller ticks record orchestration events into the goal ledger.
- Load goal ledger events into the Pi monitor DAG snapshot.
- Render the controller live pane as controller history lines instead of relying on a nonexistent controller transcript.
- Keep controller execution deterministic; no controller LLM session is introduced.

## Scope

### In
- Controller history event recording for core controller-loop actions.
- Pi monitor controller pane history rendering.
- Tests for ledger recording and history rendering.

### Out
- Adding a controller LLM agent.
- Advanced filtering/search in history.
- Post-promotion full validator reruns.
