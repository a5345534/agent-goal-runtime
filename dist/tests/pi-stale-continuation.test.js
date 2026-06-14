import test from "node:test";
import assert from "node:assert/strict";
import { extractGoalContinuationMetadataFromText, rewriteQueuedGoalContinuationMessages as rewritePiMessages, } from "../adapters/pi/index.js";
const goal = {
    sessionKey: "s1",
    goalId: "goal-current",
    objective: "finish",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    goalTurnsSinceAuditReset: 0,
};
test("extracts continuation metadata from Pi hidden continuation marker", () => {
    const metadata = extractGoalContinuationMetadataFromText('<agent_goal_continuation goal_id="goal-current" goal_updated_at="2026-05-31T00:00:00.000Z" attempt_id="a1">\nContinue');
    assert.deepEqual(metadata, {
        goalId: "goal-current",
        goalUpdatedAt: "2026-05-31T00:00:00.000Z",
        attemptId: "a1",
    });
});
test("rewrites stale Pi continuation messages instead of leaving them runnable", () => {
    const messages = [
        {
            role: "custom",
            customType: "goal-runner",
            content: "Continue old",
            details: { kind: "goal_continuation", goalId: "goal-old", goalUpdatedAt: "old" },
        },
    ];
    const result = rewritePiMessages(messages, goal);
    assert.equal(result.changed, true);
    assert.equal(result.messages[0]?.details?.kind, "stale_goal_continuation");
    assert.match(String(result.messages[0]?.content), /stale/);
});
test("rewrites legacy Pi continuation message types", () => {
    const messages = [
        {
            role: "custom",
            customType: "agent-goal-runtime",
            content: "Continue old legacy",
            details: { kind: "goal_continuation", goalId: "goal-old", goalUpdatedAt: "old" },
        },
    ];
    const result = rewritePiMessages(messages, goal);
    assert.equal(result.changed, true);
    assert.equal(result.messages[0]?.details?.kind, "stale_goal_continuation");
});
test("supersedes older active Pi continuations and keeps the newest runnable", () => {
    const messages = [
        {
            role: "custom",
            customType: "goal-runner",
            content: "old current",
            details: { kind: "goal_continuation", goalId: goal.goalId, goalUpdatedAt: goal.updatedAt, attemptId: "a1" },
        },
        {
            role: "custom",
            customType: "goal-runner",
            content: "new current",
            details: { kind: "goal_continuation", goalId: goal.goalId, goalUpdatedAt: goal.updatedAt, attemptId: "a2" },
        },
    ];
    const result = rewritePiMessages(messages, goal);
    assert.equal(result.changed, true);
    assert.equal(result.messages[0]?.details?.kind, "superseded_goal_continuation");
    assert.equal(result.messages[1]?.content, "new current");
});
//# sourceMappingURL=pi-stale-continuation.test.js.map