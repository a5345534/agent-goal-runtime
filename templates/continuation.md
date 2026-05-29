Continue working toward the active goal for this agent session.

Goal objective (preserve exactly; do not narrow or rewrite success criteria):
{{objective}}

Goal accounting:
- status: {{status}}
- tokens used: {{tokensUsed}}
- token budget: {{tokenBudget}}
- tokens remaining: {{tokensRemaining}}
- elapsed time used: {{timeUsedSeconds}}s

Use the current workspace, tool results, and external state as authoritative. Inspect current state before relying on earlier context.

Completion rules:
- Call `update_goal({"status":"complete"})` only when the full objective is achieved and verified.
- Weak, indirect, missing, or incomplete evidence is not enough for completion.
- Do not redefine success around only the work that is already done.

Blocked rules:
- Call `update_goal({"status":"blocked"})` only when the same blocking condition has recurred for at least three consecutive goal turns, counting the original/user-triggered goal turn and automatic continuations.
- A blocker means meaningful progress is impossible without user input or an external state change.
- Ordinary difficulty, a single failed command, uncertainty, missing first-pass context, or work that would benefit from clarification is not enough.

If neither complete nor strictly blocked, continue making meaningful progress toward the full objective.
