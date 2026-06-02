import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalRuntime, MemoryGoalStore, SQLiteGoalStore, } from "../core/index.js";
const now = "2026-06-02T00:00:00.000Z";
function node(overrides = {}) {
    return {
        goalId: "goal-1",
        nodeId: "attendance-doctypes",
        slug: "implement-attendance-doctypes",
        objective: "Add Attendance DocType skeletons",
        scope: "attendance",
        dependencyNodeIds: [],
        expectedOutputs: ["src/attendance/**"],
        validators: ["npm test"],
        workspaceStrategy: "native-git-worktree",
        risk: "medium",
        conflictHints: { files: ["src/attendance/**"], modules: ["attendance"], capabilities: ["people-frappe-backend"] },
        completionGates: ["tests-pass", "controller-review"],
        status: "planned",
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
function subagent(overrides = {}) {
    return {
        goalId: "goal-1",
        nodeId: "attendance-doctypes",
        subagentId: "subagent-1",
        harnessAdapterId: "pi",
        sessionId: "session-1",
        sessionFile: "/sessions/session-1.jsonl",
        workspacePath: "/repo/.worktrees/implement-attendance-doctypes",
        branch: "feat/implement-attendance-doctypes",
        status: "running",
        prompts: ["Implement attendance doctypes"],
        lastActivityAt: now,
        selfReportedResult: undefined,
        controllerValidationResults: ["pending"],
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
test("memory store persists durable goal DAG nodes and subagent registry records", async () => {
    const runtime = new GoalRuntime({ store: new MemoryGoalStore() });
    const first = node();
    const second = node({
        nodeId: "payroll-doctypes",
        slug: "implement-payroll-doctypes",
        objective: "Add Payroll DocType skeletons",
        dependencyNodeIds: ["attendance-doctypes"],
        createdAt: "2026-06-02T00:00:01.000Z",
        updatedAt: "2026-06-02T00:00:01.000Z",
    });
    await runtime.saveGoalDagNode(first);
    await runtime.saveGoalDagNode(second);
    await runtime.saveGoalSubagent(subagent());
    const state = await runtime.getGoalOrchestrationState("goal-1");
    assert.deepEqual(state.nodes.map((item) => item.nodeId), ["attendance-doctypes", "payroll-doctypes"]);
    assert.deepEqual(state.nodes[1]?.dependencyNodeIds, ["attendance-doctypes"]);
    assert.deepEqual(state.subagents.map((item) => item.subagentId), ["subagent-1"]);
    // Returned values are defensive copies.
    state.nodes[0]?.dependencyNodeIds.push("mutated");
    state.subagents[0]?.prompts.push("mutated");
    assert.deepEqual((await runtime.getGoalDagNode("goal-1", "attendance-doctypes"))?.dependencyNodeIds, []);
    assert.deepEqual((await runtime.getGoalSubagent("goal-1", "subagent-1"))?.prompts, ["Implement attendance doctypes"]);
});
test("sqlite store persists orchestration state across reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-orchestration-state-"));
    const dbPath = join(dir, "goals.sqlite");
    try {
        const firstStore = new SQLiteGoalStore({ dbPath });
        const firstRuntime = new GoalRuntime({ store: firstStore });
        await firstRuntime.saveGoalDagNode(node({ status: "ready", lastValidationSummary: "not validated yet" }));
        await firstRuntime.saveGoalSubagent(subagent({
            status: "selfReportedComplete",
            selfReportedResult: "implemented and tested",
            controllerValidationResults: ["npm test passed", "controller review pending"],
            commitSha: "abc123",
        }));
        firstStore.close();
        const secondStore = new SQLiteGoalStore({ dbPath });
        const secondRuntime = new GoalRuntime({ store: secondStore });
        const state = await secondRuntime.getGoalOrchestrationState("goal-1");
        assert.equal(state.nodes.length, 1);
        assert.equal(state.nodes[0]?.status, "ready");
        assert.deepEqual(state.nodes[0]?.conflictHints?.modules, ["attendance"]);
        assert.equal(state.subagents.length, 1);
        assert.equal(state.subagents[0]?.status, "selfReportedComplete");
        assert.deepEqual(state.subagents[0]?.controllerValidationResults, ["npm test passed", "controller review pending"]);
        assert.equal(state.subagents[0]?.commitSha, "abc123");
        secondStore.close();
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
//# sourceMappingURL=orchestration-state.test.js.map