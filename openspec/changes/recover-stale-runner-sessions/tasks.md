## 1. Planning
- [x] Confirm scope: stale dead runner + missing session recovery and root HTML lifecycle explainer.
- [x] Confirm this is runtime behavior and requires an OpenSpec change before implementation.

## 2. Implementation
- [x] Make Pi subagent liveness depend on live handles/background-runner inventory instead of persisted status.
- [x] Add controller recovery path for non-resumable missing session transcripts.
- [x] Preserve retry limits and provider quota blocking behavior.
- [x] Add root HTML lifecycle explainer.
- [x] Rebuild committed `dist/`.

## 3. Validation
- [x] Add/update Pi adapter tests.
- [x] Add/update controller-loop tests.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Validate OpenSpec source manifest.

## 4. Follow-up backlog
- [ ] [BACKLOG] Add DAG-declared workspace symlink/mount preflight if planner/runtime syntax is approved.
- [ ] [BACKLOG] Add durable per-node attempt records separate from terminal subagent state.
