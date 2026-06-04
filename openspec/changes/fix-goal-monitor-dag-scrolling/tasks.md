## 1. Planning
- [x] Confirm scope and affected capabilities
- [x] Confirm project policy overlay assumptions
- [x] Reproduce the UX gap from current `GoalMonitorController`: DAG lines beyond `DEFAULT_VISIBLE_DAG_LINES` are rendered only as `… N more DAG lines` with no DAG scroll input.

## 2. Implementation
- [x] Add pane focus state to `GoalMonitorController` (`dag` / `transcript`) without changing lifecycle action navigation.
- [x] Add independent DAG scroll state and bounded DAG line slicing.
- [x] Keep transcript tail follow behavior, but move transcript scroll state to an explicit transcript offset.
- [x] Add `d` / `t` pane focus keys and active-pane scroll handling for `↑↓`, `PageUp/PageDown`, `Home`, and `End`.
- [x] Update monitor help/footer text to show the active pane and DAG/transcript ranges.
- [x] Update README `/goal monitor` documentation.
- [x] Rebuild `dist/` so the packaged Pi adapter includes the fix.

## 3. Validation
- [x] Add regression tests for overflowing DAG lines becoming visible through monitor input.
- [x] Add/adjust tests proving transcript scrolling still works after switching to the transcript pane.
- [x] Run `npm run check`.
- [x] Run OpenSpec source-manifest rebuild/validation for this change.

## 4. Follow-up backlog
- [ ] [BACKLOG] Add monitor search/filter by node id/status if large DAGs remain hard to browse.
- [ ] [BACKLOG] Consider dynamic pane heights if Pi custom components expose terminal height in the future.
