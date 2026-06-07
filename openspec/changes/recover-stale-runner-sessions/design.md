## Context

The controller polls durable DAG/subagent state and delegates harness-specific session inspection to the adapter. For Pi subagents, the persisted subagent record contains the target session file path, but the transcript is produced asynchronously by a detached background Pi RPC runner. A bad startup can leave this combination:

- subagent status is `sessionStarted` or `running`;
- runner PID is no longer alive;
- session JSONL path is known but absent.

Before this change, the Pi adapter used the persisted status as a proxy for `live=true`, so the missing file was reported as `starting` rather than failed. Since no transcript existed, same-session recovery prompts were impossible, but the controller had no fixed path to replacement.

## Goals

- Make runner/session liveness a controller-visible invariant rather than an operator-only diagnosis.
- Preserve existing same-session recovery for resumable transcripts.
- Replace only non-resumable missing-session attempts, and only within retry budget.
- Keep the controller deterministic and adapter-driven; do not add LLM decision-making to orchestration.
- Explain the runtime lifecycle for operators and implementers in a root HTML document.

## Decisions

### D1. Pi liveness must come from verified live handles or live background runner inventory

**Choice**
- `PiHarnessSubagentAdapter.getSessionState()` treats a subagent as live only when the current adapter process has a handle that can still prove its detached runner PID is alive, or the background-runner inventory shows a live runner/child process for that subagent.
- Persisted DB status alone is not liveness evidence, and an unverified in-memory handle is not liveness evidence.

**Rationale**
- DB state can survive process death and failed detached startup.
- In-memory handles can also become stale after an external process kill.
- The `/tmp/agent-goal-runtime-bg-*` ready/config files and live PID checks are the durable evidence available to reconnect poll adapters after restart.

**Alternative rejected**
- Continue trusting `sessionStarted`/`running` as `live=true`. This creates permanent `starting` illusions after runner death.

### D2. Missing transcript + dead runner is non-resumable stale state

**Choice**
- Controller classifies missing session-file failures as stale non-resumable attempts.
- If retry budget remains, it marks the old attempt `failed`, records a `recovery.replacedStaleSession` event, and starts a new subagent with a recovery initial prompt.
- The replacement prefers the same workspace/branch/ref as the stale attempt; if unavailable it falls back to the configured workspace allocator.

**Rationale**
- Same-session recovery requires a session file to resume.
- Reusing the existing workspace preserves any repository state that may have been created before the runner vanished.
- Starting a distinct subagent record keeps audit history intact and prevents primary-key collisions.

**Alternative rejected**
- Send a follow-up prompt to the missing session path. This is not reliable because there is no transcript to resume and Pi may not have a valid session object.

### D3. Retry/provider rules stay authoritative

**Choice**
- Provider quota/billing errors still block instead of spawning replacements.
- Missing-session replacements consume retry budget.
- When retry budget is exhausted, the node/subagent become blocked with a clear diagnostic.

**Rationale**
- Automatic replacement must not create infinite runner loops.
- Quota failures are external-resource blockers, not stale runner symptoms.

**Alternative rejected**
- Always restart missing sessions indefinitely. This hides systemic runtime failures and can produce duplicate work.

### D4. Lifecycle explainer is committed as root HTML

**Choice**
- Add a self-contained project-root HTML file describing goal operation, controller tick phases, monitoring/preflight controls, node lifecycle, and subagent lifecycle.

**Rationale**
- Operators need a stable, readable overview when diagnosing live goals.
- HTML is easy to open locally from the project root and can include structured diagrams/tables without requiring docs tooling.

**Alternative rejected**
- Only update README. The user explicitly requested a root HTML explanation.

## Risks / Trade-offs

- Replacement subagents may create new Pi sessions even when an extremely delayed JSONL would have appeared later. The live runner check and existing `starting` behavior for live runners mitigate this.
- Reusing the old workspace can expose a replacement subagent to partial uncommitted state. The recovery prompt instructs it to inspect workspace state first.
- Background-runner inventory can miss manually moved temp dirs; in that case a missing transcript is correctly treated as non-resumable.

## Migration Plan

1. Add stale missing-session classifiers and replacement-start recovery in the controller.
2. Make Pi adapter liveness detection depend on actual handles/runner inventory.
3. Add tests for live-missing-session grace and dead-missing-session failure/replacement.
4. Add root HTML explainer.
5. Build `dist/`, run checks, and refresh OpenSpec source manifest.

## Open Questions

- Should future DAG syntax support declared workspace symlinks/mounts so controller preflight can create them deterministically?
- Should retry accounting move from subagent records to durable node attempt records for all adapters?
