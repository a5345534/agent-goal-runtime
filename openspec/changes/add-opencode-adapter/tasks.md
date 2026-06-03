## 1. Planning
- [x] Confirm scope and affected capabilities
- [x] Confirm project policy overlay assumptions

## 2. Implementation
- [x] Add `src/adapters/shared/workspace.ts` re-exporting
      `parseGoalWorkspaceFlags`, `resolveWorkspaceBinding`,
      `validateExecutionWorkspace`, and `tokenize`. Update the Pi
      adapter's `src/adapters/pi/workspace.ts` to re-export from the
      shared module so the existing Pi import paths still resolve.
- [x] Add `src/adapters/opencode/index.ts` exporting
      `opencodeGoalPlugin` (default + named) plus
      `setOpencodeBackgroundSessionLauncherForTests`.
- [x] Add `src/adapters/opencode/shims.d.ts` declaring the
      `@opencode-ai/plugin` types we depend on, so the package builds
      without the SDK as a runtime dep.
- [x] Add `src/adapters/opencode/plugin.ts` with the plugin entry
      that wires the runtime, registers `get_goal`, `create_goal`,
      `update_goal`, and `goal_command` tools, registers the TUI
      `/goal` slash command when `ctx.tui` is present, and
      subscribes to the opencode event hook.
- [x] Add `src/adapters/opencode/slash-command.ts` exposing
      `parseGoalSlashArguments` so the TUI command and the
      `goal_command` tool share the same argument shape.
- [x] Add `src/adapters/opencode/hidden-continuation.ts` with
      `startOpencodeHiddenGoalTurn`, the
      `attemptId -> hostPartId` map, and the
      `rewriteOpencodeQueuedContinuations` helper used by
      `experimental.chat.messages.transform`.
- [x] Add `src/adapters/opencode/session-transcript.ts` with
      `readOpencodeSessionMessages`, `normalizeOpencodeAssistantUsage`,
      and `buildOpencodeCompletionEvidence`.
- [x] Add `src/adapters/opencode/background-server.ts` with
      `launchOpencodeServeBackgroundSession` (spawns detached
      `opencode serve --port 0`, writes a ready file, and returns a
      `BackgroundOpencodeSessionHandle` with `sendPrompt`, `stop`,
      and `setSessionTitle`).
- [x] Add `src/adapters/opencode/subagent-adapter.ts` with
      `OpencodeHarnessSubagentAdapter` and
      `readOpencodeSubagentSessionState`. The adapter sets
      `adapterId = "opencode"`.
- [x] Add `src/adapters/opencode/completion-audit.ts` and
      `src/adapters/opencode/blocked-audit.ts` mirroring the Pi
      bridge's evidence builders, but reading opencode message
      shapes.
- [x] Update `src/core/index.ts` if needed (no changes expected —
      the opencode adapter consumes existing exports).
- [x] Update `package.json` to add `./opencode` and
      `./opencode/subagent-adapter` exports and the `opencode`
      peer-deps block.
- [x] Update README.md to add an "OpenCode bridge" section.
- [x] Update `docs/adapter-contract.md` to add an "OpenCode adapter
      status" section.

### 2b. Rebase on `origin/main` parity
- [x] Rebase `opencode-adapter` onto `origin/main` (PR #29-#37) so
      the opencode adapter is built on top of the latest portable
      core (DAG file loader, model routing, durable goal DAG
      closeout, live goal monitor dashboard).
- [x] Extend `parseGoalWorkspaceFlags` with `--model`,
      `--model-routing`, and `--model-routing-file` flags so the
      opencode adapter can consume inline / file / env routing
      config like the Pi bridge does.
- [x] Add `src/adapters/opencode/model-routing.ts` exposing
      `readOpencodeModelRoutingConfig`,
      `resolveOpencodeControllerModel`,
      `selectOpencodeSubagentModel`, and
      `modelArgFromOpencodeContext`; mirror the precedence chain
      from the Pi bridge (inline > file > env file > env JSON >
      DAG file's `modelRouting` > opencode session model).
- [x] Add `src/adapters/opencode/monitor-ui.ts` with
      `renderOpencodeMonitorLines` /
      `readOpencodeGoalMonitorSnapshot` so `/goal monitor` can show
      DAG node status, validation summary, subagent branch /
      workspace, and self-reported notes. The opencode harness owns
      the TUI; we expose a text-based renderer instead of a custom
      TUI controller.
- [x] Add `src/adapters/opencode/closeout.ts` with
      `finalizeOpencodeGoalFromDagTerminalState` and
      `formatOpencodeCloseoutDiagnostics` that wrap
      `finalizeGoalFromDagTerminalState` +
      `cleanupTerminalSubagentWorkspaces` and stop the detached
      opencode background session.
- [x] Wire the new modules into `src/adapters/opencode/plugin.ts`:
      - `parseGoalDagFileContent` for `/goal --dag <path>`.
      - `planGoalDagFromFileDocument` after the goal is created.
      - Controller model passed through to the controller
        subagent adapter as `modelArg`, which is forwarded to the
        opencode `session.prompt` body as
        `model: { providerID, modelID }`.
      - `runOpencodeControllerPoll` now calls
        `finalizeOpencodeGoalFromDagTerminalState` when the DAG is
        terminal, then cleans up subagent worktrees and stops the
        background session.
      - `monitorOpencodeGoal` delegates to
        `readOpencodeGoalMonitorSnapshot`.
- [x] Add `src/tests/opencode-model-routing.test.ts`,
      `src/tests/opencode-monitor.test.ts`,
      `src/tests/opencode-closeout.test.ts`, and the new plugin
      integration tests for `/goal --dag` and `/goal --model
      --model-routing`.
- [x] Update `package.json` to also export
      `./opencode/model-routing`, `./opencode/monitor`, and
      `./opencode/closeout`.
- [x] Update `README.md` and `docs/adapter-contract.md` to document
      the new flags, env vars, exports, and the closeout
      behaviour.

## 3. Validation
- [x] Run `npm run build` and confirm the new files compile.
- [x] Run `npm test` and confirm the new tests pass and the existing
      tests still pass (186 tests, 0 fail).
- [x] Run `npm run smoke:opencode` and confirm the plugin entry
      point loads and exports the harness subagent adapter.
- [x] Run `openspec_workflow build-source-manifest`,
      `validate-source-manifest`, and `archive-preflight` against
      the new change (all status=ok).

## 4. Follow-up backlog
- [ ] [BACKLOG] Add a TUI route for the goal list / monitor via
      `tui.route.register` (requires `@opentui/solid`).
- [ ] [BACKLOG] Add a mirror that writes the same
      `agent-goal-runtime-state` shape into a sidecar JSONL if
      opencode adds an export hook.
- [ ] [BACKLOG] Cross-harness goal handoff (Pi goal resumed in
      opencode) once the portable store gains a public
      `goalId -> sessionKey` resolver.
