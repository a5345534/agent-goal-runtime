## Why

Live goals can become operationally stuck when a background subagent runner exits before Pi creates or persists the session JSONL file. The controller previously trusted the persisted subagent status (`sessionStarted` / `running`) as evidence that the runner was still live, so a dead runner with a missing transcript could be treated as `starting` forever. Operators then had to inspect `/tmp`, repair the SQLite state, and restart the node manually.

This violates the runtime contract that an `active` goal should keep making best-effort progress until explicit retry/provider limits are reached.

## What Changes

- Pi subagent session inspection no longer treats persisted DB status or unverified handles as runner liveness.
- Controller recovery recognizes missing-session/dead-runner failures as non-resumable stale attempts.
- Within the configured retry budget, the controller terminalizes the stale attempt and starts a replacement subagent against the same workspace/branch when available.
- Controller ledger history records stale attempt terminalization and replacement starts.
- A project-root HTML explainer documents the current goal/controller/node/subagent lifecycle and controller monitoring/preflight responsibilities.

## Capabilities

### New Capabilities
- Stale runner/session replacement recovery.
- Human-readable controller lifecycle explainer HTML.

### Modified Capabilities
- Pi subagent liveness detection.
- Controller failed-subagent recovery routing.

## Impact

- Affected: `src/adapters/pi/subagent-adapter.ts`, `src/core/controller-loop.ts`, controller-loop tests, Pi subagent adapter tests, generated `dist/`.
- Documentation: root HTML explainer.
- Unchanged: provider quota behavior, validation command semantics, native-git fail-closed merge/promotion rules.

## Scope

### In
- Detect dead/missing Pi subagent transcripts deterministically.
- Replace a non-resumable stale attempt instead of prompting a nonexistent session.
- Preserve retry limits and provider-limit blocking behavior.
- Document the runtime lifecycle in HTML at project root.

### Out
- General workspace mount/symlink declaration language.
- Automatic semantic repair of brittle validators.
- Provider/model quota fallback implementation.
