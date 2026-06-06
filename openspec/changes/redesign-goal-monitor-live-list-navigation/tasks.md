## 1. Planning
- [x] Capture target monitor workflow
- [x] Confirm Pi TUI input model supports keyboard drill-down

## 2. Implementation
- [x] Add monitor scope state: goal, node, runner
- [x] Render persistent live region and list region
- [x] Render goal node list with selection and node runner counts
- [x] Render node runner list with selection
- [x] Render runner details and transcript live view
- [x] Add keyboard navigation: Enter drill, back, live/list focus, scrolling
- [x] Preserve lifecycle action row and action selection

## 3. Validation
- [x] Add tests for goal live + node list initial view
- [x] Add tests for node drill-down switching live/list content
- [x] Add tests for runner drill-down switching live/list content
- [x] Add tests for back navigation and focus/scroll behavior
- [x] Run `npm run check`
- [x] Rebuild `source-manifest.json`
- [x] Generate and validate explainer
- [x] Run archive preflight

## 4. Follow-up Backlog
- [ ] [BACKLOG] Add runner process inventory to monitor rows
- [ ] [BACKLOG] Add safe runner stop/kill/archive operations with dry-run preview
- [ ] [BACKLOG] Add monitor-driven DB reconcile actions with automatic backups
