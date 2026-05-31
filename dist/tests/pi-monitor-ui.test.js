import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalMonitorController, readGoalTranscriptLines } from "../adapters/pi/monitor-ui.js";
function summary(status = "active", sessionFile) {
    return {
        sessionKey: "s1",
        goalId: "abcdef123456",
        shortGoalId: "abcdef12",
        objective: "monitor goal",
        objectiveSummary: "monitor goal",
        status,
        activityState: status === "active" ? "idle-eligible" : status,
        tokensUsed: 1,
        timeUsedSeconds: 2,
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
        lastActivityAt: "2026-05-31T00:00:00.000Z",
        executionWorkspace: "/workspace",
        workspaceStatus: "configured",
        branch: "feat/a",
        branchVerificationStatus: "verified",
        sessionFile,
    };
}
test("goal monitor escape closes without lifecycle action", () => {
    const controller = new GoalMonitorController(summary());
    assert.deepEqual(controller.handleInput("\x1b"), { kind: "close" });
});
test("goal monitor exposes state-appropriate lifecycle actions", () => {
    const active = new GoalMonitorController(summary("active"));
    const paused = new GoalMonitorController(summary("paused"));
    assert.deepEqual(active.actions, ["pause", "clear", "close"]);
    assert.deepEqual(paused.actions, ["resume", "clear", "close"]);
    assert.deepEqual(active.handleInput("\r"), { kind: "action", action: "pause" });
});
test("goal monitor reads transcript lines without mutating session file", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-monitor-"));
    const sessionFile = join(dir, "session.jsonl");
    try {
        writeFileSync(sessionFile, [
            JSON.stringify({ type: "session", id: "s", cwd: dir, timestamp: "2026-05-31T00:00:00.000Z" }),
            JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
            JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }),
        ].join("\n"));
        assert.deepEqual(readGoalTranscriptLines(sessionFile), ["user: hello", "assistant: done"]);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
//# sourceMappingURL=pi-monitor-ui.test.js.map