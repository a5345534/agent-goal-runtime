## Context

`validateOrHold()` persists `controllerValidating`, runs the configured validator, appends validation summaries/signals to `GoalSubagentRecord.controllerValidationResults`, and sends `validation.followupPrompt` when validation fails but is recoverable.

If a subagent immediately self-reports again without changing the failing validator output, the next controller tick sees another `selfReportedComplete` state and sends the same follow-up. This can become a retry storm and, in the Pi adapter, leave multiple background runners attached to the same subagent/session.

## Goals

- Preserve same-session recovery for ordinary validation failures.
- Prevent unbounded duplicate follow-up runners for identical validation blockers.
- Persist enough state to survive controller restarts without a new schema migration.
- Surface a clear blocked diagnostic when the repeated blocker needs human/controller intervention.

## Decisions

### D1. Use validation result history as the retry ledger

**Choice**
- Derive a stable validation failure signature from `validation.summary` plus `validation.validationSignals`.
- Count previous occurrences in `subagent.controllerValidationResults` before appending the new result.
- Allow two automatic follow-up sends for the same signature; block on the third occurrence.

**Rationale**
- `controllerValidationResults` is already persisted in memory/SQLite stores.
- No migration is required.
- Counting exact repeated summaries/signals is sufficient for the observed storm and avoids conflating different failures.

**Alternative rejected**
- Add a new DB column for validation retry counts. This is heavier, requires migrations, and duplicates data already present in validation history.

### D2. Block repeated identical validation failures instead of spawning replacement sessions

**Choice**
- When the signature reaches the limit, set node/subagent `blocked` and include the repeated validator diagnostic.

**Rationale**
- The user policy prefers session preservation and classified recovery/blocking over terminal `failed` states.
- Replacement sessions would likely repeat the same validator false positive and waste quota.

**Alternative rejected**
- Keep sending follow-ups indefinitely. This caused duplicate runner storms in live recovery.

## Risks / Trade-offs

- Exact string matching may miss semantically identical failures whose summaries vary slightly.
- A real fix that still leaves the same validator failing twice will block on the third occurrence; this is acceptable because the repeated unchanged controller evidence indicates the automated path is not making progress.

## Migration Plan

1. Add a small helper in `controller-loop.ts` to compute/count validation failure signatures.
2. Gate follow-up prompt sends in `validateOrHold()` with the helper.
3. Add controller-loop tests for bounded retries and blocked diagnostics.
4. Rebuild `dist/` and run validation.

## Open Questions

- Should the retry limit become runtime config in a future change? For now it remains a small controller constant.
