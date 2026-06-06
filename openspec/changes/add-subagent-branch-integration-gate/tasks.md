## 1. Planning
- [x] Confirm scope: runtime integration gate for subagent branches and final-audit enforcement.
- [x] Confirm project policy overlay assumptions via OpenSpec scaffold.
- [ ] Define exact native-git integration strategy: merge, cherry-pick, or configurable.
- [ ] Define metadata schema for required/no-op integration decisions.

## 2. Implementation
- [ ] Add integration metadata to core types and stores:
  - [ ] subagent integration status (`pending`, `integrating`, `complete`, `failed`, `not-required`)
  - [ ] source branch/ref/head and integrated commit evidence
  - [ ] integration error/conflict summary
- [ ] Add SQLite migrations and memory-store support.
- [ ] Add native-git integration operation in controller completion flow.
- [ ] Prevent node `complete` until required integration succeeds.
- [ ] Prevent dependent scheduling/final audit when upstream integration is pending or failed.
- [ ] Ensure `update_goal({status:"complete"})` refuses completion when any required integration is not terminal-successful.
- [ ] Update Pi status/monitor to display integration state and blockers.
- [ ] Update final-audit validation contracts so report existence alone is insufficient when violations remain.
- [ ] Add manual recovery command/path for integration conflicts.

## 3. Validation
- [ ] Add unit tests for native-git integration success.
- [ ] Add unit tests for merge/cherry-pick conflict producing blocked/needs-followup state.
- [ ] Add regression test for false-complete prevention when subagent branch is not integrated.
- [ ] Add regression test for final audit report with violations failing validation.
- [ ] Run `npm run check`.
- [ ] Validate source manifest freshness.
- [ ] Generate and validate explainer before archive/review.

## 4. Documentation
- [ ] Update README goal workflow notes.
- [ ] Update `docs/goal-dag-format.md` for integration behavior and metadata.
- [ ] Document manual repair of already-completed goals.

## 5. Follow-up backlog
- [ ] [BACKLOG] Add planner hints for integration-required vs report-only nodes.
- [ ] [BACKLOG] Extend integration backend for non-Pi/non-native-git adapters.
- [ ] [BACKLOG] Add UI affordance to inspect and resolve integration conflicts from `/goal monitor`.
