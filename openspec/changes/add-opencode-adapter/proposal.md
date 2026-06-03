## Why

`agent-goal-runtime` already ships a portable `/goal` runtime plus a fully-featured
Pi bridge. The README and `docs/adapter-contract.md` both call out that "other
agent harness bridges are intentionally out of scope for this first
implementation and should be added through separate changes." OpenCode
(`opencode` CLI, `opencode-ai/plugin` SDK) is the next user-facing harness we
need to support so its users can run the same Codex-compatible `/goal`
workflow, including orchestrated DAGs, subagent worktrees, and the
`get_goal` / `create_goal` / `update_goal` model tools.

Without an OpenCode adapter the portable core is still useful (CLI smoke
surface) but the runtime is invisible to OpenCode's TUI/server modes, and
its subagent/orchestration features have no harness to attach to. Adding
the adapter now unlocks the runtime for the OpenCode ecosystem without
rewriting the portable core.

## What Changes

- Add a new `src/adapters/opencode/` package that exports an
  `@opencode-ai/plugin` `Plugin` and a `HarnessSubagentAdapter` named
  `"opencode"`. The plugin reuses the portable `GoalRuntime`, `SQLiteGoalStore`,
  `NativeGitWorkspaceManager`, and the same workspace validation logic the
  Pi adapter uses.
- Register the Codex-compatible model tools (`get_goal`, `create_goal`,
  `update_goal`) plus a `goal_command` tool that accepts a full `/goal`
  argument string. In TUI mode, also register a `/goal` slash command via
  `tui.command.register` that prompts for input and forwards it to the same
  handler.
- Translate OpenCode events (`session.created`, `session.idle`,
  `session.error`, `session.compacted`, `message.part.updated`,
  `tool.execute.after`) into the same runtime hooks the Pi adapter uses:
  `sessionResumed`, `turnStarted`, `turnFinished`, `toolCompleted`,
  `pauseGoal` on aborted/error turns, and post-stop `tool.execute.before`
  blocking.
- Implement `startHiddenGoalTurn` by calling
  `client.session.prompt({ sessionID, parts: [textPart] })` on the user's
  current OpenCode session. Track `attemptId`s to keep the callback
  idempotent and rewrite stale bookkeeping through the
  `experimental.chat.messages.transform` hook the same way the Pi adapter
  rewrites queued continuation messages.
- Implement an OpenCode-specific `OpencodeHarnessSubagentAdapter` that
  spawns detached `opencode serve` background sessions per subagent
  (one worktree per DAG node) using the same detached process-group
  pattern the Pi bridge uses, then drives those sessions through the
  OpenCode SDK.
- Run the same completion audit / blocked audit evidence shapes the Pi
  adapter builds, but derive them from opencode session messages and
  tool parts (text, tool calls, tool results) read through the SDK or
  the OpenCode session JSONL file. Default to the portable
  heuristic auditor for completion and reuse the same three-consecutive-
  turn rule for blocked.
- Update `package.json` exports, README, and `docs/adapter-contract.md`
  to describe the new adapter and the install path (`opencode plugin
  install <dist>`).

## Capabilities

### New Capabilities

- `opencode-goal-bridge` — OpenCode plugin + subagent adapter that exposes
  the portable `/goal` runtime to OpenCode TUI and server modes.
- `opencode-subagent-adapter` — `HarnessSubagentAdapter` implementation
  that launches detached `opencode serve` sessions in dedicated
  worktrees for DAG nodes.
- `opencode-conformance-tests` — Node `node:test` suites that exercise
  the plugin's tool handlers, slash-command registration, hidden
  continuation, completion/blocked audits, and subagent launch against
  stubbed OpenCode clients.

### Modified Capabilities

- `goal-adapter-contract` — `docs/adapter-contract.md` gains an "OpenCode
  adapter" section that mirrors the Pi section and notes the plugin
  install + OpenCode-specific env vars.
- `package-metadata` — `package.json` adds `./opencode` exports and an
  `opencode` peer-deps block.

## Impact

- New files under `src/adapters/opencode/`:
  `index.ts`, `plugin.ts`, `slash-command.ts`, `hidden-continuation.ts`,
  `session-transcript.ts`, `subagent-adapter.ts`, `background-server.ts`,
  `completion-audit.ts`, `blocked-audit.ts`, `workspace.ts`,
  `session-store.ts`, `shims.d.ts`, plus tests under
  `src/tests/opencode-*.test.ts`.
- New compiled artifacts under `dist/adapters/opencode/`.
- `src/core/index.ts` is unchanged: the OpenCode adapter consumes the
  same public exports the Pi adapter already uses.
- `package.json` gains `./opencode` and `./opencode/subagent-adapter`
  export paths, optional `opencode`-themed peer-deps, and a `files`
  list entry (already covered by `dist`).
- README and `docs/adapter-contract.md` gain an "OpenCode bridge"
  section, mirroring the "Pi bridge" section.

## Scope

### In

- Plugin entry that registers tools, slash command, event hook, and
  hidden-continuation flow.
- Codex-compatible `get_goal` / `create_goal` / `update_goal` tools with
  the same audit gates the Pi adapter enforces.
- `OpencodeHarnessSubagentAdapter` that launches `opencode serve`
  background processes per DAG node and tracks them through the
  controller loop.
- Reuse of the portable `NativeGitWorkspaceManager` and
  `validateExecutionWorkspace` so worktree/branch/ref binding behaviour
  is identical across harnesses.
- Heuristic completion audit and three-turn blocked audit, both reading
  opencode session messages.
- Unit tests that stub the OpenCode client and verify tool handlers,
  event translation, hidden continuation, subagent launch, and
  completion/blocked audit behaviour.
- Documentation and a CLI smoke path (`npm run build` then `node -e`
  against the compiled plugin) to verify the entry point loads.

### Out

- A full TUI component for the goal list / monitor (the OpenCode TUI
  extension API uses a `@opentui/solid` peer dep we are not pulling in
  here; list/monitor/pause/resume are exposed through the same tool
  surface the Pi adapter uses, and a TUI component can be added in a
  follow-up).
- Server-side long-running socket reconnection logic (we treat each
  `opencode serve` background session as a fire-and-supervise child,
  matching the Pi bridge's "detached child process" stance).
- Cross-harness goal handoff (e.g. a goal started in Pi resumed in
  OpenCode). The portable store is the bridge; cross-harness resume is
  out of scope for V1.
- OpenSpec workflow changes for archived change routing.
