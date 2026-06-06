## 1. Planning
- [x] Confirm scope and affected capabilities
- [x] Confirm project policy overlay assumptions

## 2. Implementation
- [x] Update Pi session parser to consume `compaction` entries and clear stale overflow errors
- [x] Return non-terminal `running` state for live/recent context-overflow recovery
- [x] Ensure controller does not auto-escalate while adapter reports running recovery

## 3. Validation
- [x] Add Pi adapter regression tests for overflow-before-compaction and post-compaction recovery
- [x] Add controller regression test for no fallback start on running overflow recovery
- [x] Run `npm run check`
- [x] Rebuild `source-manifest.json`

## 4. Follow-up backlog
- [ ] [BACKLOG] Consider exposing first-class Pi compaction lifecycle events to runtime adapters
