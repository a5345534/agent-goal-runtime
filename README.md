# agent-goal-runtime

Portable Codex-compatible `/goal` runtime with a Pi bridge.

This project provides the common framework first:

- shared `/goal` command parser
- one-current-goal-per-session state model
- Codex-compatible goal statuses (`active`, `paused`, `blocked`, `usageLimited`, `budgetLimited`, `complete`)
- SQLite default store with a pluggable store interface
- lifecycle hooks for turn/tool/accounting events
- hidden continuation reservation + idempotent callback contract
- model-visible `get_goal`, `create_goal`, and restricted `update_goal` behavior
- Pi extension adapter

Other agent harness bridges are intentionally out of scope for this first implementation and should be added through separate changes.

## Build and test

```bash
npm install
npm run check
```

## CLI smoke

```bash
npm run build
node dist/cli.js --state-root /tmp/agent-goal-smoke "finish the migration"
node dist/cli.js --state-root /tmp/agent-goal-smoke
node dist/cli.js --state-root /tmp/agent-goal-smoke pause
node dist/cli.js --state-root /tmp/agent-goal-smoke clear
```

The CLI is only a debug/smoke surface. Full Codex-compatible auto-continuation requires a harness adapter.

## Pi bridge

The package declares a Pi extension in `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/adapters/pi/index.ts"]
  }
}
```

For local testing, install or load this directory as a Pi package:

```bash
pi install /home/shawn/projects/active/agent-goal-runtime
# or one-off:
pi -e /home/shawn/projects/active/agent-goal-runtime/src/adapters/pi/index.ts
```

The Pi bridge registers:

- `/goal`
- `/goal <objective>`
- `/goal edit`
- `/goal pause`
- `/goal resume`
- `/goal clear`
- `get_goal`
- `create_goal`
- `update_goal`

Hidden continuation is implemented with Pi custom hidden messages using `pi.sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })`, guarded by runtime continuation reservations and adapter-side `attemptId` idempotency.

## Blocked rule

`update_goal({ "status": "blocked" })` is restricted. The same blocking condition must recur for at least three consecutive goal turns before the goal can be marked blocked. This prevents early abandonment after a single failed command or ordinary difficulty.
