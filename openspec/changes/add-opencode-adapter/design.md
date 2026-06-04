## Context

The portable core (`src/core/*`) already provides:

- `GoalRuntime` + `SQLiteGoalStore` for portable goal state and the
  Codex-compatible status set.
- `parseGoalCommand` for slash command parsing.
- `HarnessSubagentAdapter` contract plus helpers (`startGoalSubagent`,
  `sendGoalSubagentPrompt`, `syncGoalSubagentState`).
- `NativeGitWorkspaceManager` for controller / subagent worktree
  allocation, plus `validateExecutionWorkspace` for branch/ref
  verification, and `cleanupTerminalSubagentWorkspaces` for terminal
  goal closeout.
- DAG planner + scheduler + controller orchestration loop
  (`runGoalControllerLoop`), plus `planGoalDagFromFileDocument` for
  file-based multi-node DAGs.
- File-based DAG loader (`parseGoalDagFileContent` /
  `GoalDagFileDocument`) for `/goal --dag <path>`.
- Model routing by scenario (`parseGoalModelRoutingConfigJson`,
  `resolveControllerModelArg`, `selectModelScenarioForNode`,
  `GoalModelRoutingConfig`) with per-node `modelScenario` and
  `modelArg` persistence.
- Durable goal DAG closeout via
  `finalizeGoalFromDagTerminalState`.
- Pluggable `GoalAdapterCallbacks` (resolveSessionKey, readHarnessState,
  startHiddenGoalTurn, injectSteeringContext, notifyGoalUpdated,
  notifyGoalCleared, notifyGoalWarning, collectCompletionEvidence,
  getCompletionPolicyContext, auditCompletion).

The Pi bridge (`src/adapters/pi/*`) wires all of these to Pi's
`ExtensionAPI`. The OpenCode adapter needs to do the same thing for
OpenCode's `@opencode-ai/plugin` hook surface, but the harness shape is
different:

- Plugins are ESM modules exporting `async (ctx) => hooks` where
  `ctx.client` is an `OpencodeClient`, `ctx.directory` is the project
  root, `ctx.worktree` is the worktree root, and `ctx.$` is a BunShell.
- Tools use the `tool({ description, args, execute })` builder with
  `zod` schemas (not TypeBox like the Pi bridge).
- TUI slash commands are registered through
  `ctx.tui.command.register(cb)` where `cb` returns `TuiCommand[]`
  with a `slash: { name }` and an `onSelect` callback. We must not
  hard-require `@opentui/solid`; the TUI is an optional peer dep.
- Session-level state lives in OpenCode's session file
  (`~/.local/share/opencode/...`); events are streamed through
  `client.event.subscribe()` and the `event` hook callback.

## Goals

- Ship a new `src/adapters/opencode/` package that registers the same
  three Codex-compatible model tools and a `goal_command` tool, plus a
  `/goal` slash command in TUI mode, and translates opencode events
  into portable runtime hooks.
- Reuse the portable core (no forking of `GoalRuntime`,
  `NativeGitWorkspaceManager`, `HarnessSubagentAdapter` helpers, or
  parser).
- Provide a `HarnessSubagentAdapter` named `"opencode"` so the
  controller orchestration loop can launch detached `opencode serve`
  background sessions per DAG node in dedicated worktrees.
- Match the Pi bridge's user-facing surface for `/goal <args>` parsing,
  including `--dag`, `--model`, `--model-routing`, and
  `--model-routing-file` flags.
- Mirror the Pi bridge's controller closeout path: when the DAG
  reaches a terminal state, call `finalizeGoalFromDagTerminalState`
  + `cleanupTerminalSubagentWorkspaces` and stop the detached
  opencode background session.
- Forward resolved model routing (controller + per-DAG-node
  subagent) to the opencode `session.prompt` body as
  `model: { providerID, modelID }`.
- Expose a text-based monitor through `/goal monitor` since the
  opencode harness owns the TUI.
- Tests that exercise tool handlers, slash-command registration,
  hidden continuation, completion audit, blocked audit, and subagent
  launch against a stubbed `OpencodeClient` so the adapter does not
  require a running opencode binary to verify behaviour.
- Documentation in README and `docs/adapter-contract.md`.

## Decisions

### D1. Reuse the Pi bridge's slash-command and workspace modules

**Choice**
- The opencode adapter reuses `parseGoalWorkspaceFlags`,
  `resolveWorkspaceBinding`, `validateExecutionWorkspace`, and
  `tokenize` from a new shared `src/adapters/shared/workspace.ts`
  module. The Pi adapter re-imports from that shared module too (the
  existing `src/adapters/pi/workspace.ts` becomes a thin re-export to
  avoid breaking the compiled Pi import paths).

**Rationale**
- Worktree/branch/ref policy is harness-agnostic; the same
  `AGENT_GOAL_ALLOWED_WORKSPACE_ROOTS` env var should apply.
- `validateExecutionWorkspace` already does read-only git inspection,
  which is exactly what opencode needs.
- We avoid two divergent copies of the parser.

**Alternative rejected**
- Re-implementing workspace validation in the opencode adapter. Rejected
  because it would let the two harnesses drift apart, and the contract
  doc explicitly says workspace binding is the adapter's responsibility.

### D2. Slash command is exposed both as a tool and as a TUI command

**Choice**
- The plugin registers a `goal_command` tool whose `args.command` is the
  full argument string after `/goal` (e.g. `migrate to v2`, `status`,
  `pause <id>`). The `description` and `args.command` tell the model
  to forward user `/goal <args>` input into this tool.
- When `ctx.tui` is present, the plugin also registers a `/goal`
  TUI slash command via `tui.command.register` that opens a
  `DialogPrompt`, captures the user's argument string, and invokes the
  same goal handler synchronously. The TUI is an optional peer dep so
  the plugin still loads in `opencode serve` mode without it.

**Rationale**
- The Pi adapter accepts `/goal` as a slash command. The closest
  opencode equivalent is the TUI command API, which only exists in
  TUI mode.
- A `goal_command` tool means `/goal` works uniformly in
  `opencode run` and `opencode serve` modes too, since the model is
  always in the loop.
- The model is told in the tool description that this is the canonical
  `/goal` entry point; the TUI command is a UX shortcut, not a
  divergent behaviour.

**Alternative rejected**
- Custom command file under `~/.config/opencode/commands/goal.md`.
  Rejected because it requires a manual install step and is duplicated
  per user; the plugin-based path is automatic once the plugin is
  loaded.

### D3. Hidden continuation uses the opencode session prompt API

**Choice**
- `startHiddenGoalTurn` calls
  `client.session.prompt({ sessionID, parts: [textPart] })` on the
  current session. The text part embeds the same
  `<agent_goal_continuation ...>` markers the Pi adapter uses so the
  `experimental.chat.messages.transform` hook can rewrite stale
  bookkeeping identically.
- Idempotency is tracked in a plugin-scoped `Map<attemptId, hostPartId>`.
  A second call for the same `attemptId` returns
  `{ kind: "alreadyStarted", hostTurnId }`.

**Rationale**
- The portable runtime is the source of truth for continuation
  reservations. The adapter just has to make one prompt per attempt.
- We avoid polling opencode's SSE event stream from the adapter by
  listening to the `event` hook that opencode delivers to plugins.
- Using session-scoped prompts (rather than a separate session) keeps
  the user-visible transcript intact.

**Alternative rejected**
- Spinning up a new opencode session per continuation. Rejected because
  it would fork the user's transcript and confuse the model's context.

### D4. Subagent adapter spawns a detached `opencode serve` per DAG node

**Choice**
- The `OpencodeHarnessSubagentAdapter` calls a launcher function
  (default: spawns `opencode serve --port 0` in the subagent's
  worktree, then drives it through the SDK with a unique
  `agent-goal-subagent-<id>` session title).
- The same `setPiBackgroundGoalSessionLauncherForTests` style hook is
  exposed as `setOpencodeBackgroundSessionLauncherForTests` so tests
  can inject fakes.
- The adapter inspects the subagent session by reading the opencode
  session file directly (opencode writes session JSONL under
  `~/.local/share/opencode/storage/session/<project>/<id>.json`),
  similar to how the Pi adapter inspects `*.jsonl` session files.

**Rationale**
- Matches the Pi adapter's "detached child process" pattern so a
  controller crash does not leak subagent processes; we use the same
  process-group kill pattern.
- Reading the opencode session file directly gives us stable
  SUBAGENT_RESULT / SUBAGENT_BLOCKED marker detection without coupling
  to the opencode SDK's unstable types.

**Alternative rejected**
- Reusing the opencode SDK's async prompt API in-process. Rejected
  because we need a dedicated worktree per subagent and that requires a
  fresh process so opencode's session directory is bound to that
  worktree.

### D5. Stale continuation rewriting and tool-call interception

**Choice**
- The `experimental.chat.messages.transform` hook rewrites queued
  continuation messages the same way the Pi adapter does
  (`stale_goal_continuation`, `superseded_goal_continuation`).
- The `tool.execute.before` hook is used to enforce the same
  same-turn post-stop guard: if a goal already stopped in the current
  turn and the tool is not in the allowed set
  (`get_goal`, `read`, `grep`, `find`, `ls`), the adapter sets
  `output.args = undefined` and returns a blocking reason. (The opencode
  hook signature is `output: { args }`; we set `args` to a no-op and
  surface the reason through the tool description plus a follow-up
  user notification.)
- The `tool.execute.after` hook feeds `toolCompleted` for progress
  accounting, mirroring the Pi adapter's `tool_execution_end` event.

**Rationale**
- These three opencode hooks are the moral equivalents of Pi's
  `context`, `tool_call`, and `tool_execution_end`. Reusing the same
  helper code (extracted into `src/adapters/shared/hooks.ts` so both
  adapters can call them) keeps the harness-specific surface small.

**Alternative rejected**
- Duplicating the helper logic in the opencode adapter. Rejected to
  keep the two harnesses in lock-step.

### D6. Token usage derived from opencode session messages

**Choice**
- The plugin sums the opencode message `tokens.input + tokens.output`
  channels across the current session. The opencode SDK exposes these
  on `Message.tokens`; we read them through `client.session.messages`
  during `turnFinished` and pass a normalized snapshot to the runtime.
  Cache channels (`tokens.cache.read`, `tokens.cache.write`) are
  ignored, matching the Pi adapter.

**Rationale**
- The portable runtime already accepts normalized `{ totalTokens }`
  snapshots, so we do not need to change the runtime.
- Pi and opencode expose the same channels, so we can share the
  normalizer across adapters.

**Alternative rejected**
- Calling opencode's per-session cost endpoint. Rejected because it
  conflates cost with usage, and the portable runtime expects usage.

### D7. Mirror store is optional for the opencode adapter (V1)

**Choice**
- V1 of the opencode adapter uses only the portable `SQLiteGoalStore`
  as canonical state. The Pi bridge's `PiSessionGoalMirrorStore` is
  not used; opencode sessions are identified by their
  `sessionID`, and goal metadata is recovered from the SQLite store by
  mapping `sessionID -> sessionKey`.

**Rationale**
- OpenCode does not have a "custom session entry" concept like Pi.
  Mirroring into opencode's session file would require a custom schema
  that the runtime does not need.
- A future change can introduce a mirror that writes the same
  `agent-goal-runtime-state` shape into a sidecar JSONL if opencode
  adds an export hook.

**Alternative rejected**
- Reusing `PiSessionGoalMirrorStore` verbatim. Rejected because it
  hard-codes `pi.appendEntry` semantics.

### D8. File-based multi-node DAG loading via `/goal --dag <path>`

**Choice**
- The opencode adapter reuses `parseGoalDagFileContent` from the
  portable core. `/goal --dag <path>` reads the JSON file, treats the
  file's `objective` as the goal objective, and calls
  `runtime.planGoalDagFromFileDocument(goalId, dagDocument, ...)` to
  plan the DAG nodes. The objective may not also be passed on the
  command line; only `--tokens` may be supplied alongside `--dag`.

**Rationale**
- The Pi bridge has shipped this surface since PR #33; the opencode
  adapter should expose the same shape so the two harnesses are
  interchangeable for orchestrators.
- Loading the file through the portable loader means the opencode
  adapter automatically picks up the file's `modelRouting` block.

**Alternative rejected**
- Parsing the DAG file in the opencode adapter. Rejected because it
  would duplicate the portable schema validation.

### D9. Model routing by scenario mirrors the Pi bridge

**Choice**
- The opencode adapter accepts `--model`, `--model-routing`, and
  `--model-routing-file` flags on the `/goal` command and reads
  `AGENT_GOAL_MODEL_ROUTING_FILE` / `AGENT_GOAL_MODEL_ROUTING_JSON`
  env vars. The DAG file's `modelRouting` block is merged on top of
  any env / flag / file config. The controller model is resolved
  through `resolveOpencodeControllerModel`, and each subagent node
  resolves its model through `selectOpencodeSubagentModel`. Resolved
  models are passed to the opencode `session.prompt` body as
  `model: { providerID, modelID }`.

**Rationale**
- The Pi bridge's per-DAG-node model routing is the canonical pattern
  the opencode adapter should mirror, so cross-harness orchestrators
  can use the same routing config across both adapters.
- The opencode SDK's `session.prompt` body has a `model` field that
  accepts `{ providerID, modelID }`, so we can pass the resolved
  model without touching the SDK surface.

**Alternative rejected**
- Spawning `opencode serve --model <id>` on the subagent launcher.
  Rejected because the opencode CLI does not accept a `--model` flag
  on `serve`; model selection must happen per-prompt.

### D10. Controller closeout mirrors `finalizeAndCleanupPiGoalIfDagTerminal`

**Choice**
- The opencode adapter's controller poll loop detects terminal DAG
  state and calls `finalizeOpencodeGoalFromDagTerminalState`, which
  in turn calls `runtime.finalizeGoalFromDagTerminalState` and
  `cleanupTerminalSubagentWorkspaces`. The detached opencode
  background session is stopped; the controller worktree is removed
  when the opencode adapter auto-allocated it.

**Rationale**
- PR #34 / PR #35 added durable closeout + workspace cleanup to the
  Pi adapter; the opencode adapter should expose the same behaviour
  so the two harnesses leave comparable disk and process footprints.
- A small adapter-local wrapper (`src/adapters/opencode/closeout.ts`)
  keeps the closeout policy testable without touching the core.

**Alternative rejected**
- Calling `finalizeGoalFromDagTerminalState` and
  `cleanupTerminalSubagentWorkspaces` directly from the plugin.
  Rejected because the adapter needs to also stop the background
  session and format diagnostics, and a thin wrapper makes that
  testable in isolation.

## Risks / Trade-offs

- The `@opencode-ai/plugin` SDK is at `1.3.15` and not declared as a
  runtime peer-dep; we depend on its types via a local shim
  (`src/adapters/opencode/shims.d.ts`) so the package builds without
  it. The runtime adapter only references the SDK through the
  injected `client`/`$` parameters, so the shim is sufficient.
- The TUI command API lives behind an optional peer dep
  (`@opentui/solid`); we type-guard on `ctx.tui` and silently skip the
  TUI command registration when it is missing, matching the Pi
  bridge's `ctx.hasUI` branching.
- The detached `opencode serve` background launcher assumes a
  `opencode` binary is on the host `PATH` at runtime. We add a smoke
  test that sets a fake launcher to avoid hard-requiring the binary
  in CI.
- The completion audit and blocked audit need to read opencode session
  files. We document the file format expectation in
  `session-transcript.ts` and add a fallback path that uses
  `client.session.messages` when the file is not readable.

## Migration Plan

1. Land the new `src/adapters/opencode/` package behind
   `./opencode` and `./opencode/subagent-adapter` exports in
   `package.json`. Existing `dist/adapters/pi/*` paths are
   byte-compatible.
2. Update `package.json` to add an optional
   `opencode`-themed peer-deps block and a `keywords` entry
   ("opencode-plugin"). No existing dependencies change.
3. Update `README.md` and `docs/adapter-contract.md` with the
   "OpenCode bridge" section, mirroring the "Pi bridge" section.
4. Run `npm run check` and confirm the existing Pi tests still pass.
5. Add a smoke command in `package.json`:
   `node -e "import('./dist/adapters/opencode/index.js').then(m => console.log(typeof m.opencodeGoalPlugin))"`
   so users can verify the plugin loads.

## Open Questions

- Should the opencode adapter also register a `goal_list` and
  `goal_monitor` TUI route for in-TUI browsing of the goal
  registry? Tracked as a follow-up change; V1 exposes them through
  tools only.
- Should we mirror goal snapshots into opencode session metadata
  (via `client.session.update({ title: ... })`)? Tracked as a
  follow-up; V1 keeps opencode session state untouched.
